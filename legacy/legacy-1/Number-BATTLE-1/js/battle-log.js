import { HAND_LABELS, formatHandValue, formatHandsState, safeCloneHighlight } from './utils.js';

function clampIndex(index, length) {
	return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

export class BattleLogManager {
	constructor({
		onUpdate,
		onReveal,
		animationController,
		reviewHandElements,
		battleReviewSummary,
		battleReviewDetail,
		battleReviewState,
		battleReviewStep,
		battleReviewPrev,
		battleReviewNext,
		battleReviewFirst,
		battleReviewLast
	}) {
		this.entries = [];
		this.reviewIndex = 0;
		this.onUpdate = onUpdate;
		this.onReveal = onReveal;
		this.animationController = animationController;
		this.reviewHandElements = reviewHandElements;
		this.battleReviewSummary = battleReviewSummary;
		this.battleReviewDetail = battleReviewDetail;
		this.battleReviewState = battleReviewState;
		this.battleReviewStep = battleReviewStep;
		this.battleReviewPrev = battleReviewPrev;
		this.battleReviewNext = battleReviewNext;
		this.battleReviewFirst = battleReviewFirst;
		this.battleReviewLast = battleReviewLast;
	}

	reset(initialState) {
		this.entries = [
			{
				turnNumber: 0,
				actor: null,
				action: 'start',
				summary: 'ゲーム開始',
				detail: '初期状態',
				stateBefore: initialState,
				stateAfter: initialState,
				highlight: []
			}
		];
		this.reviewIndex = 0;
		this.renderHands(initialState, []);
		this.updateUI();
	}

	push(entry) {
		const normalized = { ...entry };
		normalized.highlight = Array.isArray(normalized.highlight) ? normalized.highlight : [];
		this.entries.push(normalized);
	}

	clampReviewIndex(target) {
		if (!this.entries.length) {
			this.reviewIndex = 0;
			return;
		}
		this.reviewIndex = clampIndex(target, this.entries.length);
	}

	async displayCurrentEntry({ animate = true } = {}) {
		const entry = this.entries[this.reviewIndex];
		const token = this.animationController?.incrementToken?.() ?? 0;
		if (!entry) {
			this.renderHands({ player: [1, 1], cpu: [1, 1] }, []);
			return;
		}

		const actionable = animate && entry.stateBefore && entry.stateAfter && ['attack', 'split', 'split-single'].includes(entry.action);
		if (!actionable) {
			this.renderHands(entry.stateAfter, entry.highlight);
			return;
		}

		this.renderHands(entry.stateBefore, entry.highlight);
		await new Promise(resolve => setTimeout(resolve, 40));
		if ((this.animationController?.currentToken?.() ?? 0) !== token) return;

		if (entry.action === 'attack') {
			const sourceInfo = (entry.highlight || []).find(h => h.role === 'source');
			const targetInfo = (entry.highlight || []).find(h => h.role === 'target');
			if (sourceInfo && targetInfo) {
				const sourceEl = this.reviewHandElements[sourceInfo.owner]?.[sourceInfo.index];
				const targetEl = this.reviewHandElements[targetInfo.owner]?.[targetInfo.index];
				const attackValue = entry.stateBefore?.[sourceInfo.owner]?.[sourceInfo.index];
				if (sourceEl && targetEl && typeof attackValue === 'number') {
					await this.animationController?.playAttackAnimation(sourceEl, targetEl, {
						actor: entry.actor || sourceInfo.owner,
						value: attackValue
					});
				} else {
					await new Promise(resolve => setTimeout(resolve, 200));
				}
			} else {
				await new Promise(resolve => setTimeout(resolve, 200));
			}
		} else {
			const owner = entry.actor || (entry.highlight && entry.highlight[0]?.owner) || 'player';
			const beforeValues = entry.stateBefore?.[owner] || [];
			const afterValues = entry.stateAfter?.[owner] || [];
			await this.animationController?.playSplitAnimation(owner, beforeValues, afterValues, { handRefs: this.reviewHandElements[owner] });
		}

		if ((this.animationController?.currentToken?.() ?? 0) !== token) return;
		this.renderHands(entry.stateAfter, entry.highlight);
	}

	renderHands(state, highlight = []) {
		if (!this.reviewHandElements.player?.[0] || !this.reviewHandElements.cpu?.[0]) return;
		const normalizedHighlight = Array.isArray(highlight) ? highlight : [];
		['player', 'cpu'].forEach(owner => {
			this.reviewHandElements[owner].forEach((el, index) => {
				if (!el) return;
				el.classList.remove('review-highlight-source', 'review-highlight-target', 'review-highlight-result', 'selectable', 'selected', 'targetable');
				const ownerState = state?.[owner] || [];
				const value = ownerState[index] ?? 0;
				const isDead = (value === 0 || value === 5);
				el.classList.toggle('dead', isDead);
				const fingerCountEl = el.querySelector('.finger-count');
				if (fingerCountEl) fingerCountEl.textContent = formatHandValue(value);
			});
		});
		normalizedHighlight.forEach(item => {
			const el = this.reviewHandElements[item.owner]?.[item.index];
			if (!el) return;
			switch (item.role) {
				case 'source':
					el.classList.add('review-highlight-source');
					break;
				case 'target':
					el.classList.add('review-highlight-target');
					break;
				default:
					el.classList.add('review-highlight-result');
			}
		});
	}

	async updateUI() {
		if (typeof this.onUpdate === 'function') {
			this.onUpdate(this.entries);
		}
		const entry = this.entries[this.reviewIndex];
		if (!entry) {
			if (this.battleReviewSummary) this.battleReviewSummary.textContent = '';
			if (this.battleReviewDetail) {
				this.battleReviewDetail.textContent = '';
				this.battleReviewDetail.classList.add('hidden');
			}
			if (this.battleReviewState) this.battleReviewState.textContent = '';
			if (this.battleReviewStep) this.battleReviewStep.textContent = '';
			if (this.battleReviewPrev) this.battleReviewPrev.disabled = true;
			if (this.battleReviewNext) this.battleReviewNext.disabled = true;
			if (this.battleReviewFirst) this.battleReviewFirst.disabled = true;
			if (this.battleReviewLast) this.battleReviewLast.disabled = true;
			this.renderHands({ player: [1, 1], cpu: [1, 1] }, []);
			return;
		}

		if (this.battleReviewSummary) this.battleReviewSummary.textContent = entry.summary;
		if (this.battleReviewDetail) {
			if (entry.detail) {
				this.battleReviewDetail.textContent = entry.detail;
				this.battleReviewDetail.classList.remove('hidden');
			} else {
				this.battleReviewDetail.textContent = '';
				this.battleReviewDetail.classList.add('hidden');
			}
		}
		if (this.battleReviewState) this.battleReviewState.textContent = formatHandsState(entry.stateAfter);
		if (this.battleReviewStep) this.battleReviewStep.textContent = `${this.reviewIndex + 1} / ${this.entries.length}`;
		if (this.battleReviewPrev) this.battleReviewPrev.disabled = this.reviewIndex === 0;
		if (this.battleReviewNext) this.battleReviewNext.disabled = this.reviewIndex === this.entries.length - 1;
		if (this.battleReviewFirst) this.battleReviewFirst.disabled = this.reviewIndex === 0;
		if (this.battleReviewLast) this.battleReviewLast.disabled = this.reviewIndex === this.entries.length - 1;
		await this.displayCurrentEntry({ animate: true });
	}

	reveal() {
		if (typeof this.onReveal === 'function') {
			this.onReveal();
		}
		this.clampReviewIndex(this.entries.length - 1);
		this.updateUI();
	}

	getEntries() {
		return this.entries.map(entry => ({
			turnNumber: entry.turnNumber,
			actor: entry.actor,
			action: entry.action,
			summary: entry.summary,
			detail: entry.detail,
			stateBefore: entry.stateBefore,
			stateAfter: entry.stateAfter,
			highlight: safeCloneHighlight(entry.highlight)
		}));
	}

	setReviewIndex(index) {
		this.clampReviewIndex(index);
		return this.updateUI();
	}

	stepReview(delta) {
		this.clampReviewIndex(this.reviewIndex + delta);
		return this.updateUI();
	}
}
