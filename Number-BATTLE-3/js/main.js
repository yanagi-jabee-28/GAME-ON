// main.js - 初期化とイベントバインド
import * as Game from './game.js';
import * as AI from './ai.js';
import * as UI from './ui.js';

function getStateAccessor() {
	return {
		playerHands: Game.playerHands,
		aiHands: Game.aiHands,
		currentPlayer: Game.currentPlayer,
		gameOver: Game.gameOver,
		checkWin: Game.checkWin
	};
}

function initGame() {
	Game.initState();
	UI.cacheDom();
	UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands });
	UI.updateMessage('あなたの番です。攻撃する手を選んでください。');
	// Show/Hide buttons
	document.getElementById('restart-btn').classList.add('hidden');
	document.getElementById('split-btn').classList.remove('hidden');
}

function applyPostWinEffects() {
	const res = Game.checkWin();
	if (res.gameOver) {
		if (res.playerLost) {
			UI.updateMessage('あなたの負けです...');
		} else {
			UI.updateMessage('あなたの勝ちです！🎉');
		}
		document.getElementById('split-btn').classList.add('hidden');
		document.getElementById('restart-btn').classList.remove('hidden');
		return true;
	}
	return false;
}

function setupEventDelegation() {
	// Hands click via delegation
	document.getElementById('game-container').addEventListener('click', (e) => {
		const target = e.target.closest('[data-hand]');
		if (!target) return;
		const owner = target.dataset.owner;
		const index = Number(target.dataset.index);
		// If player's turn, handle selection/attack
		if (Game.gameOver || Game.currentPlayer !== 'player') return;
		if (Game.selectedHand.owner === null) {
			if (owner === 'player' && Game.playerHands[index] > 0) {
				Game.setSelectedHand(owner, index);
				target.classList.add('selected');
				UI.updateMessage('相手の手を選んで攻撃してください。');
			}
		} else if (Game.selectedHand.owner === 'player' && owner === 'player' && Game.selectedHand.index === index) {
			// cancel selection: remove selected class from previously selected element
			const prevIndex = Game.selectedHand.index;
			if (prevIndex !== null && prevIndex !== undefined) {
				const prevEl = document.getElementById(`player-hand-${prevIndex}`);
				if (prevEl) prevEl.classList.remove('selected');
			}
			Game.setSelectedHand(null, null);
			UI.updateMessage('あなたの番です。攻撃する手を選んでください。');
		} else if (Game.selectedHand.owner === 'player' && owner === 'ai') {
			if (Game.aiHands[index] === 0) return;
			// capture attacker index
			const attackerIndex = Game.selectedHand.index;
			// apply attack immediately so numbers update
			// remove selected class from previously selected player hand immediately for UX
			if (attackerIndex !== null && attackerIndex !== undefined) {
				const prevEl = document.getElementById(`player-hand-${attackerIndex}`);
				if (prevEl) prevEl.classList.remove('selected');
			}
			Game.setSelectedHand(null, null);
			// animate first, then apply attack and update UI
			UI.performPlayerAttackAnim(attackerIndex, index, () => {
				// apply attack after animation
				Game.applyAttack('player', attackerIndex, 'ai', index);
				UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands });
				if (applyPostWinEffects()) return;
				Game.switchTurnTo('ai');
				// call AI turn (returns Promise)
				AI.aiTurnWrapper(() => ({ playerHands: Game.playerHands, aiHands: Game.aiHands, currentPlayer: Game.currentPlayer, gameOver: Game.gameOver, checkWin: Game.checkWin }))
					.then(() => {
						UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands });
						applyPostWinEffects();
					});
			});
		}
	});

	// Split button
	document.getElementById('split-btn').addEventListener('click', () => {
		UI.openSplitModal({ playerHands: Game.playerHands, aiHands: Game.aiHands, currentPlayer: Game.currentPlayer, gameOver: Game.gameOver }, (val0, val1) => {
			// Animate split first, then apply split and update UI
			UI.performPlayerSplitAnim(val0, val1, () => {
				Game.applySplit('player', val0, val1);
				UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands });
				if (applyPostWinEffects()) return;
				Game.switchTurnTo('ai');
				AI.aiTurnWrapper(() => ({ playerHands: Game.playerHands, aiHands: Game.aiHands, currentPlayer: Game.currentPlayer, gameOver: Game.gameOver, checkWin: Game.checkWin }))
					.then(() => {
						UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands });
						applyPostWinEffects();
					});
			});
		});
	});

	// Restart
	document.getElementById('restart-btn').addEventListener('click', () => {
		initGame();
	});
}

window.addEventListener('DOMContentLoaded', () => {
	UI.cacheDom();
	setupEventDelegation();
	initGame();
});

export { initGame };
