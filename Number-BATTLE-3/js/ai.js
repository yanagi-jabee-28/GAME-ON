// AIロジック
function aiTurn() {
	if (gameOver) return;

	const actor = { hand: aiHands[0] }; // 例としてAIの最初の手を使用
	const target = { hand: playerHands[0] }; // 例としてプレイヤーの最初の手を使用

	performAction('attack', actor, target);
}