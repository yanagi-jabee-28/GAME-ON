import {
	CPU_MODE_SEQUENCE,
	CPU_THINK_TIME_PROFILE,
	DEFAULT_CPU_THINK_TIME,
	PONDER_TIME_BUDGET_MS,
	PONDER_MAX_DEPTH_OFFSET,
	PONDER_DEPTH_STEP,
	STORAGE_KEYS,
	BATTLE_HISTORY_VERSION,
	BATTLE_HISTORY_LIMIT,
	getCpuModeLabel
} from './constants.js';
import {
	delay,
	formatHandValue,
	formatHandsState,
	generateBattleRecordId,
	getActorLabel,
	getNowMs,
	safeCloneBattleState,
	safeCloneHighlight
} from './utils.js';
import { AnimationController } from './animations.js';
import { BattleLogManager } from './battle-log.js';
import { BattleHistoryManager } from './history-manager.js';
import { HintManager } from './hint-manager.js';
import { wrapTo1to5, cloneStateFrom, hintEnumerateMoves } from './ai-core.js';

const HAND_LABELS = ['左手', '右手'];

export class NumberBattleGame {
	constructor({
		dom,
		createWorker
	}) {
		this.dom = dom;
		this.createWorker = createWorker;

		this.hands = { player: [1, 1], cpu: [1, 1] };
		this.turn = 'player';
		this.gameState = 'playing';
		this.selectedHand = null;
		this.turnCount = 0;
		this.CPU_MODE = 'strong';
		this.lastResult = null;
		this.stateHistory = [];
		this.cpuThinkingStartedAt = null;
		this.isResolvingAction = false;
		this.cpuWorker = null;
		this.cpuWorkerJobCounter = 0;
		this.cpuWorkerPending = null;
		this.ponderWorker = null;
		this.ponderWorkerJobCounter = 0;
		this.ponderWorkerPending = null;
		this.ponderBaseStateKey = null;
		this.ponderDepthOffset = 0;
		this.ponderCache = new Map();
		this.pendingCpuMoveInfo = null;
		this.gameSessionId = null;
		this.gameStartedTimestamp = null;
		this.initialTurnAtStart = 'player';
		this.timerInterval = null;
		this.timerSeconds = 0;

		this.animationController = new AnimationController({
			attackLayer: dom.attackAnimationLayer,
			handElements: dom.handElements
		});

		this.battleLogManager = new BattleLogManager({
			onUpdate: () => this.refreshBattleReviewUI(),
			onReveal: () => this.showBattleReviewContainer(),
			animationController: this.animationController,
			reviewHandElements: dom.reviewHandElements,
			battleReviewSummary: dom.battleReviewSummary,
			battleReviewDetail: dom.battleReviewDetail,
			battleReviewState: dom.battleReviewState,
			battleReviewStep: dom.battleReviewStep,
			battleReviewPrev: dom.battleReviewPrev,
			battleReviewNext: dom.battleReviewNext,
			battleReviewFirst: dom.battleReviewFirst,
			battleReviewLast: dom.battleReviewLast
		});

		this.historyManager = new BattleHistoryManager({
			storageKey: STORAGE_KEYS.battleHistory,
			version: BATTLE_HISTORY_VERSION,
			limit: BATTLE_HISTORY_LIMIT
		});

		this.hintManager = new HintManager({
			turnAccessor: () => this.turn,
			gameStateAccessor: () => this.gameState,
			stateKeyProvider: () => this.makeStateKey(),
			stateSnapshotProvider: () => this.cloneState(),
			applyHintResultCallback: (info) => this.applyHintHighlight(info),
			clearHighlightsCallback: () => this.clearHintHighlights(),
			setMessageCallback: (msg) => this.setHintMessage(msg),
			updateButtonStateCallback: () => this.updateHintButton()
		});

		this.hintManager.setHandsAccessor(() => this.hands);
		this.setupEventHandlers();
	}

	setupEventHandlers() {
		const { dom } = this;

		dom.gameContainer.addEventListener('click', (e) => this.handleHandClick(e));
		dom.splitCancel.addEventListener('click', () => dom.splitModalBackdrop.classList.add('hidden'));
		dom.restartButton.addEventListener('click', () => this.initializeGame());

		dom.hintButton?.addEventListener('click', () => {
			if (this.hintManager.isComputing()) return;
			if (this.gameState !== 'playing' || this.turn !== 'player') return;
			this.hintManager.setHintRequested(true);
			this.hintManager.refresh({ force: false });
		});

		dom.battleReviewPrev?.addEventListener('click', () => {
			this.battleLogManager.stepReview(-1);
		});
		dom.battleReviewNext?.addEventListener('click', () => {
			this.battleLogManager.stepReview(1);
		});
		dom.battleReviewFirst?.addEventListener('click', () => {
			this.battleLogManager.setReviewIndex(0);
		});
		dom.battleReviewLast?.addEventListener('click', () => {
			this.battleLogManager.setReviewIndex(this.battleLogManager.entries.length - 1);
		});

		dom.startButton.addEventListener('click', () => {
			dom.startScreen.classList.add('hidden');
			dom.gameContainer.classList.remove('hidden');
			this.initializeGame();
		});

		document.querySelectorAll('.cpu-mode-btn-start').forEach(btn => {
			btn.addEventListener('click', () => {
				this.CPU_MODE = btn.dataset.mode;
				this.syncCpuModeButtons();
				this.updateUI();
				this.refreshPonderingSchedule();
			});
		});

		document.querySelectorAll('.cpu-mode-btn-game-over').forEach(btn => {
			btn.addEventListener('click', () => {
				this.CPU_MODE = btn.dataset.mode;
				this.syncCpuModeButtons();
				this.updateUI();
				this.refreshPonderingSchedule();
			});
		});

		dom.cpuModeToggle?.addEventListener('click', () => {
			const currentIndex = CPU_MODE_SEQUENCE.indexOf(this.CPU_MODE);
			const nextIndex = (currentIndex + 1) % CPU_MODE_SEQUENCE.length;
			this.CPU_MODE = CPU_MODE_SEQUENCE[nextIndex];
			dom.cpuModeToggle.textContent = `CPU: ${getCpuModeLabel(this.CPU_MODE)}`;
			this.syncCpuModeButtons();
			this.updateUI();
			this.refreshPonderingSchedule();
		});

		dom.historyContainers.forEach(container => this.setupHistoryControls(container));
	}

