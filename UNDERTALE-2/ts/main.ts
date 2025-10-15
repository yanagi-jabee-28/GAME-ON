/**
 * このファイルは、アプリケーションのエントリーポイント（開始点）です。
 * ページの読み込みが完了した後に実行され、以下の役割を担います。
 * - 必要なHTML要素の取得
 * - ゲームの初期設定（プレイフィールドサイズ、敵シンボルなど）
 * - グローバルなイベントリスナー（キーボード入力など）の登録
 * - ゲームループの開始
 * - UI要素（FIGHTボタンなど）へのイベント処理の紐付け
 */
import {
	ACTION_BUTTON_FONT_SIZE,
	HEART_SIZE,
	PLAYER_STATUS_FONT_SIZE,
	PLAYFIELD_INITIAL_HEIGHT,
	PLAYFIELD_INITIAL_WIDTH,
} from "./constants.ts";
import {
	addEnemySymbol,
	clearKeys,
	handleKeyDown,
	handleKeyUp,
	startDemoScenario,
	startGameLoop,
	stopSpawning,
} from "./game.ts";
import { centerPlayer, loadSvg } from "./player.ts";

// --- HTML要素の取得 ---
const playfield = document.getElementById("playfield");
const heart = document.getElementById("heart");
const entityLayer = document.getElementById("entity-layer");
const enemyDisplay = document.getElementById("enemy-display");

/**
 * FIGHTボタンが押された後、プレイフィールドのリサイズアニメーションが
 * 完了してからハートを表示するためのフラグ。
 */
let pendingShowHeart = false;
// combat timer id (ms) used to end combat after attack duration
let combatTimer: number | null = null;

// --- 必須要素の存在チェック ---
if (
	!(playfield instanceof HTMLElement) ||
	!(heart instanceof HTMLElement) ||
	!(entityLayer instanceof HTMLElement) ||
	!(enemyDisplay instanceof HTMLElement)
) {
	// ゲームの実行に必要な要素が見つからない場合は、エラーを投げて処理を中断
	throw new Error("必要な要素が見つかりませんでした。");
}

// --- ゲームの初期設定 ---

// プレイフィールドの初期サイズを設定
playfield.style.width = `${PLAYFIELD_INITIAL_WIDTH}px`;
playfield.style.height = `${PLAYFIELD_INITIAL_HEIGHT}px`;

// 画面上部に表示する敵のシンボルを初期状態で追加
addEnemySymbol("skull", "emoji", "\u2620"); // 💀
addEnemySymbol("fish", "emoji", "\ud83d\udc1f\ufe0f"); // 🐟️
addEnemySymbol(
	"papyrus",
	"image",
	// 画像URLを解決
	new URL("../assets/icons8-\u30d1\u30d4\u30eb\u30b9-100.png", import.meta.url)
		.href,
);

// --- グローバルイベントリスナーの登録 ---

// キーが押された時と離された時のイベントを捕捉
document.addEventListener("keydown", handleKeyDown, { passive: false });
document.addEventListener("keyup", handleKeyUp, { passive: false });
// ウィンドウからフォーカスが外れたら、押されているキーの状態をリセット
window.addEventListener("blur", clearKeys);

// --- ゲームの開始処理 ---

