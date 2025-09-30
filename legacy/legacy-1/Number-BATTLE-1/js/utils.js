export const HAND_LABELS = ['左手', '右手'];

export function getNowMs() {
	return (typeof performance !== 'undefined' && performance.now)
		? performance.now()
		: Date.now();
}

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function getActorLabel(actor) {
	if (actor === 'player') return 'あなた';
	if (actor === 'cpu') return 'CPU';
	return '';
}

export function formatHandValue(value) {
	return (value === 0 || value === 5) ? 'X' : value;
}

export function formatHandsState(state) {
	const playerLeft = formatHandValue(state.player?.[0]);
	const playerRight = formatHandValue(state.player?.[1]);
	const cpuLeft = formatHandValue(state.cpu?.[0]);
	const cpuRight = formatHandValue(state.cpu?.[1]);
	return `あなた: 左 ${playerLeft} / 右 ${playerRight}\u3000|\u3000CPU: 左 ${cpuLeft} / 右 ${cpuRight}`;
}

export function safeCloneHandArray(source) {
	if (!Array.isArray(source)) return [0, 0];
	const left = Number.isFinite(source[0]) ? source[0] : 0;
	const right = Number.isFinite(source[1]) ? source[1] : 0;
	return [left, right];
}

export function safeCloneBattleState(state) {
	if (!state || typeof state !== 'object') {
		return { player: [0, 0], cpu: [0, 0] };
	}
	return {
		player: safeCloneHandArray(state.player),
		cpu: safeCloneHandArray(state.cpu)
	};
}

export function safeCloneHighlight(list) {
	if (!Array.isArray(list)) return [];
	return list.map(item => {
		if (!item || typeof item !== 'object') return null;
		const cloned = {};
		if (typeof item.owner === 'string') cloned.owner = item.owner;
		if (typeof item.index === 'number') cloned.index = item.index;
		if (typeof item.role === 'string') cloned.role = item.role;
		return cloned;
	}).filter(Boolean);
}

export function cloneBattleLogEntries(entries) {
	if (!Array.isArray(entries)) return [];
	return entries.map(entry => {
		if (!entry || typeof entry !== 'object') return null;
		return {
			turnNumber: Number.isFinite(entry.turnNumber) ? entry.turnNumber : null,
			actor: typeof entry.actor === 'string' || entry.actor === null ? entry.actor : null,
			action: typeof entry.action === 'string' ? entry.action : null,
			summary: typeof entry.summary === 'string' ? entry.summary : '',
			detail: typeof entry.detail === 'string' ? entry.detail : '',
			stateBefore: safeCloneBattleState(entry.stateBefore),
			stateAfter: safeCloneBattleState(entry.stateAfter),
			highlight: safeCloneHighlight(entry.highlight)
		};
	}).filter(Boolean);
}

export function generateBattleRecordId(prefix = 'battle') {
	const randomPart = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${Date.now()}-${randomPart}`;
}
