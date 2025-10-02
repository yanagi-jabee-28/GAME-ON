// デバッグ機能をまとめたファイル

function logAvailableActions() {
    console.log("現在の状態:");
    console.log("プレイヤーの手:", gameState.playerHands);
    console.log("AIの手:", gameState.aiHands);
    console.log("現在のターン:", gameState.currentPlayer);

    const availablePlayerActions = gameState.playerHands.map((hand, index) => {
        if (hand > 0) {
            return `プレイヤーの手${index + 1}で攻撃可能`;
        }
        return null;
    }).filter(action => action !== null);

    const availableAiActions = gameState.aiHands.map((hand, index) => {
        if (hand > 0) {
            return `AIの手${index + 1}で攻撃可能`;
        }
        return null;
    }).filter(action => action !== null);

    console.log("プレイヤーの可能な行動:", availablePlayerActions);
    console.log("AIの可能な行動:", availableAiActions);
}