	setupHistoryControls(container) {
		const exportBtn = container.querySelector('[data-history-export]');
		const importBtn = container.querySelector('[data-history-import]');
		const fileInput = container.querySelector('[data-history-input]');

		const refreshStatus = (message = '', variant = 'info') => {
			const messageParts = [];
			if (message) messageParts.push(message);
			if (this.historyManager.isStorageAvailable()) {
				const count = this.historyManager.load().length;
				messageParts.push(`保存件数: ${count} 件`);
			} else {
				messageParts.push('ローカルストレージが利用できません');
			}
			const text = messageParts.join(' / ');
			const statusEl = container.querySelector('[data-history-status]');
			if (!statusEl) return;
			statusEl.textContent = text;
			statusEl.classList.remove('text-gray-300', 'text-emerald-400', 'text-red-400');
			if (!this.historyManager.isStorageAvailable() || variant === 'error') {
				statusEl.classList.add('text-red-400');
			} else if (variant === 'success') {
				statusEl.classList.add('text-emerald-400');
			} else {
				statusEl.classList.add('text-gray-300');
			}
		};

		if (!this.historyManager.isStorageAvailable()) {
			if (exportBtn) exportBtn.disabled = true;
			if (importBtn) importBtn.disabled = true;
			if (fileInput) fileInput.disabled = true;
			refreshStatus('', 'error');
			return;
		}

		if (exportBtn) {
			exportBtn.addEventListener('click', () => {
				try {
					const { count, blob, filename } = this.historyManager.exportHistory();
					if (count === 0) {
						refreshStatus('保存された戦績がありません', 'info');
						return;
					}
					if (blob && filename) {
						const link = document.createElement('a');
						link.href = URL.createObjectURL(blob);
						link.download = filename;
						document.body.appendChild(link);
						link.click();
						document.body.removeChild(link);
						setTimeout(() => URL.revokeObjectURL(link.href), 0);
					}
					refreshStatus(`戦績${count}件を書き出しました`, 'success');
				} catch (err) {
					console.error('Failed to export history', err);
					refreshStatus('書き出しに失敗しました', 'error');
				}
			});
		}

		if (importBtn && fileInput) {
			importBtn.addEventListener('click', () => fileInput.click());
			fileInput.addEventListener('change', async () => {
				const file = fileInput.files && fileInput.files[0];
				if (!file) return;
				try {
					const { added, total } = await this.historyManager.importFromFile(file);
					const message = added > 0 ? `戦績${added}件を追加しました` : '既存データを更新しました';
					refreshStatus(message, 'success');
				} catch (err) {
					console.error('Failed to import history', err);
					refreshStatus('読み込みに失敗しました', 'error');
				} finally {
					fileInput.value = '';
				}
			});
		}

		refreshStatus('', 'info');
	}

	syncCpuModeButtons() {
		const { cpuModeDisplay } = this.dom;
		const updateGroup = (selector) => {
			document.querySelectorAll(selector).forEach(b => {
				b.classList.remove('bg-blue-600', 'bg-gray-700');
				if (b.dataset.mode === this.CPU_MODE) {
					b.classList.add('bg-blue-600');
				} else {
					b.classList.add('bg-gray-700');
				}
			});
		};
		updateGroup('.cpu-mode-btn-start');
		updateGroup('.cpu-mode-btn-game-over');
		if (cpuModeDisplay) cpuModeDisplay.textContent = getCpuModeLabel(this.CPU_MODE);
	}

	cloneState() {
		return { player: [...this.hands.player], cpu: [...this.hands.cpu] };
	}

	isHandValueAlive(value) {
		return value !== 0 && value !== 5;
	}

	normalizeHandValue(value) {
		return (value === 0 || value === 5) ? 0 : value;
	}

	isHandAlive(owner, index) {
		const handArray = this.hands[owner];
		if (!handArray) return false;
		return this.isHandValueAlive(handArray[index]);
	}

	isCpuMoveLegal(move) {
		if (!move || typeof move !== 'object') return false;
		if (move.type === 'attack') {
			return this.isHandAlive('cpu', move.src) && this.isHandAlive('player', move.dst);
		}
		if (move.type === 'split') {
			const sum = this.hands.cpu.reduce((total, value) => total + this.normalizeHandValue(value), 0);
			if (sum < 2) return false;
			const { left, right } = move;
			if (![left, right].every(v => Number.isFinite(v))) return false;
			if (left <= 0 || right <= 0 || left >= 5 || right >= 5) return false;
			if (left + right !== sum) return false;
			return true;
		}
		return false;
	}

	getLegalCpuMoves() {
		const state = this.cloneState();
		return hintEnumerateMoves(state, 'cpu').filter(move => this.isCpuMoveLegal(move));
	}

	movesAreEquivalent(a, b) {
		if (!a || !b || a.type !== b.type) return false;
		if (a.type === 'attack') {
			return a.src === b.src && a.dst === b.dst;
		}
		if (a.type === 'split') {
			return a.left === b.left && a.right === b.right;
		}
		return false;
	}

