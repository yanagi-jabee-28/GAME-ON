// ゲームシステム関連のコード
const gameState = {
	playerHands: [1, 1],
	aiHands: [1, 1],
	currentPlayer: 'player',
	gameOver: false,
};

function initGame() {
	resetGameState();

	restartBtn.classList.add('hidden');
	splitBtn.classList.remove('hidden');
	splitBtn.disabled = false;

	updateDisplay();
	updateMessage("あなたの番です。攻撃する手を選んでください。");
}

function resetGameState() {
	gameState.playerHands = [1, 1];
	gameState.aiHands = [1, 1];
	gameState.currentPlayer = 'player';
	gameState.gameOver = false;
}

function updateDisplay() {
	playerHandElements.forEach((el, i) => {
		el.textContent = gameState.playerHands[i];
		el.classList.toggle('disabled', gameState.playerHands[i] === 0);
		el.classList.remove('selected');
	});
	aiHandElements.forEach((el, i) => {
		el.textContent = gameState.aiHands[i];
		el.classList.toggle('disabled', gameState.aiHands[i] === 0);
		el.classList.remove('selected');
	});
}

function updateMessage(msg) {
	messageEl.textContent = msg;
}

function handlePlayerAction(actionType, handIndex) {
	const actor = { hand: gameState.playerHands[handIndex] };
	const target = { hand: gameState.aiHands[0] }; // 例としてAIの最初の手を使用

	performAction(actionType, actor, target);
}