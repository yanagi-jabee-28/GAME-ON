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

	// CONFIG.LABELS が定義されていれば、固定テキストラベルを差し替える
	try {
		if (CONFIG && CONFIG.LABELS) {
			// ステータス表示の静的ラベルを置換
			const statusDisplay = document.getElementById('status-display');
			if (statusDisplay) {
				// トップ行のラベル
				const labelDate = document.getElementById('label-date');
				if (labelDate) labelDate.textContent = CONFIG.LABELS.date || labelDate.textContent;
				const labelTime = document.getElementById('label-time');
				if (labelTime) labelTime.textContent = CONFIG.LABELS.timeOfDay || labelTime.textContent;

				// 下段のチップのラベル
				const labelPhysical = document.getElementById('label-physical');
				if (labelPhysical) labelPhysical.textContent = CONFIG.LABELS.physical || labelPhysical.textContent;
				const labelMental = document.getElementById('label-mental');
				if (labelMental) labelMental.textContent = CONFIG.LABELS.mental || labelMental.textContent;
				const labelTechnical = document.getElementById('label-technical');
				if (labelTechnical) labelTechnical.textContent = CONFIG.LABELS.technical || labelTechnical.textContent;
				const labelMoney = document.getElementById('label-money');
				if (labelMoney) labelMoney.textContent = CONFIG.LABELS.money || labelMoney.textContent;
				const labelCp = document.getElementById('label-cp');
				if (labelCp) labelCp.textContent = CONFIG.LABELS.cp || labelCp.textContent;
			}

			// メニュー内の見出し
			const menuTitle = document.querySelector('#menu-content h2');
			if (menuTitle) menuTitle.textContent = CONFIG.LABELS.menu || menuTitle.textContent;
			const itemSectionH3 = document.querySelector('#menu-item-section h3');
			if (itemSectionH3) itemSectionH3.textContent = CONFIG.LABELS.items || itemSectionH3.textContent;
			const saveLoadH3 = document.querySelector('#menu-save-load-section h3');
			if (saveLoadH3) saveLoadH3.textContent = CONFIG.LABELS.saveLoad || saveLoadH3.textContent;
		}
	} catch (e) { console.warn('Label injection failed', e); }

	// UIManagerを初期化
	ui = new UIManager();
	// メニューボタンのイベントリスナーを設定
	ui.initializeMenuListeners();

	console.log('ゲームの初期化が完了しました。');

	// 初期状態を画面に反映
	ui.updateStatusDisplay(gameManager.getStatus());

	// サンプル: 進行中のレポートを1件追加（将来の拡張テスト用）
	gameManager.addReport({ id: 'report-1', title: 'プログラミング演習レポート', progress: 0, required: 3 });
	ui.updateStatusDisplay(gameManager.getStatus());

	// 開始イベントを呼び出す
	GameEventManager.startGame();
}

/**
 * Webページが読み込まれたら、ゲームを開始する
 */
window.onload = function () {
	initializeGame();
};
