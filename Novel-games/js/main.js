/**
 * @file main.js
 * @description ゲーム全体のメインループと初期化処理を記述するファイル
 * このゲームの司令塔です。
 */

// グローバル変数として各マネージャーのインスタンスを保持
let gameManager;
let ui;

/**
 * ゲームを初期化して開始する関数
 */
function initializeGame() {
    // GameManagerを初期化
    // config.jsで定義した初期ステータスを渡す
    gameManager = new GameManager(CONFIG.INITIAL_PLAYER_STATUS);
    // 初期コンディションを計算
    gameManager.updateCondition();

    // UIManagerを初期化
    ui = new UIManager();

    console.log('ゲームの初期化が完了しました。');

    // 初期状態を画面に反映
    ui.updateStatusDisplay(gameManager.getStatus());

    // 開始イベントを呼び出す
    GameEventManager.startGame();
}

/**
 * Webページが読み込まれたら、ゲームを開始する
 */
window.onload = function() {
    initializeGame();
};