	makeStateKey() {
		return JSON.stringify({ player: this.hands.player, cpu: this.hands.cpu, turn: this.turn });
	}

	getCpuThinkTimings(mode) {
		return CPU_THINK_TIME_PROFILE[mode] || DEFAULT_CPU_THINK_TIME;
	}

	updateUI() {
		const { cpuModeDisplay, handElements, turnIndicator, playerActions, turnCounterEl, hintButton } = this.dom;
		if (cpuModeDisplay) cpuModeDisplay.textContent = getCpuModeLabel(this.CPU_MODE);

		['player', 'cpu'].forEach(owner => {
			this.hands[owner].forEach((count, index) => {
				const handEl = handElements[owner][index];
				const isDead = (count === 5 || count === 0);
				handEl.querySelector('.finger-count').textContent = isDead ? 'X' : count;
				handEl.classList.toggle('dead', isDead);
			});
		});

		document.querySelectorAll('.hand-container').forEach(el => {
			el.classList.remove('selectable', 'selected', 'targetable');
			if (this.gameState === 'gameover' || el.classList.contains('dead')) return;
			const owner = el.dataset.owner;
			const index = parseInt(el.dataset.index, 10);
			if (this.turn === 'player' && owner === 'player') {
				el.classList.add('selectable');
			}
			if (this.selectedHand && this.selectedHand.owner === owner && this.selectedHand.index === index) {
				el.classList.add('selected');
			}
			if (this.selectedHand && this.turn === 'player' && owner === 'cpu') {
				el.classList.add('targetable');
			}
		});

		if (this.turn === 'player' && this.gameState === 'playing') {
			turnIndicator.textContent = this.selectedHand ? '相手の手をタップ！' : '自分の手をえらんで';
			this.showCpuThinking(false);
		} else if (this.turn === 'cpu') {
			turnIndicator.textContent = 'CPUのターン...';
		}

		this.showCpuThinking(this.gameState === 'cpu_thinking');

		if (turnCounterEl) turnCounterEl.textContent = `経過ターン: ${this.turnCount}`;
		playerActions.innerHTML = '';
		const activeIndices = [0, 1].filter(i => this.hands.player[i] !== 5 && this.hands.player[i] !== 0);
		const playerSumActive = activeIndices.reduce((s, i) => s + this.hands.player[i], 0);
		if (playerSumActive >= 2 && this.gameState === 'playing' && this.turn === 'player') {
			const splitButton = document.createElement('button');
			splitButton.textContent = `分割: 合計 ${playerSumActive}`;
			splitButton.className = 'split-button bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg';
			splitButton.onclick = () => this.openSplitModalSum();
			playerActions.appendChild(splitButton);
		}

		this.updateHintButton();
	}

	updateHintButton() {
		const { hintButton } = this.dom;
		if (!hintButton) return;
		if (this.gameState !== 'playing' || this.turn !== 'player') {
			hintButton.disabled = true;
			hintButton.textContent = 'ヒント（あなたのターンで利用可）';
			return;
		}
		if (this.hintManager.isComputing()) {
			hintButton.disabled = true;
			hintButton.textContent = 'ヒント計算中...';
			return;
		}
		hintButton.disabled = false;
		if (this.hintManager.isHintRequested() && this.hintManager.hasHint()) {
			hintButton.textContent = 'ヒントを更新';
		} else {
			hintButton.textContent = 'ヒントを見る';
		}
	}

	setHintMessage(message) {
		if (this.dom.hintMessageEl) {
			this.dom.hintMessageEl.textContent = message || '';
		}
	}

	clearHintHighlights() {
		['player', 'cpu'].forEach(owner => {
			this.dom.handElements[owner].forEach(el => {
				if (!el) return;
				el.classList.remove('hint-source', 'hint-target');
			});
		});
	}

	applyHintHighlight(info) {
		if (!info || !info.type) return;
		this.clearHintHighlights();
		if (info.type === 'attack') {
			const { move } = info;
			this.dom.handElements.player[move.src]?.classList.add('hint-source');
			this.dom.handElements.cpu[move.dst]?.classList.add('hint-target');
		} else if (info.type === 'split') {
			this.dom.handElements.player[0]?.classList.add('hint-source');
			this.dom.handElements.player[1]?.classList.add('hint-source');
		}
	}

	openSplitModalSum() {
		const active = [0, 1].filter(i => this.hands.player[i] !== 5 && this.hands.player[i] !== 0);
		const sum = active.reduce((s, i) => s + this.hands.player[i], 0);
		if (sum < 2 || this.gameState !== 'playing' || this.turn !== 'player') return;

		this.showCpuThinking(false);
		const { splitModalBackdrop, splitOptionsContainer } = this.dom;
		splitOptionsContainer.innerHTML = '';

		const addOption = (a, b, note) => {
			const optionEl = document.createElement('div');
			optionEl.className = 'split-option';
			const label = document.createElement('div');
			label.textContent = note || `左 ${a}  —  右 ${b}`;
			const applyBtn = document.createElement('button');
			applyBtn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg';
			applyBtn.textContent = '選択';
			applyBtn.onclick = async () => {
				splitModalBackdrop.classList.add('hidden');
				await this.applySplitDistribution(a, b);
			};
			optionEl.appendChild(label);
			optionEl.appendChild(applyBtn);
			splitOptionsContainer.appendChild(optionEl);
		};

		const normalized = (value) => (value === 0 || value === 5 ? 0 : value);
		const currentLeft = normalized(this.hands.player[0]);
		const currentRight = normalized(this.hands.player[1]);

		for (let a = 0; a <= sum; a++) {
			const b = sum - a;
			if (a > 5 || b > 5) continue;
			if (a === 0 || b === 0 || a === 5 || b === 5) continue;
			if ((a === currentLeft && b === currentRight) || (a === currentRight && b === currentLeft)) {
				continue;
			}
			addOption(a, b);
		}

		splitModalBackdrop.classList.remove('hidden');
	}

