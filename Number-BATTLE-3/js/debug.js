// debug.js removed: export a minimal no-op initDebug so any dynamic import is harmless
// debug.js
// Debug helper: allow the human player to control the AI during the AI's turn.
// Behavior:
// - When Game.currentPlayer === 'ai', clicking AI hands will allow the player
//   to select an AI attacker hand and then click a player hand to perform
//   the AI attack (using existing UI animations and game.applyAttack).
// - When Game.currentPlayer === 'ai', clicking the Split button will open
//   the split modal (reusing UI.openSplitModal) and allow choosing a split
//   to apply to the AI (animating with performAiSplitAnim then applySplit).
// Implementation notes: handlers are installed in the capture phase so they
// can intercept clicks before the normal player handlers in main.js.

import * as Game from './game.js';
import * as UI from './ui.js';

let debugSelected = null; // index of selected AI hand or null

function clearSelectionVisual() {
	if (debugSelected !== null) {
		const prev = document.getElementById(`ai-hand-${debugSelected}`);
		if (prev) prev.classList.remove('selected');
	}
	debugSelected = null;
}

function handleContainerClick(e) {
	// Only active when AI's turn and game not over
	try { if (Game.gameOver) return; } catch (e2) { return; }
	// Check the UI toggle: only intercept when allowed
	const enabled = document.getElementById('toggle-ai-control-cb')?.checked;
	if (!enabled) return;
	try { if (Game.currentPlayer !== 'ai') return; } catch (e3) { return; }

	const target = e.target.closest('[data-hand]');
	if (!target) return; // not a hand click

	// Intercept and prevent main.js player handler from running
	e.stopPropagation();
	e.preventDefault();

	const owner = target.dataset.owner;
	const index = Number(target.dataset.index);

	// If clicked an AI hand
	if (owner === 'ai') {
		// ignore dead hands
		if (Game.aiHands[index] === 0) return;
		// toggle selection
		if (debugSelected === index) {
			clearSelectionVisual();
			UI.updateMessage('AIの手の選択をキャンセルしました。');
			return;
		}
		// select new
		clearSelectionVisual();
		debugSelected = index;
		const el = document.getElementById(`ai-hand-${index}`);
		if (el) el.classList.add('selected');
		UI.updateMessage(`AIの${index === 0 ? '左手' : '右手'}を選択しました。攻撃先のあなたの手を選んでください、または分配を選んでください。`);
		return;
	}

	// If clicked a player hand while an AI hand is selected -> perform AI attack
	if (owner === 'player' && debugSelected !== null) {
		if (Game.playerHands[index] === 0) return; // cannot attack dead hand

		// remove selection visual
		const prevEl = document.getElementById(`ai-hand-${debugSelected}`);
		if (prevEl) prevEl.classList.remove('selected');
		const attackerIndex = debugSelected;
		debugSelected = null;

		UI.performAiAttackAnim(attackerIndex, index, () => {
			Game.applyAttack('ai', attackerIndex, 'player', index);
			UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands, gameOver: Game.gameOver, canUndo: Game.canUndo });
			const res = Game.checkWin();
			if (res.gameOver) {
				if (res.playerLost) UI.updateMessage('あなたの負けです...');
				else UI.updateMessage('あなたの勝ちです！');
				return;
			}
			Game.switchTurnTo('player');
			UI.updateMessage('あなたの番です。');
		});
	}
}

function handleSplitButtonClick(e) {
	// Intercept split button when it's AI's turn: open modal to choose AI split
	if (Game.gameOver) return;
	if (Game.currentPlayer !== 'ai') return; // only for AI turn

	// prevent main.js handler
	e.stopPropagation();
	e.preventDefault();

	// Reuse openSplitModal by passing a fake state where AI's hands appear as the "player" hands
	// so the modal computes possible splits from the AI's total.
	const fakeState = { playerHands: Game.aiHands.slice(), aiHands: Game.playerHands.slice(), currentPlayer: 'player', gameOver: Game.gameOver };
	UI.openSplitModal(fakeState, null, (val0, val1) => {
		UI.performAiSplitAnim(() => {
			Game.applySplit('ai', val0, val1);
			UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands, gameOver: Game.gameOver, canUndo: Game.canUndo });
			const res = Game.checkWin();
			if (res.gameOver) {
				if (res.playerLost) UI.updateMessage('あなたの負けです...');
				else UI.updateMessage('あなたの勝ちです！');
				return;
			}
			Game.switchTurnTo('player');
			UI.updateMessage('あなたの番です。');
		});
	});
}

export function initDebug() {
	// Install capture-phase handlers so they run before the normal handlers in main.js
	const container = document.getElementById('game-container');
	if (container) container.addEventListener('click', handleContainerClick, true);

	const splitBtn = document.getElementById('split-btn');
	if (splitBtn) splitBtn.addEventListener('click', handleSplitButtonClick, true);

	// Escape clears selection
	window.addEventListener('keydown', (ev) => {
		if (ev.key === 'Escape') {
			clearSelectionVisual();
			if (Game.currentPlayer === 'ai') UI.updateMessage('AIの手の選択をキャンセルしました。');
			ev.stopPropagation();
		}
	});

	// When the toggle is switched off, ensure any selection is cleared immediately.
	const toggle = document.getElementById('toggle-ai-control-cb');
	if (toggle) {
		toggle.addEventListener('change', () => {
			if (!toggle.checked) {
				clearSelectionVisual();
				// If currently AI turn, reset message back to waiting/automatic text
				if (Game.currentPlayer === 'ai') UI.updateMessage('CPUの番です。しばらくお待ちください...');
			}
		});
	}
}
