// game.js - ゲーム状態と基本操作
export let playerHands = [1, 1];
export let aiHands = [1, 1];
export let currentPlayer = 'player';
export let selectedHand = { owner: null, index: null };
export let gameOver = false;
export let isAnimating = false;

export function initState() {
	playerHands = [1, 1];
	aiHands = [1, 1];
	currentPlayer = 'player';
	selectedHand = { owner: null, index: null };
	gameOver = false;
	isAnimating = false;
}

export function checkWin() {
	const playerLost = playerHands[0] === 0 && playerHands[1] === 0;
	const aiLost = aiHands[0] === 0 && aiHands[1] === 0;

	if (playerLost || aiLost) {
		gameOver = true;
		return { gameOver: true, playerLost };
	}
	return { gameOver: false };
}

export function setSelectedHand(owner, index) {
	selectedHand = { owner, index };
}

export function applyAttack(fromOwner, attackerIndex, toOwner, targetIndex) {
	if (fromOwner === 'player' && toOwner === 'ai') {
		aiHands[targetIndex] = (playerHands[attackerIndex] + aiHands[targetIndex]) % 5;
	} else if (fromOwner === 'ai' && toOwner === 'player') {
		playerHands[targetIndex] = (aiHands[attackerIndex] + playerHands[targetIndex]) % 5;
	}
}

export function applySplit(owner, val0, val1) {
	if (owner === 'player') {
		playerHands[0] = val0;
		playerHands[1] = val1;
	} else {
		aiHands[0] = val0;
		aiHands[1] = val1;
	}
}

export function switchTurnTo(next) {
	currentPlayer = next;
}
