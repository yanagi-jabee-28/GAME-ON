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
 * @param {string} protagonistName - 主人公の名前
 */
function initializeGame(protagonistName) {
	// UIManagerがなければ初期化
	if (!ui) {
		ui = new UIManager();
	}

	// ゲーム画面を表示
	ui.showGameScreen();

	// GameManagerを初期化
	const initialStatus = JSON.parse(JSON.stringify(CONFIG.INITIAL_PLAYER_STATUS));
	if (protagonistName) {
		// 主人公の名前をキャラクターデータとして追加
		if (!initialStatus.characters) initialStatus.characters = [];
		initialStatus.characters.push({ id: 'player', name: protagonistName, trust: 50 });

		// 初期仲間キャラクターを追加（ランダムイベント等はなし、一覧表示のみ）
		initialStatus.characters.push({ id: 'wakabayashi', name: 'わかばやし', trust: 50 });
		initialStatus.characters.push({ id: 'yamasato', name: 'やまさと', trust: 50 });
		initialStatus.characters.push({ id: 'yamazaki', name: 'やまざき', trust: 50, notes: 'ニックネーム: しずちゃん' });
	}
	gameManager = new GameManager(initialStatus);
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

	// メニューボタンのイベントリスナーを設定
	ui.initializeMenuListeners();

	console.log('ゲームの初期化が完了しました。');

	// Play game start sound if available
	try { if (typeof soundManager !== 'undefined') soundManager.play('game_start'); } catch (e) { }

	// 初期状態を画面に反映
	ui.updateStatusDisplay(gameManager.getStatus());

	// サンプル: 進行中のレポートを1件追加（将来の拡張テスト用）
	gameManager.addReport({ id: 'report-1', title: 'プログラミング演習レポート', progress: 0, required: 3 });
	ui.updateStatusDisplay(gameManager.getStatus());

	// 開始イベントを呼び出す
	GameEventManager.startGame();
}

/**
 * タイトル画面を初期化する
 */
function initializeTitleScreen() {
	ui = new UIManager();
	ui.showTitleScreen();

	const newGameButton = document.getElementById('new-game-button');
	const loadGameButton = document.getElementById('load-game-button-title');
	const protagonistNameInput = document.getElementById('protagonist-name');

	newGameButton.addEventListener('click', () => {
		const name = protagonistNameInput.value.trim();
		if (name) {
			try { if (typeof soundManager !== 'undefined') soundManager.play('game_start'); } catch (e) { }
			initializeGame(name);
		} else {
			ui.showTransientNotice('主人公の名前を入力してください。');
		}
	});

	loadGameButton.addEventListener('click', () => {
		// ui.jsにロード処理を実装し、それを呼び出す
		ui.handleLoadGame(true); // isTitle=true を渡す
	});
}

/**
 * Webページが読み込まれたら、タイトル画面を開始する
 */
window.onload = function () {
	initializeTitleScreen();
};