// プレイヤー（ハート）のSVG画像を非同期で読み込む
loadSvg().then(() => {
	// SVG読み込み完了後の処理

	// CSSカスタムプロパティ（変数）を設定して、UIのスタイルを動的に変更
	try {
		const status = document.getElementById("player-status");
		if (status instanceof HTMLElement) {
			status.style.setProperty("--player-font-size", PLAYER_STATUS_FONT_SIZE);
		}
	} catch {
		// エラーが発生しても処理を続行
	}
	try {
		document.documentElement.style.setProperty(
			"--action-button-font-size",
			ACTION_BUTTON_FONT_SIZE,
		);
	} catch {}
	try {
		document.documentElement.style.setProperty("--heart-size", HEART_SIZE);
	} catch {
		// ignore
	}

	// ゲームのメインループを開始
	startGameLoop(playfield);

	// FIGHTボタンにクリックイベントリスナーを登録
	const fightBtn = document.querySelector(
		"#action-menu .action-button:first-of-type",
	) as HTMLButtonElement | null;

	if (fightBtn) {
		fightBtn.addEventListener("click", async () => {
			try {
				// ハート表示を予約
				pendingShowHeart = true;

				// 戦闘開始時にプレイヤーオーバーレイのテキストを隠す
				try {
					const overlay = document.getElementById("player-overlay");
					if (overlay instanceof HTMLElement)
						overlay.style.visibility = "hidden";
				} catch {}

				// 攻撃バーのSVGを表示する
				try {
					const inner = document.querySelector(
						".playfield-inner",
					) as HTMLElement | null;
					if (inner) {
						// 既に存在する場合は追加しない
						if (!document.getElementById("attack-bar-overlay")) {
							try {
								// SVGファイルを非同期で取得してDOMに挿入
								const svgUrl = new URL(
									"../assets/attack-bar.svg",
									import.meta.url,
								).href;
								const resp = await fetch(svgUrl);
								if (resp.ok) {
									const text = await resp.text();
									const parser = new DOMParser();
									const doc = parser.parseFromString(text, "image/svg+xml");
									const svg = doc.documentElement as unknown as SVGSVGElement;
									// スタイルを調整してコンテナにフィットさせる
									svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
									svg.style.position = "absolute";
									svg.style.left = "0";
									svg.style.top = "0";
									svg.style.width = "100%";
									svg.style.height = "100%";
									svg.id = "attack-bar-overlay";
									svg.setAttribute("aria-hidden", "true");
									svg.style.pointerEvents = "none";
									inner.appendChild(svg);
								} else {
									// fetchに失敗した場合は<img>要素でフォールバック
									const img = document.createElement("img");
									img.id = "attack-bar-overlay";
									img.src = svgUrl;
									// ...同様のスタイル設定
									inner.appendChild(img);
								}
							} catch {
								// SVG処理でエラーが出た場合も<img>でフォールバック
								const innerImg = document.createElement("img");
								// ...同様の処理
								inner.appendChild(innerImg);
							}
						}
					}
				} catch {}

				// 攻撃バーを1秒間表示
				await new Promise((res) => setTimeout(res, 1000));

				// プレイフィールドのリサイズ前に攻撃バーを削除
				try {
					const existing = document.getElementById("attack-bar-overlay");
					existing?.parentElement?.removeChild(existing);
				} catch {}

				// プレイフィールドを戦闘用のサイズ (240x240) に変更
				playfield.style.width = "240px";
				playfield.style.height = "240px";
				// デバッグモジュールのサイズ情報も更新
				import("./debug.ts").then((dbg) => {
					try {
						dbg.playfieldWidth = 240;
						dbg.playfieldHeight = 240;
						if (typeof dbg.applyPlayfieldSize === "function")
							dbg.applyPlayfieldSize();
					} catch {}
				});
			} catch {}

			// デモ用のエンティティ出現シナリオを開始
			startDemoScenario(playfield);

			// Start a 10-second combat timer. When it expires, stop spawning,
			// hide the heart and restore UI/playfield to pre-fight state.
			try {
				if (combatTimer) {
					clearTimeout(combatTimer);
					combatTimer = null;
				}
				combatTimer = window.setTimeout(() => {
					try {
						stopSpawning(); // clears entities and dispatches game:spawningStopped
					} catch {}
					try {
						heart.style.visibility = "hidden";
						document.dispatchEvent(new CustomEvent("player:heartHidden"));
						// restore playfield size to initial
						playfield.style.width = `${PLAYFIELD_INITIAL_WIDTH}px`;
						playfield.style.height = `${PLAYFIELD_INITIAL_HEIGHT}px`;
						import("./debug.ts").then((dbg) => {
							try {
								dbg.playfieldWidth = PLAYFIELD_INITIAL_WIDTH;
								dbg.playfieldHeight = PLAYFIELD_INITIAL_HEIGHT;
								if (typeof dbg.applyPlayfieldSize === "function")
									dbg.applyPlayfieldSize();
							} catch {}
						});
					} catch {}
					combatTimer = null;
				}, 10000);
			} catch {}
		});
	}
});

// プレイフィールドのCSSトランジション（サイズ変更アニメーション）が完了したときの処理
playfield.addEventListener("transitionend", (ev) => {
	// widthかheightのアニメーションが終わった時のみ実行
	if (ev.propertyName === "width" || ev.propertyName === "height") {
		// デバッグ用のスポーンラインを再描画
		import("./debug.ts").then((dbg) => {
			try {
				if (typeof dbg.refreshSpawnLines === "function")
					dbg.refreshSpawnLines();
			} catch {}
		});

		// プレイヤーを新しいプレイフィールドの中央に配置
		try {
			centerPlayer(playfield);
		} catch {}

		// ハートの表示が予約されていれば、ここで表示する
		try {
			if (pendingShowHeart) {
				pendingShowHeart = false;
				heart.style.visibility = "visible";
				// ハートが表示されたことを他のUI部分に通知
				document.dispatchEvent(new CustomEvent("player:heartShown"));
				// 攻撃バーが残っていれば削除
				try {
					const existing = document.getElementById("attack-bar-overlay");
					existing?.parentElement?.removeChild(existing);
				} catch {}
			}
		} catch {}
	}
});
