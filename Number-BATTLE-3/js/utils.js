// ユーティリティ関数
function switchTurn(nextPlayer) {
	currentPlayer = nextPlayer;
	if (nextPlayer === 'ai') {
		splitBtn.disabled = true;
		updateMessage("相手の番です...");
		setTimeout(aiTurn, 1000);
	} else {
		splitBtn.disabled = false;
		updateMessage("あなたの番です。攻撃する手を選んでください。");
	}
}

function checkWin() {
	const playerLost = playerHands[0] === 0 && playerHands[1] === 0;
	const aiLost = aiHands[0] === 0 && aiHands[1] === 0;

	if (playerLost || aiLost) {
		gameOver = true;
		if (playerLost) {
			updateMessage("あなたの負けです...");
		} else {
			updateMessage("あなたの勝ちです！🎉");
		}
		splitBtn.classList.add('hidden');
		restartBtn.classList.remove('hidden');
		return true;
	}
	return false;
}

// 汎用アクション関数
function performAction(actionType, actor, target) {
	if (actionType === 'attack') {
		target.hand = (actor.hand + target.hand) % 5;
	} else if (actionType === 'split') {
		// 分割ロジックをここに記述
	}
	checkWinCondition();
}