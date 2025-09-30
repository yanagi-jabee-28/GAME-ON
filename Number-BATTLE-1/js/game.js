import {
	CPU_MODE_LABELS,
	CPU_MODE_SEQUENCE,
	HAND_LABELS,
	HINT_MAX_DEPTH,
	INITIAL_HANDS,
	MIN_CPU_THINK_MS
} from './constants.js';
import {
	cloneSnapshot,
	delay,
	formatHandValue,
	formatHandsState,
	formatTime,
	getNowMs,
	isHandDead,
	makeStateKey,
	wrapTo1to5
} from './utils.js';
import { playAttackAnimation, playSplitAnimation } from './animations.js';
import { createAiEngine } from './ai.js';

const GAME_STATUS = {
	IDLE: 'idle',
	PLAYING: 'playing',
	CPU_THINKING: 'cpu_thinking',
	GAME_OVER: 'gameover'
};

const HAND_INDEXES = [0, 1];

function getActorLabel(actor) {
	if (actor === 'player') return 'あなた';
	if (actor === 'cpu') return 'CPU';
	return '';
}

export function createNumberBattleGame(doc = document) {
	const dom = {
		gameContainer: doc.getElementById('game-container'),
		turnIndicator: doc.getElementById('turn-indicator'),
		playerActions: doc.getElementById('player-actions'),
		gameOverScreen: doc.getElementById('game-over-screen'),
		gameOverText: doc.getElementById('game-over-text'),
		restartButton: doc.getElementById('restart-button'),
		startScreen: doc.getElementById('start-screen'),
		startButton: doc.getElementById('start-button'),
		cpuModeDisplay: doc.getElementById('cpu-mode-display'),
		cpuThinkingIndicator: doc.getElementById('cpu-thinking-indicator'),
		turnCounter: doc.getElementById('turn-counter'),
		gameTimer: doc.getElementById('game-timer'),
		hintButton: doc.getElementById('hint-button'),
		hintMessage: doc.getElementById('hint-message'),
		splitModalBackdrop: doc.getElementById('split-modal-backdrop'),
		splitOptionsContainer: doc.getElementById('split-options'),
		splitCancel: doc.getElementById('split-cancel'),
		attackAnimationLayer: doc.getElementById('attack-animation-layer'),
		battleReview: doc.getElementById('battle-review'),
		battleReviewSummary: doc.getElementById('battle-review-summary'),
		battleReviewDetail: doc.getElementById('battle-review-detail'),
		battleReviewState: doc.getElementById('battle-review-state'),
		battleReviewStep: doc.getElementById('battle-review-step'),
		battleReviewPrev: doc.getElementById('battle-review-prev'),
		battleReviewNext: doc.getElementById('battle-review-next'),
		battleReviewFirst: doc.getElementById('battle-review-first'),
		battleReviewLast: doc.getElementById('battle-review-last'),
		cpuModeButtonsStart: Array.from(doc.querySelectorAll('.cpu-mode-btn-start')),
		cpuModeButtonsGameOver: Array.from(doc.querySelectorAll('.cpu-mode-btn-game-over')),
		handElements: {
			player: [doc.getElementById('player-hand-left'), doc.getElementById('player-hand-right')],
			cpu: [doc.getElementById('cpu-hand-left'), doc.getElementById('cpu-hand-right')]
		},
		reviewHandElements: {
			player: [doc.getElementById('review-player-hand-left'), doc.getElementById('review-player-hand-right')],
			cpu: [doc.getElementById('review-cpu-hand-left'), doc.getElementById('review-cpu-hand-right')]
		}
	};

	const ai = createAiEngine({ hintDepth: HINT_MAX_DEPTH });

	const state = {
		hands: cloneSnapshot(INITIAL_HANDS),
		turn: 'player',
		status: GAME_STATUS.IDLE,
		selectedHand: null,
		turnCount: 0,
		cpuMode: 'strong',
		lastResult: null,
		historyKeys: [],
		cpuThinkingStartedAt: null,
		isResolvingAction: false,
		timerSeconds: 0,
		timerId: null,
		hint: {
			requested: false,
			computing: false,
			cacheKey: null,
			cacheResult: null,
			computationId: 0,
			auto: false
		},
		battleLog: [],
		reviewIndex: 0,
		reviewAnimationToken: 0
	};

	function cloneState() {
		return {
			player: [...state.hands.player],
			cpu: [...state.hands.cpu]
		};
	}

	function evaluateCpuHeuristic(snapshot) {
		const enemyAlive = snapshot.player.filter((value) => !isHandDead(value));
		const selfAlive = snapshot.cpu.filter((value) => !isHandDead(value));
		if (enemyAlive.length === 0) return 1e6;
		if (selfAlive.length === 0) return -1e6;

		let score = 0;
		score += (2 - enemyAlive.length) * 1000;
		score -= (2 - selfAlive.length) * 1000;

		let enemyHandScore = 0;
		enemyAlive.forEach((hand) => {
			enemyHandScore += hand === 4 ? 150 : hand * 10;
		});
		score += enemyHandScore;

		let selfHandScore = 0;
		selfAlive.forEach((hand) => {
			selfHandScore += hand === 4 ? 120 : hand * 5;
		});
		score -= selfHandScore;

		const selfSum = selfAlive.reduce((a, b) => a + b, 0);
		if (selfSum > 5) {
			score -= (selfSum - 5) * 20;
		}

		return score;
	}

	function restoreState(snapshot) {
		state.hands.player = [...snapshot.player];
		state.hands.cpu = [...snapshot.cpu];
	}

	function makeCurrentStateKey() {
		return makeStateKey(state.hands, state.turn);
	}

	function resetHintCache() {
		state.hint.computationId += 1;
		state.hint.cacheKey = null;
		state.hint.cacheResult = null;
		state.hint.computing = false;
	}

	function resetBattleLog() {
		const snapshot = cloneState();
		state.battleLog = [{
			turnNumber: 0,
			actor: null,
			action: 'start',
			summary: 'ゲーム開始',
			detail: '初期状態',
			stateBefore: snapshot,
			stateAfter: snapshot,
			highlight: []
		}];
		state.reviewIndex = 0;
		if (dom.battleReview) {
			dom.battleReview.classList.add('hidden');
		}
		renderBattleReviewHands(snapshot, []);
	}

	function pushBattleLog(entry) {
		const normalized = { ...entry };
		normalized.highlight = Array.isArray(normalized.highlight) ? normalized.highlight : [];
		state.battleLog.push(normalized);
	}

	function clampReviewIndex(target) {
		if (!state.battleLog.length) {
			state.reviewIndex = 0;
			return;
		}
		state.reviewIndex = Math.max(0, Math.min(target, state.battleLog.length - 1));
	}

	function renderBattleReviewHands(snapshot, highlight = []) {
		const normalizedState = snapshot || { player: [0, 0], cpu: [0, 0] };
		const normalizedHighlight = Array.isArray(highlight) ? highlight : [];
		['player', 'cpu'].forEach((owner) => {
			dom.reviewHandElements[owner].forEach((el, index) => {
				if (!el) return;
				el.classList.remove(
					'review-highlight-source',
					'review-highlight-target',
					'review-highlight-result',
					'selectable',
					'selected',
					'targetable'
				);
				const ownerState = normalizedState[owner] || [];
				const value = ownerState[index] ?? 0;
				const dead = isHandDead(value);
				el.classList.toggle('dead', dead);
				const fingerCountEl = el.querySelector('.finger-count');
				if (fingerCountEl) fingerCountEl.textContent = formatHandValue(value);
			});
		});
		normalizedHighlight.forEach((item) => {
			const el = dom.reviewHandElements[item.owner]?.[item.index];
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

	async function displayBattleReviewEntry(entry, { animate = true } = {}) {
		const token = ++state.reviewAnimationToken;
		if (!entry) {
			renderBattleReviewHands({ player: [1, 1], cpu: [1, 1] }, []);
			return;
		}

		const actionable =
			animate &&
			entry.stateBefore &&
			entry.stateAfter &&
			['attack', 'split', 'split-single'].includes(entry.action);
		if (!actionable) {
			renderBattleReviewHands(entry.stateAfter, entry.highlight);
			return;
		}

		renderBattleReviewHands(entry.stateBefore, entry.highlight);
		await delay(40);
		if (token !== state.reviewAnimationToken) return;

		if (entry.action === 'attack') {
			const sourceInfo = (entry.highlight || []).find((h) => h.role === 'source');
			const targetInfo = (entry.highlight || []).find((h) => h.role === 'target');
			if (sourceInfo && targetInfo) {
				const sourceEl = dom.reviewHandElements[sourceInfo.owner]?.[sourceInfo.index];
				const targetEl = dom.reviewHandElements[targetInfo.owner]?.[targetInfo.index];
				const attackValue = entry.stateBefore?.[sourceInfo.owner]?.[sourceInfo.index];
				if (sourceEl && targetEl && typeof attackValue === 'number') {
					await playAttackAnimation(dom.attackAnimationLayer, sourceEl, targetEl, {
						actor: entry.actor || sourceInfo.owner,
						value: attackValue
					});
				} else {
					await delay(200);
				}
			} else {
				await delay(200);
			}
		} else {
			const owner = entry.actor || (entry.highlight && entry.highlight[0]?.owner) || 'player';
			const beforeValues = entry.stateBefore?.[owner] || [];
			const afterValues = entry.stateAfter?.[owner] || [];
			await playSplitAnimation({
				layer: dom.attackAnimationLayer,
				owner,
				beforeValues,
				afterValues,
				handRefs: dom.reviewHandElements[owner],
				fallbackHands: entry.stateBefore
			});
		}

		if (token !== state.reviewAnimationToken) return;
		renderBattleReviewHands(entry.stateAfter, entry.highlight);
	}

	function updateBattleReviewUI() {
		if (!dom.battleReview) return;
		if (!state.battleLog.length) {
			dom.battleReviewSummary.textContent = '';
			dom.battleReviewDetail.textContent = '';
			dom.battleReviewDetail.classList.add('hidden');
			dom.battleReviewState.textContent = '';
			dom.battleReviewStep.textContent = '';
			if (dom.battleReviewPrev) dom.battleReviewPrev.disabled = true;
			if (dom.battleReviewNext) dom.battleReviewNext.disabled = true;
			if (dom.battleReviewFirst) dom.battleReviewFirst.disabled = true;
			if (dom.battleReviewLast) dom.battleReviewLast.disabled = true;
			renderBattleReviewHands({ player: [1, 1], cpu: [1, 1] }, []);
			return;
		}

		const entry = state.battleLog[state.reviewIndex];
		dom.battleReviewSummary.textContent = entry.summary;
		if (entry.detail) {
			dom.battleReviewDetail.textContent = entry.detail;
			dom.battleReviewDetail.classList.remove('hidden');
		} else {
			dom.battleReviewDetail.textContent = '';
			dom.battleReviewDetail.classList.add('hidden');
		}
		dom.battleReviewState.textContent = formatHandsState(entry.stateAfter);
		dom.battleReviewStep.textContent = `${state.reviewIndex + 1} / ${state.battleLog.length}`;
		if (dom.battleReviewPrev) dom.battleReviewPrev.disabled = state.reviewIndex === 0;
		if (dom.battleReviewNext) dom.battleReviewNext.disabled = state.reviewIndex === state.battleLog.length - 1;
		if (dom.battleReviewFirst) dom.battleReviewFirst.disabled = state.reviewIndex === 0;
		if (dom.battleReviewLast) dom.battleReviewLast.disabled = state.reviewIndex === state.battleLog.length - 1;
		displayBattleReviewEntry(entry);
	}

	function revealBattleReview() {
		if (!dom.battleReview) return;
		clampReviewIndex(state.battleLog.length - 1);
		updateBattleReviewUI();
		dom.battleReview.classList.remove('hidden');
	}

	function startTimer() {
		stopTimer();
		state.timerId = setInterval(() => {
			state.timerSeconds += 1;
			if (dom.gameTimer) dom.gameTimer.textContent = `時間: ${formatTime(state.timerSeconds)}`;
		}, 1000);
	}

	function stopTimer() {
		if (state.timerId) {
			clearInterval(state.timerId);
			state.timerId = null;
		}
	}

	function resetTimer() {
		stopTimer();
		state.timerSeconds = 0;
		if (dom.gameTimer) dom.gameTimer.textContent = `時間: ${formatTime(state.timerSeconds)}`;
	}

	function syncCpuModeButtons() {
		const updateGroup = (buttons) => {
			buttons.forEach((button) => {
				button.classList.remove('bg-blue-600', 'bg-gray-700');
				if (button.dataset.mode === state.cpuMode) {
					button.classList.add('bg-blue-600');
				} else {
					button.classList.add('bg-gray-700');
				}
			});
		};
		updateGroup(dom.cpuModeButtonsStart);
		updateGroup(dom.cpuModeButtonsGameOver);
		if (dom.cpuModeDisplay) dom.cpuModeDisplay.textContent = CPU_MODE_LABELS[state.cpuMode] ?? CPU_MODE_LABELS.normal;
	}

	function clearHintHighlights() {
		['player', 'cpu'].forEach((owner) => {
			dom.handElements[owner].forEach((el) => {
				if (!el) return;
				el.classList.remove('hint-source', 'hint-target');
			});
		});
	}

	function setHintMessage(message) {
		if (dom.hintMessage) dom.hintMessage.textContent = message || '';
	}

	function updateHintButton() {
		if (!dom.hintButton) return;
		if (state.status !== GAME_STATUS.PLAYING || state.turn !== 'player') {
			dom.hintButton.disabled = true;
			dom.hintButton.textContent = 'ヒント（あなたのターンで利用可）';
			return;
		}
		if (state.hint.computing) {
			dom.hintButton.disabled = true;
			dom.hintButton.textContent = 'ヒント計算中...';
			return;
		}
		dom.hintButton.disabled = false;
		if (state.hint.auto) {
			dom.hintButton.textContent = '自動ヒント: ON';
		} else if (state.hint.requested && state.hint.cacheResult) {
			dom.hintButton.textContent = 'ヒントを更新';
		} else {
			dom.hintButton.textContent = 'ヒントを見る';
		}
	}

	function clearHintUI() {
		clearHintHighlights();
		setHintMessage('');
		updateHintButton();
	}

	function describeHintMove(move) {
		if (!move) return '行動候補が見つかりません。';
		if (move.type === 'attack') {
			const srcLabel = HAND_LABELS[move.src] || `手${move.src + 1}`;
			const dstLabel = HAND_LABELS[move.dst] || `手${move.dst + 1}`;
			const sourceValueRaw = state.hands.player?.[move.src];
			const targetValueRaw = state.hands.cpu?.[move.dst];
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

	function buildHintMessage(result) {
		if (!result || !result.firstMove) {
			return '有効なヒントが見つかりません。';
		}
		const moveText = describeHintMove(result.firstMove);
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

	function applyHintResult(result) {
		if (state.turn !== 'player' || state.status !== GAME_STATUS.PLAYING) {
			clearHintUI();
			return;
		}
		if (!result || !result.firstMove) {
			clearHintHighlights();
			setHintMessage('有効なヒントが見つかりません。');
			updateHintButton();
			return;
		}
		clearHintHighlights();
		const move = result.firstMove;
		if (move.type === 'attack') {
			dom.handElements.player[move.src]?.classList.add('hint-source');
			dom.handElements.cpu[move.dst]?.classList.add('hint-target');
		} else if (move.type === 'split') {
			dom.handElements.player[0]?.classList.add('hint-source');
			dom.handElements.player[1]?.classList.add('hint-source');
		}
		setHintMessage(buildHintMessage(result));
		updateHintButton();
	}

	function refreshHint({ force = false } = {}) {
		const shouldCompute = state.hint.requested && state.status === GAME_STATUS.PLAYING && state.turn === 'player';
		if (!shouldCompute) {
			clearHintUI();
			return;
		}
		const stateKey = makeCurrentStateKey();
		if (!force && state.hint.cacheKey === stateKey && state.hint.cacheResult) {
			applyHintResult(state.hint.cacheResult);
			return;
		}
		state.hint.computing = true;
		updateHintButton();
		clearHintHighlights();
		setHintMessage('ヒント計算中...');
		const computationId = ++state.hint.computationId;
		const snapshot = cloneState();
		setTimeout(() => {
			let hint = null;
			try {
				hint = ai.computeHint(snapshot);
			} catch (error) {
				console.error('Hint computation failed', error);
				if (state.hint.computationId === computationId) {
					state.hint.computing = false;
					setHintMessage('ヒント計算に失敗しました');
					updateHintButton();
				}
				return;
			}
			if (state.hint.computationId !== computationId) return;
			state.hint.computing = false;
			state.hint.cacheKey = stateKey;
			state.hint.cacheResult = hint;
			updateHintButton();
			applyHintResult(hint);
		}, 0);
	}

	function showCpuThinking(show) {
		if (!dom.cpuThinkingIndicator) return;
		if (state.turn === 'player' || state.status === GAME_STATUS.GAME_OVER) show = false;
		if (show) {
			dom.cpuThinkingIndicator.classList.remove('hidden');
		} else {
			dom.cpuThinkingIndicator.classList.add('hidden');
		}
	}

	function updateHandElements() {
		['player', 'cpu'].forEach((owner) => {
			state.hands[owner].forEach((count, index) => {
				const handEl = dom.handElements[owner][index];
				if (!handEl) return;
				const dead = isHandDead(count);
				handEl.querySelector('.finger-count').textContent = dead ? 'X' : count;
				handEl.classList.toggle('dead', dead);
			});
		});
	}

	function updateSelectionIndicators() {
		doc.querySelectorAll('.hand-container').forEach((el) => {
			el.classList.remove('selectable', 'selected', 'targetable');
			const owner = el.dataset.owner;
			const index = Number(el.dataset.index);
			if (!owner || Number.isNaN(index)) return;
			if (state.status === GAME_STATUS.GAME_OVER) return;
			if (isHandDead(state.hands[owner][index])) return;
			if (state.turn === 'player' && owner === 'player') {
				el.classList.add('selectable');
			}
			if (state.selectedHand && state.selectedHand.owner === owner && state.selectedHand.index === index) {
				el.classList.add('selected');
			}
			if (state.selectedHand && state.turn === 'player' && owner === 'cpu') {
				el.classList.add('targetable');
			}
		});
	}

	function renderSplitButton() {
		dom.playerActions.innerHTML = '';
		const activeIndices = HAND_INDEXES.filter((i) => !isHandDead(state.hands.player[i]));
		const playerSumActive = activeIndices.reduce((sum, i) => sum + state.hands.player[i], 0);
		if (playerSumActive >= 2 && state.status === GAME_STATUS.PLAYING && state.turn === 'player') {
			const splitButton = doc.createElement('button');
			splitButton.textContent = `分割: 合計 ${playerSumActive}`;
			splitButton.className = 'split-button bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg';
			splitButton.addEventListener('click', openSplitModalSum);
			dom.playerActions.appendChild(splitButton);
		}
	}

	function updateTurnIndicators() {
		if (state.turn === 'player' && state.status === GAME_STATUS.PLAYING) {
			if (state.selectedHand) {
				dom.turnIndicator.textContent = '相手の手をタップ！';
			} else {
				dom.turnIndicator.textContent = '自分の手をえらんで';
			}
			showCpuThinking(false);
		} else if (state.turn === 'cpu') {
			dom.turnIndicator.textContent = 'CPUのターン...';
		}
		showCpuThinking(state.status === GAME_STATUS.CPU_THINKING);
	}

	function updateUI() {
		syncCpuModeButtons();
		updateHandElements();
		updateSelectionIndicators();
		if (dom.turnCounter) dom.turnCounter.textContent = `経過ターン: ${state.turnCount}`;
		renderSplitButton();
		updateTurnIndicators();
		updateHintButton();
	}

	async function performAttack(source, target) {
		if (state.isResolvingAction) return;
		state.isResolvingAction = true;
		try {
			const beforeState = cloneState();
			const sourceValue = state.hands[source.owner][source.index];
			const targetValue = state.hands[target.owner][target.index];
			const sourceEl = dom.handElements[source.owner][source.index];
			const targetEl = dom.handElements[target.owner][target.index];
			const animationPromise = playAttackAnimation(dom.attackAnimationLayer, sourceEl, targetEl, {
				actor: source.owner,
				value: sourceValue
			});

			state.selectedHand = null;
			updateUI();

			const newValue = wrapTo1to5(sourceValue + targetValue);
			await animationPromise;
			state.hands[target.owner][target.index] = newValue;

			if (targetEl) {
				const flash = doc.createElement('div');
				flash.className = 'attack-animation';
				targetEl.appendChild(flash);
				setTimeout(() => flash.remove(), 200);
			}

			const afterState = cloneState();
			const turnNumber = state.turnCount + 1;
			const actorLabel = getActorLabel(source.owner);
			const targetLabel = getActorLabel(target.owner);
			const sourceHandLabel = `${actorLabel}の${HAND_LABELS[source.index]}`;
			const targetHandLabel = `${targetLabel}の${HAND_LABELS[target.index]}`;
			const summary = `ターン${turnNumber}: ${actorLabel}の攻撃`;
			const detail = `${sourceHandLabel}(${formatHandValue(sourceValue)}) → ${targetHandLabel}(${formatHandValue(targetValue)}) = ${formatHandValue(newValue)}`;
			pushBattleLog({
				turnNumber,
				actor: source.owner,
				action: 'attack',
				summary,
				detail,
				stateBefore: beforeState,
				stateAfter: afterState,
				highlight: [
					{ owner: source.owner, index: source.index, role: 'source' },
					{ owner: target.owner, index: target.index, role: 'target' }
				]
			});

			if (checkWin()) {
				endGame();
			} else {
				switchTurn();
			}
			updateUI();
		} finally {
			state.isResolvingAction = false;
		}
	}

	async function resolveSplit({ owner, leftValue, rightValue, beforeState, summary, detail, highlight, actor }) {
		if (state.isResolvingAction) return;
		state.isResolvingAction = true;
		try {
			const actorKey = owner === 'player' ? 'player' : 'cpu';
			const stateBefore = beforeState ? cloneSnapshot(beforeState) : cloneState();
			if (owner === 'player') {
				state.selectedHand = null;
				showCpuThinking(false);
				updateUI();
			}
			await playSplitAnimation({
				layer: dom.attackAnimationLayer,
				owner,
				beforeValues: stateBefore[actorKey],
				afterValues: [leftValue, rightValue],
				handRefs: dom.handElements[owner],
				fallbackHands: stateBefore
			});

			state.hands[actorKey] = [leftValue, rightValue];
			const afterState = cloneState();
			const turnNumber = state.turnCount + 1;
			const defaultSummary = `ターン${turnNumber}: ${getActorLabel(owner)}の分割`;
			const defaultDetail = `${getActorLabel(owner)}が手を分配しました。`;
			pushBattleLog({
				turnNumber,
				actor: actor ?? owner,
				action: 'split',
				summary: summary || defaultSummary,
				detail: detail || defaultDetail,
				stateBefore,
				stateAfter: afterState,
				highlight: highlight || [
					{ owner, index: 0, role: 'result' },
					{ owner, index: 1, role: 'result' }
				]
			});

			if (checkWin()) {
				endGame();
			} else {
				switchTurn();
			}
			updateUI();
		} finally {
			state.isResolvingAction = false;
		}
	}

	function switchTurn() {
		state.turnCount += 1;
		state.turn = state.turn === 'player' ? 'cpu' : 'player';
		state.hint.requested = false;
		resetHintCache();
		clearHintUI();
		if (state.turn === 'cpu') {
			state.status = GAME_STATUS.CPU_THINKING;
			showCpuThinking(true);
			state.cpuThinkingStartedAt = getNowMs();
			setTimeout(() => cpuTurn(), 80);
		} else {
			state.status = GAME_STATUS.PLAYING;
			showCpuThinking(false);
			if (state.hint.auto) {
				state.hint.requested = true;
				refreshHint({ force: false });
			}
		}
		state.historyKeys.push(makeCurrentStateKey());
		if (state.historyKeys.length > 50) state.historyKeys.shift();
	}

	function checkWin() {
		const playerLost = state.hands.player.every(isHandDead);
		const cpuLost = state.hands.cpu.every(isHandDead);
		if (playerLost || cpuLost) {
			state.status = GAME_STATUS.GAME_OVER;
			if (playerLost) {
				state.lastResult = 'playerLost';
				dom.gameOverText.textContent = 'あなたの負け...';
			} else {
				state.lastResult = 'playerWon';
				dom.gameOverText.textContent = 'あなたの勝利！';
			}
			return true;
		}
		return false;
	}

	function endGame() {
		state.hint.requested = false;
		resetHintCache();
		clearHintUI();
		const finalSnapshot = cloneState();
		const lastTurnNumber = state.battleLog.length ? state.battleLog[state.battleLog.length - 1].turnNumber : state.turnCount;
		const detailEl = doc.getElementById('game-over-detail');
		if (detailEl) {
			if (state.lastResult === 'playerWon') {
				detailEl.textContent = `あなたは ${lastTurnNumber} 手で勝利しました。`;
			} else if (state.lastResult === 'playerLost') {
				detailEl.textContent = `あなたは ${lastTurnNumber} 手持ち堪えました。`;
			} else {
				detailEl.textContent = `経過ターン: ${lastTurnNumber}`;
			}
		}
		let finalSummary = 'ゲーム終了';
		let finalDetail = '';
		if (state.lastResult === 'playerWon') {
			finalSummary = 'ゲーム終了: あなたの勝利';
			finalDetail = 'あなたが勝利を収めました。';
		} else if (state.lastResult === 'playerLost') {
			finalSummary = 'ゲーム終了: CPUの勝利';
			finalDetail = 'CPUが勝利を収めました。';
		} else {
			finalDetail = '引き分けまたは未確定で終了しました。';
		}
		pushBattleLog({
			turnNumber: lastTurnNumber,
			actor: null,
			action: 'end',
			summary: finalSummary,
			detail: finalDetail,
			stateBefore: finalSnapshot,
			stateAfter: finalSnapshot
		});
		dom.gameOverScreen.classList.remove('hidden');
		stopTimer();
		showCpuThinking(false);
		revealBattleReview();
	}

	async function applyCpuMove(move) {
		state.cpuThinkingStartedAt = null;
		if (!move) {
			const snapshot = cloneState();
			const { attacks, splits } = ai.enumerateMoves(snapshot, 'cpu');
			const preferLower = state.cpuMode === 'weakest';
			let best = null;
			let bestScore = preferLower ? Infinity : -Infinity;
			const evaluate = (candidate) => {
				const next = ai.applyMove(snapshot, 'cpu', candidate);
				const score = evaluateCpuHeuristic(next);
				const isBetter = preferLower ? score < bestScore : score > bestScore;
				if (isBetter) {
					bestScore = score;
					best = candidate;
				}
			};
			attacks.forEach(evaluate);
			splits.forEach(evaluate);
			if (best) {
				move = best;
			} else {
				const passSnapshot = cloneState();
				const turnNumber = state.turnCount + 1;
				pushBattleLog({
					turnNumber,
					actor: 'cpu',
					action: 'pass',
					summary: `ターン${turnNumber}: CPUは行動できません`,
					detail: '有効な行動が無いため、ターンをスキップしました。',
					stateBefore: passSnapshot,
					stateAfter: passSnapshot
				});
				switchTurn();
				updateUI();
				return;
			}
		}

		if (move.type === 'attack') {
			await performAttack({ owner: 'cpu', index: move.src }, { owner: 'player', index: move.dst });
		} else if (move.type === 'split') {
			const beforeState = cloneState();
			const previousLeft = formatHandValue(beforeState.cpu[0]);
			const previousRight = formatHandValue(beforeState.cpu[1]);
			const turnNumber = state.turnCount + 1;
			const summary = `ターン${turnNumber}: CPUの分割`;
			const detail = `左 ${previousLeft} / 右 ${previousRight} → 左 ${formatHandValue(move.left)} / 右 ${formatHandValue(move.right)}　(合計 ${move.left + move.right})`;
			await resolveSplit({
				owner: 'cpu',
				leftValue: move.left,
				rightValue: move.right,
				beforeState,
				summary,
				detail,
				actor: 'cpu',
				highlight: [
					{ owner: 'cpu', index: 0, role: 'result' },
					{ owner: 'cpu', index: 1, role: 'result' }
				]
			});
		}

		showCpuThinking(false);
	}

	function cpuTurn() {
		if (state.cpuThinkingStartedAt === null) {
			state.cpuThinkingStartedAt = getNowMs();
		}
		const snapshot = cloneState();
		const move = ai.chooseCpuMove(snapshot, state.cpuMode, state.historyKeys);
		const now = getNowMs();
		const elapsed = state.cpuThinkingStartedAt !== null ? now - state.cpuThinkingStartedAt : MIN_CPU_THINK_MS;
		const remaining = Math.max(MIN_CPU_THINK_MS - elapsed, 0);
		if (remaining > 0) {
			setTimeout(() => {
				applyCpuMove(move).catch(() => { });
			}, remaining);
		} else {
			applyCpuMove(move).catch(() => { });
		}
	}

	function handleHandClick(event) {
		if (state.status !== GAME_STATUS.PLAYING || state.isResolvingAction) return;
		const target = event.target.closest('.hand-container');
		if (!target) return;
		const owner = target.dataset.owner;
		const index = Number(target.dataset.index);
		if (!owner || Number.isNaN(index)) return;
		if (isHandDead(state.hands[owner][index])) return;

		if (state.turn === 'player') {
			showCpuThinking(false);
			if (owner === 'player') {
				if (state.selectedHand && state.selectedHand.owner === owner && state.selectedHand.index === index) {
					state.selectedHand = null;
				} else {
					state.selectedHand = { owner, index };
				}
				updateUI();
			} else if (owner === 'cpu' && state.selectedHand) {
				performAttack(state.selectedHand, { owner, index });
			}
		}
	}

	function openSplitModalSum() {
		const active = HAND_INDEXES.filter((i) => !isHandDead(state.hands.player[i]));
		const sum = active.reduce((total, i) => total + state.hands.player[i], 0);
		if (sum < 2 || state.status !== GAME_STATUS.PLAYING || state.turn !== 'player') return;
		showCpuThinking(false);
		dom.splitOptionsContainer.innerHTML = '';
		const header = doc.createElement('div');
		header.className = 'mb-2';
		if (active.length === 2) {
			header.textContent = `現在: 左 ${state.hands.player[0]} / 右 ${state.hands.player[1]} → 合計 ${sum}`;
		} else {
			const deadIndex = active.length === 0 ? '両方' : active[0] === 0 ? '右' : '左';
			header.textContent = `現在: 左 ${state.hands.player[0]} / 右 ${state.hands.player[1]} → 合計 ${sum} （${deadIndex} が 0/5 のため除外）`;
		}
		dom.splitOptionsContainer.appendChild(header);
		const buildOption = (a, b) => {
			const optionEl = doc.createElement('div');
			optionEl.className = 'split-option';
			const label = doc.createElement('div');
			label.textContent = `左 ${a}  —  右 ${b}`;
			const applyBtn = doc.createElement('button');
			applyBtn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg';
			applyBtn.textContent = '選択';
			applyBtn.onclick = async () => {
				dom.splitModalBackdrop.classList.add('hidden');
				await applySplitDistribution(a, b);
			};
			optionEl.appendChild(label);
			optionEl.appendChild(applyBtn);
			dom.splitOptionsContainer.appendChild(optionEl);
		};

		const currentLeft = state.hands.player[0];
		const currentRight = state.hands.player[1];
		const normLeft = currentLeft === 5 ? 0 : currentLeft;
		const normRight = currentRight === 5 ? 0 : currentRight;

		const allowDistribution = (a, b) => {
			if (a > 5 || b > 5) return false;
			if (a === 0 || b === 0 || a === 5 || b === 5) return false;
			if ((a === normLeft && b === normRight) || (a === normRight && b === normLeft)) return false;
			return true;
		};

		if (active.length === 2) {
			for (let a = 0; a <= sum; a++) {
				const b = sum - a;
				if (!allowDistribution(a, b)) continue;
				buildOption(a, b);
			}
		} else if (active.length === 1) {
			const deadIndex = active[0] === 0 ? 1 : 0;
			const note = doc.createElement('div');
			note.className = 'mb-2 text-sm text-gray-300';
			note.textContent = `注: 手が 0/5 の方は一時的に 0 として扱い、左右へ配分できます（${deadIndex === 0 ? '左' : '右'} が 0/5）。`;
			dom.splitOptionsContainer.appendChild(note);
			for (let a = 0; a <= sum; a++) {
				const b = sum - a;
				if (!allowDistribution(a, b)) continue;
				buildOption(a, b);
			}
		}
		dom.splitModalBackdrop.classList.remove('hidden');
	}

	async function applySplitDistribution(leftValue, rightValue) {
		if (state.status !== GAME_STATUS.PLAYING || state.turn !== 'player' || state.isResolvingAction) return;
		const beforeState = cloneState();
		const turnNumber = state.turnCount + 1;
		const previousLeft = formatHandValue(beforeState.player[0]);
		const previousRight = formatHandValue(beforeState.player[1]);
		const summary = `ターン${turnNumber}: あなたの分割`;
		const detail = `左 ${previousLeft} / 右 ${previousRight} → 左 ${formatHandValue(leftValue)} / 右 ${formatHandValue(rightValue)}　(合計 ${leftValue + rightValue})`;
		await resolveSplit({
			owner: 'player',
			leftValue,
			rightValue,
			beforeState,
			summary,
			detail,
			highlight: [
				{ owner: 'player', index: 0, role: 'result' },
				{ owner: 'player', index: 1, role: 'result' }
			]
		});
	}

	function initializeGame() {
		state.hands = cloneSnapshot(INITIAL_HANDS);
		state.turnCount = 0;
		state.selectedHand = null;
		state.status = GAME_STATUS.PLAYING;
		dom.gameOverScreen.classList.add('hidden');
		state.historyKeys = [];
		resetBattleLog();
		updateBattleReviewUI();
		state.hint.requested = false;
		resetHintCache();
		clearHintUI();
		state.hint.auto = false;
		state.turn = Math.random() < 0.5 ? 'player' : 'cpu';
		showCpuThinking(false);
		if (state.turn === 'cpu') {
			state.status = GAME_STATUS.CPU_THINKING;
			state.cpuThinkingStartedAt = getNowMs();
			updateUI();
			setTimeout(cpuTurn, 500);
		} else {
			state.status = GAME_STATUS.PLAYING;
			updateUI();
		}
		state.historyKeys.push(makeCurrentStateKey());
		resetTimer();
		startTimer();
	}

	function attachEventListeners() {
		if (dom.gameContainer) dom.gameContainer.addEventListener('click', handleHandClick);
		if (dom.splitCancel) dom.splitCancel.addEventListener('click', () => dom.splitModalBackdrop.classList.add('hidden'));
		if (dom.restartButton) dom.restartButton.addEventListener('click', initializeGame);
		dom.cpuModeButtonsGameOver.forEach((btn) => {
			btn.addEventListener('click', () => {
				state.cpuMode = btn.dataset.mode;
				syncCpuModeButtons();
				updateUI();
			});
		});
		if (dom.hintButton) {
			dom.hintButton.addEventListener('click', () => {
				if (state.hint.computing) return;
				if (state.status !== GAME_STATUS.PLAYING || state.turn !== 'player') return;
				if (state.hint.auto) {
					// Turn off auto hint
					state.hint.auto = false;
					clearHintUI();
				} else {
					// Turn on auto hint or request manual
					state.hint.auto = true;
					state.hint.requested = true;
					refreshHint({ force: false });
				}
				updateHintButton();
			});
		}
		if (dom.battleReviewPrev) dom.battleReviewPrev.addEventListener('click', () => {
			clampReviewIndex(state.reviewIndex - 1);
			updateBattleReviewUI();
		});
		if (dom.battleReviewNext) dom.battleReviewNext.addEventListener('click', () => {
			clampReviewIndex(state.reviewIndex + 1);
			updateBattleReviewUI();
		});
		if (dom.battleReviewFirst) dom.battleReviewFirst.addEventListener('click', () => {
			clampReviewIndex(0);
			updateBattleReviewUI();
		});
		if (dom.battleReviewLast) dom.battleReviewLast.addEventListener('click', () => {
			clampReviewIndex(state.battleLog.length - 1);
			updateBattleReviewUI();
		});
		if (dom.startButton) {
			dom.startButton.addEventListener('click', () => {
				dom.startScreen.classList.add('hidden');
				dom.gameContainer.classList.remove('hidden');
				initializeGame();
			});
		}
		dom.cpuModeButtonsStart.forEach((btn) => {
			btn.addEventListener('click', () => {
				state.cpuMode = btn.dataset.mode;
				syncCpuModeButtons();
				updateUI();
			});
		});
	}

	function init() {
		attachEventListeners();
		syncCpuModeButtons();
		updateUI();
	}

	return {
		init
	};
}
