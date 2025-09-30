import { NumberBattleGame } from './game-controller.js';

const getElement = (id, { optional = false } = {}) => {
	const el = document.getElementById(id);
	if (!el && !optional) {
		throw new Error(`NumberBattleGame: missing required element #${id}`);
	}
	return el;
};

const dom = {
	startScreen: getElement('start-screen'),
	gameContainer: getElement('game-container'),
	startButton: getElement('start-button'),
	restartButton: getElement('restart-button'),
	splitModalBackdrop: getElement('split-modal-backdrop'),
	splitOptionsContainer: getElement('split-options'),
	splitCancel: getElement('split-cancel'),
	hintButton: getElement('hint-button'),
	hintMessageEl: getElement('hint-message'),
	cpuModeDisplay: getElement('cpu-mode-display'),
	cpuModeToggle: getElement('cpu-mode-toggle', { optional: true }),
	cpuThinkingIndicator: getElement('cpu-thinking-indicator'),
	turnIndicator: getElement('turn-indicator'),
	turnCounterEl: getElement('turn-counter'),
	gameTimer: getElement('game-timer'),
	playerActions: getElement('player-actions'),
	gameOverScreen: getElement('game-over-screen'),
	gameOverText: getElement('game-over-text'),
	gameOverDetail: getElement('game-over-detail'),
	battleReviewContainer: getElement('battle-review'),
	battleReviewSummary: getElement('battle-review-summary'),
	battleReviewDetail: getElement('battle-review-detail'),
	battleReviewState: getElement('battle-review-state'),
	battleReviewStep: getElement('battle-review-step'),
	battleReviewPrev: getElement('battle-review-prev'),
	battleReviewNext: getElement('battle-review-next'),
	battleReviewFirst: getElement('battle-review-first'),
	battleReviewLast: getElement('battle-review-last'),
	attackAnimationLayer: getElement('attack-animation-layer'),
	handElements: {
		player: [
			getElement('player-hand-left'),
			getElement('player-hand-right')
		],
		cpu: [
			getElement('cpu-hand-left'),
			getElement('cpu-hand-right')
		]
	},
	reviewHandElements: {
		player: [
			getElement('review-player-hand-left'),
			getElement('review-player-hand-right')
		],
		cpu: [
			getElement('review-cpu-hand-left'),
			getElement('review-cpu-hand-right')
		]
	},
	historyContainers: Array.from(document.querySelectorAll('[data-history-container]'))
};

const createWorker = (path) => new Worker(path, { type: 'module' });

const game = new NumberBattleGame({
	dom,
	createWorker
});

game.syncCpuModeButtons();
game.updateUI();

if (typeof window !== 'undefined') {
	window.numberBattleGame = game;
}
