import { createNumberBattleGame } from './game.js';

document.addEventListener('DOMContentLoaded', () => {
	const game = createNumberBattleGame(document);
	game.init();
});
