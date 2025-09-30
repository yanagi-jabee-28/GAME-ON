import { HAND_LABELS, formatHandValue } from './utils.js';
import { wrapTo1to5, computeHintForState } from '../ai-core.js';

export class HintManager {
	constructor({
		turnAccessor,
		gameStateAccessor,
		stateKeyProvider,
		stateSnapshotProvider,
		applyHintResultCallback,
		clearHighlightsCallback,
		setMessageCallback,
		updateButtonStateCallback
	}) {
		this.turnAccessor = turnAccessor;
		this.gameStateAccessor = gameStateAccessor;
		this.stateKeyProvider = stateKeyProvider;
		this.stateSnapshotProvider = stateSnapshotProvider;
		this.applyHintResult = applyHintResultCallback;
		this.clearHighlights = clearHighlightsCallback;
		this.setMessage = setMessageCallback;
		this.updateButtonState = updateButtonStateCallback;
		this.hintCacheKey = null;
		this.hintCacheResult = null;
		this.hintComputationId = 0;
		this.hintRequested = false;
		this.hintComputing = false;
		this.handsAccessor = null;
	}

	setHandsAccessor(accessor) {
		this.handsAccessor = accessor;
	}

	invalidateCache() {
		this.hintComputationId++;
		this.hintCacheKey = null;
		this.hintCacheResult = null;
		this.hintComputing = false;
	}

	hasHint() {
		return Boolean(this.hintCacheResult);
	}

	setHintRequested(requested) {
		this.hintRequested = requested;
	}

	isHintRequested() {
		return this.hintRequested;
	}

	setComputing(isComputing) {
		this.hintComputing = isComputing;
	}

	isComputing() {
		return this.hintComputing;
	}

	resetUI() {
		this.clearHighlights?.();
		this.setMessage?.('');
		this.updateButtonState?.();
	}

	updateButton() {
		this.updateButtonState?.();
	}

	describeHintMove(move, hands) {
		if (!move) return '行動候補が見つかりません。';
		if (move.type === 'attack') {
			const srcLabel = HAND_LABELS[move.src] || `手${move.src + 1}`;
			const dstLabel = HAND_LABELS[move.dst] || `手${move.dst + 1}`;
			const sourceValueRaw = hands.player?.[move.src];
			const targetValueRaw = hands.cpu?.[move.dst];
			const srcValue = typeof sourceValueRaw === 'number' ? formatHandValue(sourceValueRaw) : '?';
			const dstValue = typeof targetValueRaw === 'number' ? formatHandValue(targetValueRaw) : '?';
			let resultValue = '?';
			if (typeof sourceValueRaw === 'number' && typeof targetValueRaw === 'number') {
				resultValue = formatHandValue(wrapTo1to5(sourceValueRaw + targetValueRaw));
			}
			return `あなたの${srcLabel} (${srcValue}) → CPUの${dstLabel} (${dstValue}) = ${resultValue}`;
		}
		if (move.type === 'split') {
			return `あなたの手を ${move.left} と ${move.right} に分ける`;
		}
		return '行動候補が見つかりません。';
	}

	buildHintMessage(result, hands) {
		if (!result || !result.firstMove) {
			return '有効なヒントが見つかりません。';
		}
		const moveText = this.describeHintMove(result.firstMove, hands);
		const steps = Number.isFinite(result.steps) ? Math.max(1, Math.ceil(result.steps / 2)) : null;
		switch (result.outcome) {
			case 'win':
				return steps ? `勝ち筋 (${steps}手以内): ${moveText}` : `勝ち筋: ${moveText}`;
			case 'draw':
				return `安全策: ${moveText}（引き分け以上を確保）`;
			case 'loop':
				return `ループ維持: ${moveText}（同じ局面で粘ります）`;
			case 'lose':
				return steps ? `苦しい展開: ${moveText}（約${steps}手で敗北見込み、遅延推奨）` : `苦しい展開: ${moveText}（敗北を先延ばし）`;
			default:
				return moveText;
		}
	}

	applyResult(result, hands) {
		if (!hands) return;
		if (this.turnAccessor() !== 'player' || this.gameStateAccessor() !== 'playing') {
			this.resetUI();
			return;
		}
		if (!result || !result.firstMove) {
			this.clearHighlights?.();
			this.setMessage?.('有効なヒントが見つかりません。');
			this.updateButtonState?.();
			return;
		}
		const move = result.firstMove;
		this.clearHighlights?.();
		if (move.type === 'attack') {
			this.applyHintResult?.({ type: 'attack', move });
		} else if (move.type === 'split') {
			this.applyHintResult?.({ type: 'split', move });
		}
		this.setMessage?.(this.buildHintMessage(result, hands));
		this.updateButtonState?.();
	}

	refresh({ force = false } = {}) {
		const shouldCompute = this.hintRequested && this.gameStateAccessor() === 'playing' && this.turnAccessor() === 'player';
		if (!shouldCompute) {
			this.resetUI();
			return;
		}
		const stateKey = this.stateKeyProvider();
		if (!force && this.hintCacheKey === stateKey && this.hintCacheResult) {
			this.applyResult(this.hintCacheResult, this.handsAccessor?.());
			return;
		}
		this.hintComputing = true;
		this.updateButtonState?.();
		this.clearHighlights?.();
		this.setMessage?.('ヒント計算中...');
		const computationId = ++this.hintComputationId;
		const snapshot = this.stateSnapshotProvider();
		setTimeout(() => {
			let hint = null;
			try {
				hint = computeHintForState(snapshot);
			} catch (err) {
				console.error('Hint computation failed', err);
				if (this.hintComputationId === computationId) {
					this.hintComputing = false;
					this.setMessage?.('ヒント計算に失敗しました');
					this.updateButtonState?.();
				}
				return;
			}
			if (this.hintComputationId !== computationId) return;
			this.hintComputing = false;
			this.hintCacheKey = stateKey;
			this.hintCacheResult = hint;
			this.updateButtonState?.();
			this.applyResult(hint, this.handsAccessor?.());
		}, 0);
	}
}
