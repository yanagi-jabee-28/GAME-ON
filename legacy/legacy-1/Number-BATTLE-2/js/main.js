import { createNumberBattleGame } from './game.js';

document.addEventListener('DOMContentLoaded', () => {
	const game = createNumberBattleGame(document);
	game.init();
});

document.getElementById('copy-board-button').addEventListener('click', () => {
	const history = window.gameState.historyKeys; // ゲーム履歴を取得
	const boardStates = history.map((state, index) => `ターン ${index + 1}: ${state}`).join('\n');

	navigator.clipboard.writeText(boardStates).then(() => {
		alert('全ターンの盤面をクリップボードにコピーしました！');
	}).catch(err => {
		console.error('クリップボードへのコピーに失敗しました:', err);
	});
});