	async applySplitDistribution(leftValue, rightValue) {
		if (this.gameState !== 'playing' || this.turn !== 'player' || this.isResolvingAction) return;
		const beforeState = this.cloneState();
		const turnNumber = this.turnCount + 1;
		const summary = `ターン${turnNumber}: あなたの分割`;
		const detail = `左 ${formatHandValue(beforeState.player[0])} / 右 ${formatHandValue(beforeState.player[1])} → 左 ${formatHandValue(leftValue)} / 右 ${formatHandValue(rightValue)}　(合計 ${leftValue + rightValue})`;
		await this.resolveSplit({
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

	async resolveSplit({ owner, leftValue, rightValue, beforeState, summary, detail, highlight, actor }) {
		if (this.isResolvingAction) return;
		this.isResolvingAction = true;
		try {
			const stateBefore = beforeState ? cloneStateFrom(beforeState) : this.cloneState();
			if (owner === 'player') {
				this.selectedHand = null;
				this.showCpuThinking(false);
				this.updateUI();
			}
			await this.animationController.playSplitAnimation(owner, stateBefore[owner], [leftValue, rightValue]);

			this.hands[owner] = [leftValue, rightValue];
			const afterState = this.cloneState();
			const turnNumber = this.turnCount + 1;
			const entry = {
				turnNumber,
				actor: actor ?? owner,
				action: 'split',
				summary: summary || `ターン${turnNumber}: ${getActorLabel(owner)}の分割`,
				detail: detail || `${getActorLabel(owner)}が手を分配しました。`,
				stateBefore,
				stateAfter: afterState,
				highlight: highlight || [
					{ owner, index: 0, role: 'result' },
					{ owner, index: 1, role: 'result' }
				]
			};
			this.battleLogManager.push(entry);

			if (this.checkWin()) {
				this.endGame();
			} else {
				this.switchTurn();
			}
			this.updateUI();
		} finally {
			this.isResolvingAction = false;
		}
	}

	async handleHandClick(event) {
		if (this.gameState !== 'playing' || this.isResolvingAction) return;
		const target = event.target.closest('.hand-container');
		if (!target || target.classList.contains('dead')) return;
		const owner = target.dataset.owner;
		const index = parseInt(target.dataset.index, 10);

		if (this.turn === 'player') {
			this.showCpuThinking(false);
			if (owner === 'player') {
				if (this.selectedHand && this.selectedHand.owner === owner && this.selectedHand.index === index) {
					this.selectedHand = null;
				} else {
					this.selectedHand = { owner, index };
				}
				this.updateUI();
			} else if (owner === 'cpu' && this.selectedHand) {
				await this.performAttack(this.selectedHand, { owner, index });
			}
		}
	}

	async performAttack(source, target) {
		if (this.isResolvingAction) return;
		this.isResolvingAction = true;
		try {
			const beforeState = this.cloneState();
			const sourceValue = this.hands[source.owner][source.index];
			const targetValue = this.hands[target.owner][target.index];
			if (!this.isHandValueAlive(sourceValue) || !this.isHandValueAlive(targetValue)) {
				console.warn('Illegal attack prevented', { source, target, sourceValue, targetValue });
				this.selectedHand = null;
				this.updateUI();
				return;
			}
			const sourceEl = this.dom.handElements[source.owner][source.index];
			const targetEl = this.dom.handElements[target.owner][target.index];
			const animationPromise = this.animationController.playAttackAnimation(sourceEl, targetEl, {
				actor: source.owner,
				value: sourceValue
			});

			this.selectedHand = null;
			this.updateUI();

			const newValue = wrapTo1to5(sourceValue + targetValue);
			await animationPromise;
			this.hands[target.owner][target.index] = newValue;

			if (targetEl) {
				const flash = document.createElement('div');
				flash.className = 'attack-animation';
				targetEl.appendChild(flash);
				setTimeout(() => flash.remove(), 200);
			}

			const afterState = this.cloneState();
			const turnNumber = this.turnCount + 1;
			const actorLabel = getActorLabel(source.owner);
			const targetLabel = getActorLabel(target.owner);
			const sourceHandLabel = `${actorLabel}の${HAND_LABELS[source.index]}`;
			const targetHandLabel = `${targetLabel}の${HAND_LABELS[target.index]}`;
			const summary = `ターン${turnNumber}: ${actorLabel}の攻撃`;
			const detail = `${sourceHandLabel}(${formatHandValue(sourceValue)}) → ${targetHandLabel}(${formatHandValue(targetValue)}) = ${formatHandValue(newValue)}`;
			this.battleLogManager.push({
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

			if (this.checkWin()) {
				this.endGame();
			} else {
				this.switchTurn();
			}
			this.updateUI();
		} finally {
			this.isResolvingAction = false;
		}
	}

	checkWin() {
		const isDead = (v) => v === 5 || v === 0;
		const playerLost = this.hands.player.every(isDead);
		const cpuLost = this.hands.cpu.every(isDead);
		if (playerLost || cpuLost) {
			this.gameState = 'gameover';
			if (playerLost) {
				this.lastResult = 'playerLost';
				this.dom.gameOverText.textContent = 'あなたの負け...';
			} else {
				this.lastResult = 'playerWon';
				this.dom.gameOverText.textContent = 'あなたの勝利！';
			}
			return true;
		}
		return false;
	}

	switchTurn() {
		this.turnCount++;
		this.turn = this.turn === 'player' ? 'cpu' : 'player';
		this.hintManager.setHintRequested(false);
		this.hintManager.invalidateCache();
		this.hintManager.resetUI();
		let upcomingStateKey = this.makeStateKey();
		if (this.turn === 'cpu') {
			this.gameState = 'cpu_thinking';
			this.cancelPonderWorkerJob();
			this.ponderWorker?.postMessage({ type: 'reset' });
			this.ponderBaseStateKey = null;
			const cached = this.consumePonderedMove(upcomingStateKey);
			this.pendingCpuMoveInfo = cached && cached.move ? cached : null;
			this.showCpuThinking(true);
			this.cpuThinkingStartedAt = getNowMs();
			setTimeout(() => {
				this.cpuTurn();
			}, 80);
		} else {
			this.gameState = 'playing';
			this.pendingCpuMoveInfo = null;
			this.showCpuThinking(false);
			this.ponderDepthOffset = 0;
		}
		upcomingStateKey = this.makeStateKey();
		this.stateHistory.push(upcomingStateKey);
		if (this.stateHistory.length > 50) this.stateHistory.shift();
		if (this.turn === 'player') {
			this.startCpuPondering({ depthOffset: 0 });
		}
	}

	showCpuThinking(show) {
		const { cpuThinkingIndicator } = this.dom;
		if (!cpuThinkingIndicator) return;
		if (this.turn === 'player' || this.gameState === 'gameover') {
			show = false;
		}
		if (show) {
			cpuThinkingIndicator.classList.remove('hidden');
		} else {
			cpuThinkingIndicator.classList.add('hidden');
		}
	}

	startTimer() {
		this.stopTimer();
		this.timerInterval = setInterval(() => {
			this.timerSeconds++;
			if (this.dom.gameTimer) {
				this.dom.gameTimer.textContent = `時間: ${this.formatTime(this.timerSeconds)}`;
			}
		}, 1000);
	}

	stopTimer() {
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}

	resetTimer() {
		this.stopTimer();
		this.timerSeconds = 0;
		if (this.dom.gameTimer) {
			this.dom.gameTimer.textContent = `時間: ${this.formatTime(this.timerSeconds)}`;
		}
	}

	formatTime(sec) {
		const m = Math.floor(sec / 60).toString().padStart(2, '0');
		const s = (sec % 60).toString().padStart(2, '0');
		return `${m}:${s}`;
	}

	initializeGame() {
		this.cancelCpuWorkerJob();
		this.cpuWorker?.postMessage({ type: 'reset' });
		this.cancelPonderWorkerJob();
		this.ponderCache.clear();
		this.pendingCpuMoveInfo = null;
		this.ponderBaseStateKey = null;
		this.ponderDepthOffset = 0;
		this.hands = { player: [1, 1], cpu: [1, 1] };
		this.turnCount = 0;
		this.selectedHand = null;
		this.gameState = 'playing';
		this.dom.gameOverScreen.classList.add('hidden');
		this.stateHistory = [];
		this.battleLogManager.reset(this.cloneState());
		this.hintManager.setHintRequested(false);
		this.hintManager.invalidateCache();
		this.hintManager.resetUI();
		this.lastResult = null;
		this.gameSessionId = generateBattleRecordId();
		this.gameStartedTimestamp = Date.now();
		this.turn = Math.random() < 0.5 ? 'player' : 'cpu';
		this.initialTurnAtStart = this.turn;
		this.showCpuThinking(false);

		if (this.turn === 'cpu') {
			this.gameState = 'cpu_thinking';
			this.cpuThinkingStartedAt = getNowMs();
			this.updateUI();
			setTimeout(() => this.cpuTurn(), 500);
		} else {
			this.updateUI();
		}
		this.stateHistory.push(this.makeStateKey());
		this.resetTimer();
		this.startTimer();
	}

	refreshBattleReviewUI() {
		if (!this.dom.battleReviewContainer) return;
		if (!this.battleLogManager.entries.length) {
			this.dom.battleReviewSummary.textContent = '';
			this.dom.battleReviewDetail.textContent = '';
			this.dom.battleReviewDetail.classList.add('hidden');
			this.dom.battleReviewState.textContent = '';
			this.dom.battleReviewStep.textContent = '';
			if (this.dom.battleReviewPrev) this.dom.battleReviewPrev.disabled = true;
			if (this.dom.battleReviewNext) this.dom.battleReviewNext.disabled = true;
			if (this.dom.battleReviewFirst) this.dom.battleReviewFirst.disabled = true;
			if (this.dom.battleReviewLast) this.dom.battleReviewLast.disabled = true;
			this.animationController.renderHands?.({ player: [1, 1], cpu: [1, 1] }, []);
			return;
		}
	}

	showBattleReviewContainer() {
		if (!this.dom.battleReviewContainer) return;
		this.dom.battleReviewContainer.classList.remove('hidden');
	}

	consumePonderedMove(stateKey) {
		if (!stateKey) return null;
		const info = this.ponderCache.get(stateKey);
		if (info) {
			this.ponderCache.delete(stateKey);
			return { ...info };
		}
		return null;
	}

	handlePonderResult(payload) {
		if (!this.ponderWorkerPending || payload.jobId !== this.ponderWorkerPending.jobId) {
			return;
		}
		const { baseKey, depthOffset } = this.ponderWorkerPending;
		this.disposePonderWorkerPending();
		const ponderMode = payload.mode || this.CPU_MODE;
		const timings = this.getCpuThinkTimings(ponderMode);
		const results = Array.isArray(payload.results) ? payload.results : [];
		results.forEach(entry => {
			if (!entry || !entry.stateKey || !entry.response) return;
			this.ponderCache.set(entry.stateKey, {
				move: entry.response.firstMove,
				mode: ponderMode,
				result: entry.response,
				depthUsed: entry.depthUsed,
				elapsedMs: entry.elapsedMs,
				minThinkMs: timings.min,
				maxThinkMs: timings.max,
				source: 'ponder',
				value: entry.adjustedValue
			});
		});
		if (this.turn === 'player' && this.gameState === 'playing' && this.makeStateKey() === baseKey) {
			const nextOffset = depthOffset + PONDER_DEPTH_STEP;
			if (nextOffset <= PONDER_MAX_DEPTH_OFFSET) {
				this.startCpuPondering({ depthOffset: nextOffset, reuseCache: true });
			}
		}
	}

	disposePonderWorkerPending() {
		if (!this.ponderWorkerPending) return;
		if (this.ponderWorkerPending.timeout) {
			clearTimeout(this.ponderWorkerPending.timeout);
		}
		this.ponderWorkerPending = null;
	}

	ensurePonderWorker() {
		if (this.ponderWorker) return;
		try {
			this.ponderWorker = this.createWorker('js/cpu-worker.js');
		} catch (err) {
			console.error('Failed to create CPU ponder worker', err);
			this.ponderWorker = null;
			return;
		}
		this.ponderWorker.addEventListener('message', (event) => {
			const { type, payload } = event.data || {};
			if (type === 'ponderResult' && payload) {
				this.handlePonderResult(payload);
			} else if (type === 'error' && payload) {
				console.error('Ponder worker error', payload.message || payload);
				this.disposePonderWorkerPending();
			}
		});
		this.ponderWorker.addEventListener('error', (event) => {
			console.error('Ponder worker runtime error', event.message || event);
			this.disposePonderWorkerPending();
		});
	}

	cancelPonderWorkerJob({ terminate = false } = {}) {
		if (this.ponderWorkerPending) {
			this.ponderWorker?.postMessage({ type: 'cancel' });
			this.disposePonderWorkerPending();
		}
		if (terminate && this.ponderWorker) {
			this.ponderWorker.terminate();
			this.ponderWorker = null;
		}
	}

	startCpuPondering({ depthOffset = 0, reuseCache = false } = {}) {
		if (this.CPU_MODE !== 'strong') {
			this.cancelPonderWorkerJob();
			return;
		}
		if (this.gameState !== 'playing' || this.turn !== 'player') {
			return;
		}
		const baseKey = this.makeStateKey();
		if (!reuseCache) {
			this.ponderCache.clear();
		}
		this.ensurePonderWorker();
		if (!this.ponderWorker) return;
		const playerMoves = this.enumeratePlayerMoves();
		if (!playerMoves.length) {
			return;
		}
		this.cancelPonderWorkerJob();
		this.ponderDepthOffset = depthOffset;
		this.ponderBaseStateKey = baseKey;
		const jobId = ++this.ponderWorkerJobCounter;
		const payload = {
			state: this.cloneState(),
			mode: this.CPU_MODE,
			playerMoves,
			stateHistoryKeys: this.stateHistory.slice(-16),
			depthOffset,
			timeBudgetMs: PONDER_TIME_BUDGET_MS
		};
		const timeout = setTimeout(() => {
			if (!this.ponderWorkerPending || this.ponderWorkerPending.jobId !== jobId) return;
			this.ponderWorker?.postMessage({ type: 'cancel' });
			this.disposePonderWorkerPending();
		}, Math.max(2000, PONDER_TIME_BUDGET_MS * 2));
		this.ponderWorkerPending = { jobId, baseKey, depthOffset, timeout };
		this.ponderWorker.postMessage({ type: 'ponderMoves', payload });
	}

	enumeratePlayerMoves() {
		const attacks = [];
		const splits = [];
		for (let i of [0, 1]) {
			if (this.hands.player[i] === 5 || this.hands.player[i] === 0) continue;
			for (let j of [0, 1]) {
				if (this.hands.cpu[j] === 5 || this.hands.cpu[j] === 0) continue;
				attacks.push({ type: 'attack', src: i, dst: j });
			}
		}
		const sum = [0, 1].filter(i => this.hands.player[i] !== 5 && this.hands.player[i] !== 0)
			.reduce((a, i) => a + this.hands.player[i], 0);
		if (sum >= 2) {
			const patterns = new Set();
			for (let left = 0; left <= sum; left++) {
				const right = sum - left;
				if (left <= 5 && right <= 5) {
					patterns.add(`${left},${right}`);
				}
			}
			const normalize = (value) => (value === 0 || value === 5 ? 0 : value);
			const currentLeft = normalize(this.hands.player[0]);
			const currentRight = normalize(this.hands.player[1]);
			const current = `${currentLeft},${currentRight}`;
			const swapped = `${currentRight},${currentLeft}`;
			patterns.forEach(pattern => {
				if (pattern === current || pattern === swapped) return;
				const [left, right] = pattern.split(',').map(Number);
				if (left === 0 || right === 0 || left === 5 || right === 5) return;
				splits.push({ type: 'split', left, right });
			});
		}
		return [...attacks, ...splits];
	}

	enSureCpuWorker() {
		if (this.cpuWorker) return;
		try {
			this.cpuWorker = this.createWorker('js/cpu-worker.js');
		} catch (err) {
			console.error('Failed to create CPU worker', err);
			this.cpuWorker = null;
			return;
		}
		this.cpuWorker.addEventListener('message', (event) => {
			const { type, payload } = event.data || {};
			if (type === 'result' && payload) {
				if (!this.cpuWorkerPending || payload.jobId !== this.cpuWorkerPending.jobId) return;
				clearTimeout(this.cpuWorkerPending.timeout);
				const { resolve } = this.cpuWorkerPending;
				this.cpuWorkerPending = null;
				resolve(payload);
			} else if (type === 'error' && payload) {
				const message = payload.message || 'CPU worker error';
				console.error(message);
				this.disposeCpuWorkerPending(new Error(message));
			}
		});
		this.cpuWorker.addEventListener('error', (event) => {
			console.error('CPU worker runtime error', event.message || event);
			this.disposeCpuWorkerPending(new Error(event.message || 'CPU worker runtime error'));
		});
	}

	disposeCpuWorkerPending(reason, { skipReject = false } = {}) {
		if (!this.cpuWorkerPending) return;
		const pending = this.cpuWorkerPending;
		clearTimeout(pending.timeout);
		this.cpuWorkerPending = null;
		if (skipReject) return;
		const error = reason instanceof Error ? reason : new Error(String(reason || 'CPU worker request cancelled'));
		pending.reject(error);
	}

	cancelCpuWorkerJob({ terminate = false } = {}) {
		if (this.cpuWorkerPending) {
			this.cpuWorker?.postMessage({ type: 'cancel' });
			this.disposeCpuWorkerPending(new Error('CPU worker job cancelled'));
		}
		if (terminate && this.cpuWorker) {
			this.cpuWorker.terminate();
			this.cpuWorker = null;
		}
	}

	requestCpuWorkerMove(stateSnapshot) {
		this.enSureCpuWorker();
		if (!this.cpuWorker) {
			return Promise.reject(new Error('CPU worker unavailable'));
		}
		if (this.cpuWorkerPending) {
			this.cpuWorker.postMessage({ type: 'cancel' });
			this.disposeCpuWorkerPending(new Error('CPU worker job superseded'));
		}
		const jobId = ++this.cpuWorkerJobCounter;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (!this.cpuWorkerPending || this.cpuWorkerPending.jobId !== jobId) return;
				this.cpuWorker?.postMessage({ type: 'cancel' });
				this.disposeCpuWorkerPending(new Error('CPU worker timeout'));
			}, 5000);
			this.cpuWorkerPending = { jobId, resolve, reject, timeout };
			const recentHistory = this.stateHistory.slice(-12);
			this.cpuWorker.postMessage({
				type: 'computeMove',
				payload: {
					state: stateSnapshot,
					mode: this.CPU_MODE,
					stateHistoryKeys: recentHistory
				}
			});
		});
	}

	refreshPonderingSchedule() {
		if (this.gameState !== 'playing') return;
		if (this.CPU_MODE === 'strong' && this.turn === 'player') {
			this.startCpuPondering({ depthOffset: 0 });
		} else {
			this.cancelPonderWorkerJob();
			this.ponderCache.clear();
			this.pendingCpuMoveInfo = null;
		}
	}

	buildBattleRecord() {
		const battleLog = this.battleLogManager.getEntries();
		if (!battleLog.length) return null;
		const finishedAt = new Date().toISOString();
		const startedAt = this.gameStartedTimestamp ? new Date(this.gameStartedTimestamp).toISOString() : null;
		const result = this.lastResult || 'undecided';
		const winner = result === 'playerWon' ? 'player' : (result === 'playerLost' ? 'cpu' : null);
		return {
			id: this.gameSessionId || generateBattleRecordId(),
			version: BATTLE_HISTORY_VERSION,
			mode: this.CPU_MODE,
			modeLabel: getCpuModeLabel(this.CPU_MODE),
			result,
			winner,
			turnCount: this.turnCount,
			durationSeconds: Number.isFinite(this.timerSeconds) ? this.timerSeconds : null,
			startedAt,
			finishedAt,
			initialTurn: this.initialTurnAtStart,
			battleLog
		};
	}

	recordBattleHistory() {
		if (!this.historyManager.isStorageAvailable()) return;
		try {
			const record = this.buildBattleRecord();
			if (!record) return;
			this.historyManager.record(record);
		} catch (err) {
			console.error('Failed to record battle history', err);
		}
	}

	endGame() {
		this.cancelCpuWorkerJob();
		this.cancelPonderWorkerJob();
		this.ponderCache.clear();
		this.pendingCpuMoveInfo = null;
		this.ponderBaseStateKey = null;
		this.ponderDepthOffset = 0;
		this.hintManager.setHintRequested(false);
		this.hintManager.invalidateCache();
		this.hintManager.resetUI();
		const detailEl = this.dom.gameOverDetail;
		if (detailEl) {
			if (this.lastResult === 'playerWon') {
				detailEl.textContent = `あなたは ${this.turnCount} 手で勝利しました。`;
			} else if (this.lastResult === 'playerLost') {
				detailEl.textContent = `あなたは ${this.turnCount} 手持ち堪えました。`;
			} else {
				detailEl.textContent = `経過ターン: ${this.turnCount}`;
			}
		}
		const finalSnapshot = this.cloneState();
		const lastTurnNumber = this.battleLogManager.entries.length ? this.battleLogManager.entries[this.battleLogManager.entries.length - 1].turnNumber : this.turnCount;
		let finalSummary = 'ゲーム終了';
		let finalDetail = '';
		if (this.lastResult === 'playerWon') {
			finalSummary = 'ゲーム終了: あなたの勝利';
			finalDetail = 'あなたが勝利を収めました。';
		} else if (this.lastResult === 'playerLost') {
			finalSummary = 'ゲーム終了: CPUの勝利';
			finalDetail = 'CPUが勝利を収めました。';
		} else {
			finalSummary = 'ゲーム終了';
			finalDetail = '引き分けまたは未確定で終了しました。';
		}
		this.battleLogManager.push({
			turnNumber: lastTurnNumber,
			actor: null,
			action: 'end',
			summary: finalSummary,
			detail: finalDetail,
			stateBefore: finalSnapshot,
			stateAfter: finalSnapshot,
			highlight: []
		});
		this.dom.gameOverScreen.classList.remove('hidden');
		this.stopTimer();
		this.recordBattleHistory();
		this.showCpuThinking(false);
		this.battleLogManager.reveal();
	}

	cpuTurn() {
		if (this.cpuThinkingStartedAt === null) {
			this.cpuThinkingStartedAt = getNowMs();
		}
		let movePromise;
		const precomputed = this.pendingCpuMoveInfo && this.pendingCpuMoveInfo.move ? { ...this.pendingCpuMoveInfo } : null;
		if (precomputed) {
			this.pendingCpuMoveInfo = null;
			movePromise = Promise.resolve({
				move: precomputed.move,
				mode: precomputed.mode || this.CPU_MODE,
				result: precomputed.result || null,
				depthUsed: precomputed.depthUsed ?? null,
				elapsedMs: precomputed.elapsedMs ?? 0,
				minThinkMs: precomputed.minThinkMs ?? this.getCpuThinkTimings(this.CPU_MODE).min,
				maxThinkMs: precomputed.maxThinkMs ?? this.getCpuThinkTimings(this.CPU_MODE).max,
				source: precomputed.source || 'ponder'
			});
		} else if (this.CPU_MODE === 'strong') {
			const snapshot = this.cloneState();
			movePromise = this.requestCpuWorkerMove(snapshot).then(payload => ({
				...payload,
				source: 'worker'
			}));
		} else {
			movePromise = Promise.resolve(this.computeSynchronousCpuMove());
		}
		this.finalizeCpuMove(movePromise);
	}

	computeSynchronousCpuMove() {
		const moves = this.getLegalCpuMoves();
		const timings = this.getCpuThinkTimings(this.CPU_MODE);
		return {
			move: moves[0] || null,
			mode: this.CPU_MODE,
			result: null,
			depthUsed: null,
			elapsedMs: 0,
			minThinkMs: timings.min,
			maxThinkMs: timings.max,
			source: 'sync'
		};
	}

	finalizeCpuMove(movePromise) {
		const startedAt = this.cpuThinkingStartedAt ?? getNowMs();
		movePromise.then(info => {
			if (!info || !info.move) {
				throw new Error('CPU move not available');
			}
			const timings = this.getCpuThinkTimings(info.mode || this.CPU_MODE);
			const minThink = Math.max(info.minThinkMs ?? 0, timings.min ?? 0);
			const rawMax = info.maxThinkMs ?? timings.max ?? Number.POSITIVE_INFINITY;
			const maxThink = Number.isFinite(rawMax) ? rawMax : Number.POSITIVE_INFINITY;
			const elapsed = getNowMs() - startedAt;
			const minWait = Math.max(0, minThink - elapsed);
			let waitMs = minWait;
			if (Number.isFinite(maxThink)) {
				const remainingMax = Math.max(0, maxThink - elapsed);
				waitMs = Math.min(waitMs, remainingMax);
			}
			const executeMove = () => {
				this.applyCpuMove(info.move).catch(err => {
					console.error('Failed to apply CPU move', err);
					this.showCpuThinking(false);
				});
			};
			if (waitMs > 0) {
				setTimeout(executeMove, waitMs);
			} else {
				executeMove();
			}
		}).catch(err => {
			console.error('CPU move computation failed', err);
			const fallbackInfo = this.computeSynchronousCpuMove();
			const fallbackMove = fallbackInfo?.move;
			if (fallbackMove) {
				const timings = this.getCpuThinkTimings(this.CPU_MODE);
				const fallbackMin = Math.max(fallbackInfo?.minThinkMs ?? 0, timings.min ?? 0);
				const elapsed = getNowMs() - startedAt;
				const waitMs = Math.max(0, fallbackMin - elapsed);
				const executeFallback = () => {
					this.applyCpuMove(fallbackMove).catch(error => {
						console.error('Fallback CPU move failed', error);
						this.showCpuThinking(false);
					});
				};
				if (waitMs > 0) {
					setTimeout(executeFallback, waitMs);
				} else {
					executeFallback();
				}
			} else {
				this.showCpuThinking(false);
				this.switchTurn();
			}
		});
	}

	async applyCpuMove(move, attempt = 0) {
		this.cpuThinkingStartedAt = null;
		if (!move) {
			this.switchTurn();
			this.updateUI();
			return;
		}
		if (!this.isCpuMoveLegal(move)) {
			console.warn('CPU generated illegal move. Retrying with safe fallback.', move, this.cloneState());
			const fallbackMoves = this.getLegalCpuMoves().filter(candidate => !this.movesAreEquivalent(candidate, move));
			if (!fallbackMoves.length || attempt >= 2) {
				this.showCpuThinking(false);
				this.switchTurn();
				this.updateUI();
				return;
			}
			await this.applyCpuMove(fallbackMoves[0], attempt + 1);
			return;
		}
		if (move.type === 'attack') {
			await this.performAttack({ owner: 'cpu', index: move.src }, { owner: 'player', index: move.dst });
		} else if (move.type === 'split') {
			const beforeState = this.cloneState();
			const turnNumber = this.turnCount + 1;
			const detail = `左 ${formatHandValue(beforeState.cpu[0])} / 右 ${formatHandValue(beforeState.cpu[1])} → 左 ${formatHandValue(move.left)} / 右 ${formatHandValue(move.right)}　(合計 ${move.left + move.right})`;
			const summary = `ターン${turnNumber}: CPUの分割`;
			await this.resolveSplit({
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
		this.showCpuThinking(false);
	}
}
