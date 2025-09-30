import { getCpuModeLabel } from './constants.js';
import { cloneBattleLogEntries, generateBattleRecordId } from './utils.js';

function detectStorageAvailability(storageKey) {
	try {
		if (typeof localStorage === 'undefined') return false;
		const testKey = `${storageKey}__test__`;
		localStorage.setItem(testKey, '1');
		localStorage.removeItem(testKey);
		return true;
	} catch (err) {
		console.warn('Local storage unavailable', err);
		return false;
	}
}

export class BattleHistoryManager {
	constructor({
		storageKey,
		version,
		limit
	}) {
		this.storageKey = storageKey;
		this.version = version;
		this.limit = limit;
		this.storageAvailable = detectStorageAvailability(storageKey);
	}

	isStorageAvailable() {
		return this.storageAvailable;
	}

	load() {
		if (!this.storageAvailable) return [];
		try {
			const raw = localStorage.getItem(this.storageKey);
			if (!raw) return [];
			const parsed = JSON.parse(raw);
			const source = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.battles) ? parsed.battles : []);
			return source.map(entry => this.#normalize(entry)).filter(Boolean);
		} catch (err) {
			console.error('Failed to load battle history', err);
			return [];
		}
	}

	save(entries) {
		if (!this.storageAvailable) return;
		try {
			const payload = JSON.stringify(entries, null, 2);
			localStorage.setItem(this.storageKey, payload);
		} catch (err) {
			console.error('Failed to save battle history', err);
			throw err;
		}
	}

	buildRecord({
		battleLog,
		result,
		turnCount,
		timerSeconds,
		gameStartedTimestamp,
		initialTurn,
		cpuMode,
		gameSessionId
	}) {
		if (!Array.isArray(battleLog) || battleLog.length === 0) return null;
		const finishedAt = new Date().toISOString();
		const startedAt = gameStartedTimestamp ? new Date(gameStartedTimestamp).toISOString() : null;
		const winner = result === 'playerWon' ? 'player' : (result === 'playerLost' ? 'cpu' : null);
		return {
			id: gameSessionId || generateBattleRecordId(),
			version: this.version,
			mode: cpuMode,
			modeLabel: getCpuModeLabel(cpuMode),
			result: result || 'undecided',
			winner,
			turnCount,
			durationSeconds: Number.isFinite(timerSeconds) ? timerSeconds : null,
			startedAt,
			finishedAt,
			initialTurn: initialTurn === 'cpu' ? 'cpu' : 'player',
			battleLog: cloneBattleLogEntries(battleLog)
		};
	}

	record(record) {
		if (!this.storageAvailable || !record) return;
		const history = this.load();
		const map = new Map(history.map(entry => [entry.id, entry]));
		map.set(record.id, record);
		let merged = Array.from(map.values());
		merged.sort((a, b) => {
			const aTime = Date.parse(a.finishedAt || '') || 0;
			const bTime = Date.parse(b.finishedAt || '') || 0;
			return aTime - bTime;
		});
		if (merged.length > this.limit) {
			merged = merged.slice(merged.length - this.limit);
		}
		this.save(merged);
		return merged.length;
	}

	exportHistory() {
		if (!this.storageAvailable) {
			throw new Error('ローカルストレージが利用できません');
		}
		const history = this.load();
		if (!history.length) return { count: 0, blob: null, filename: null };
		const payload = {
			version: this.version,
			exportedAt: new Date().toISOString(),
			battles: history
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const timestamp = new Date().toISOString().replace(/[:]/g, '-');
		const filename = `number-battle-history-${timestamp}.json`;
		return { count: history.length, blob, filename };
	}

	async importFromFile(file) {
		if (!this.storageAvailable) {
			throw new Error('ローカルストレージが利用できません');
		}
		const text = await file.text();
		const parsed = JSON.parse(text);
		const source = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.battles) ? parsed.battles : null);
		if (!Array.isArray(source)) {
			throw new Error('戦績データの形式が正しくありません');
		}
		const normalized = source.map(entry => this.#normalize(entry)).filter(Boolean);
		const existing = this.load();
		const map = new Map(existing.map(entry => [entry.id, entry]));
		let added = 0;
		normalized.forEach(entry => {
			if (!map.has(entry.id)) added++;
			map.set(entry.id, entry);
		});
		let merged = Array.from(map.values());
		merged.sort((a, b) => {
			const aTime = Date.parse(a.finishedAt || '') || 0;
			const bTime = Date.parse(b.finishedAt || '') || 0;
			return aTime - bTime;
		});
		if (merged.length > this.limit) {
			merged = merged.slice(merged.length - this.limit);
		}
		this.save(merged);
		return { added, total: merged.length };
	}

	#normalize(record) {
		if (!record || typeof record !== 'object') return null;
		const normalizedMode = typeof record.mode === 'string' ? record.mode : 'strong';
		const result = typeof record.result === 'string' ? record.result : 'undecided';
		const startedAt = typeof record.startedAt === 'string' ? record.startedAt : null;
		const finishedAt = typeof record.finishedAt === 'string' ? record.finishedAt : null;
		const initialTurn = record.initialTurn === 'cpu' ? 'cpu' : 'player';
		const durationSeconds = Number.isFinite(record.durationSeconds) ? record.durationSeconds : null;
		const turnNumber = Number.isFinite(record.turnCount) ? record.turnCount : null;
		const winner = record.winner === 'cpu' ? 'cpu' : (record.winner === 'player' ? 'player' : null);
		return {
			id: typeof record.id === 'string' && record.id ? record.id : generateBattleRecordId('import'),
			version: Number.isFinite(record.version) ? record.version : this.version,
			mode: normalizedMode,
			modeLabel: getCpuModeLabel(normalizedMode),
			result,
			winner,
			turnCount: turnNumber,
			durationSeconds,
			startedAt,
			finishedAt,
			initialTurn,
			battleLog: cloneBattleLogEntries(record.battleLog)
		};
	}
}
