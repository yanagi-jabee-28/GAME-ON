/**
 * @file main.js
 * @description ゲーム全体のメインループと初期化処理を記述するファイル
 * このゲームの司令塔です。
 */

import { CONFIG } from "./config.ts";
import { GameEventManager } from "./events.ts";
import { GameManager } from "./gameManager.ts";
import { ITEMS } from "./items.ts";
import { SoundManager } from "./soundManager.ts";
import { UIManager } from "./ui.ts";

// グローバル変数として各マネージャーのインスタンスを保持
let gameManager;
let ui;
let soundManager;

// soundManagerを初期化
soundManager = new SoundManager();

// Register default synthetic click variations
try {
	const variations = [];
	["click_var_1", "click_var_2", "click_var_3"].forEach((k) => {
		if (
			soundManager.synthetic &&
			typeof soundManager.synthetic[k] === "function"
		) {
			variations.push(soundManager.synthetic[k].bind(soundManager));
		}
	});
	if (variations.length > 0)
		soundManager.registerVariations("click", variations);
} catch (e) {
	console.warn("Failed to register click variations", e);
}

// グローバルスコープに公開（他のモジュールから参照できるように）
// 注意: gameManagerとuiは初期化後に再度割り当てる
window.soundManager = soundManager;
// Assign as-is; window typing is augmented in global.d.ts
window.GameEventManager = GameEventManager as any;
window.ITEMS = ITEMS;
window.CONFIG = CONFIG;

/**
 * ゲームを初期化して開始する関数
 * @param {string} protagonistName - 主人公の名前
 */
function initializeGame(protagonistName) {
	// UIManagerがなければ初期化
	if (!ui) {
		ui = new UIManager();
		window.ui = ui; // グローバルに公開
	}

	// ゲーム画面を表示
	ui.showGameScreen();

	// GameManagerを初期化
	const initialStatus = JSON.parse(
		JSON.stringify(CONFIG.INITIAL_PLAYER_STATUS),
	);
	if (protagonistName) {
		// 主人公の名前をキャラクターデータとして追加
		if (!initialStatus.characters) initialStatus.characters = [];
		initialStatus.characters.push({
			id: "player",
			name: protagonistName,
			trust: 50,
		});

		// 初期仲間キャラクターを追加（ランダムイベント等はなし、一覧表示のみ）
		initialStatus.characters.push({
			id: "wakabayashi",
			name: "わかばやし",
			trust: 50,
		});
		initialStatus.characters.push({
			id: "yamasato",
			name: "やまさと",
			trust: 50,
		});
		initialStatus.characters.push({
			id: "yamazaki",
			name: "やまざき",
			trust: 50,
			notes: "ニックネーム: しずちゃん",
		});
	}
	gameManager = new GameManager(initialStatus);
	gameManager.updateCondition();

	// グローバルに公開
	window.gameManager = gameManager;

	// CONFIG.LABELS が定義されていれば、固定テキストラベルを差し替える
	try {
		if (CONFIG && (CONFIG as any).LABELS) {
			// ステータス表示の静的ラベルを置換
			const statusDisplay = document.getElementById("status-display");
			if (statusDisplay) {
				// トップ行のラベル
				const labelDate = document.getElementById("label-date");
				if (labelDate)
					labelDate.textContent = (CONFIG as any).LABELS.date || labelDate.textContent;
				const labelTime = document.getElementById("label-time");
				if (labelTime)
					labelTime.textContent =
						(CONFIG as any).LABELS.timeOfDay || labelTime.textContent;

				// 下段のチップのラベル
				const labelPhysical = document.getElementById("label-physical");
				if (labelPhysical)
					labelPhysical.textContent =
						(CONFIG as any).LABELS.physical || labelPhysical.textContent;
				const labelMental = document.getElementById("label-mental");
				if (labelMental)
					labelMental.textContent =
						(CONFIG as any).LABELS.mental || labelMental.textContent;
				const labelTechnical = document.getElementById("label-technical");
				if (labelTechnical)
					labelTechnical.textContent =
						(CONFIG as any).LABELS.technical || labelTechnical.textContent;
				const labelMoney = document.getElementById("label-money");
				if (labelMoney)
					labelMoney.textContent =
						(CONFIG as any).LABELS.money || labelMoney.textContent;
				const labelCp = document.getElementById("label-cp");
				if (labelCp)
					labelCp.textContent = (CONFIG as any).LABELS.cp || labelCp.textContent;
			}

			// メニュー内の見出し
			const menuTitle = document.querySelector("#menu-content h2");
			if (menuTitle)
				menuTitle.textContent = (CONFIG as any).LABELS.menu || menuTitle.textContent;
			const itemSectionH3 = document.querySelector("#menu-item-section h3");
			if (itemSectionH3)
				itemSectionH3.textContent =
					(CONFIG as any).LABELS.items || itemSectionH3.textContent;
			const saveLoadH3 = document.querySelector("#menu-save-load-section h3");
			if (saveLoadH3)
				saveLoadH3.textContent =
					(CONFIG as any).LABELS.saveLoad || saveLoadH3.textContent;
		}
	} catch (e) {
		console.warn("Label injection failed", e);
	}

	// メニューボタンのイベントリスナーを設定
	ui.initializeMenuListeners();

	console.log("ゲームの初期化が完了しました。");

	// Play game start sound if available
	try {
		if (typeof soundManager !== "undefined") soundManager.play("game_start");
	} catch (e) { }

	// 初期状態を画面に反映
	ui.updateStatusDisplay(gameManager.getStatus());

	// サンプル: 進行中のレポートを1件追加（将来の拡張テスト用）
	gameManager.addReport({
		id: "report-1",
		title: "プログラミング演習レポート",
		progress: 0,
		required: 2,
	});
	ui.updateStatusDisplay(gameManager.getStatus());

	// 開始イベントを呼び出す
	GameEventManager.startGame();
}

/**
 * タイトル画面を初期化する
 */
function initializeTitleScreen() {
	ui = new UIManager();
	window.ui = ui; // グローバルに公開
	ui.showTitleScreen();

	const newGameButton = document.getElementById("new-game-button");
	const loadGameButton = document.getElementById("load-game-button-title");
	const protagonistNameInput = /** @type {HTMLInputElement|null} */ (
		document.getElementById("protagonist-name")
	);

	if (!newGameButton || !loadGameButton || !protagonistNameInput) return;

	newGameButton.addEventListener("click", () => {
		const rawValue = protagonistNameInput.value;
		const name = typeof rawValue === "string"
			? rawValue.trim()
			: String(rawValue ?? "").trim();
		if (name) {
			try {
				if (typeof soundManager !== "undefined")
					soundManager.play("game_start");
			} catch (e) { }
			initializeGame(name);
		} else {
			ui.showTransientNotice("主人公の名前を入力してください。");
		}
	});

	loadGameButton.addEventListener("click", () => {
		// ui.jsにロード処理を実装し、それを呼び出す
		ui.handleLoadGame(true); // isTitle=true を渡す
	});
}

/**
 * Webページが読み込まれたら、タイトル画面を開始する
 */
window.onload = () => {
	initializeTitleScreen();
};
