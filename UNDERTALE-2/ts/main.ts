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
	ATTACK_BOX_DURATION_MS,
	ATTACK_BOX_WIDTH,
	COMBAT_DURATION_MS,
	HEART_SIZE,
	isCancelKey,
	isConfirmKey,
	isMoveLeftKey,
	isMoveRightKey,
	PLAYER_OVERLAY_FONT_SIZE,
	PLAYER_STATUS_FONT_SIZE,
	PLAYFIELD_INITIAL_HEIGHT,
	PLAYFIELD_INITIAL_WIDTH,
} from "./constants.ts";
import {
	addEnemySymbol,
	clearKeys,
	getEnemySymbols,
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
const attackBox = document.getElementById("attack-box");

/**
 * FIGHTボタンが押された後、プレイフィールドのリサイズアニメーションが
 * 完了してからハートを表示するためのフラグ。
 */
let pendingShowHeart = false;
// combat timer id (ms) used to end combat after attack duration
let combatTimer: number | null = null;
// flag indicating the game over sequence has started
let isGameOver = false;

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

// スペースキーのデフォルト動作を完全に無効化
document.addEventListener(
	"keydown",
	(e) => {
		if (e.key === " " || e.key === "Spacebar") {
			e.preventDefault();
		}
	},
	{ passive: false },
);

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
		// ignore
	}
	try {
		document.documentElement.style.setProperty(
			"--player-overlay-font-size",
			PLAYER_OVERLAY_FONT_SIZE,
		);
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

	// Register gamestop handler BEFORE startGameLoop so it runs first
	// and sets isGameOver flag before game:spawningStopped is dispatched
	document.addEventListener("gamestop", () => {
		isGameOver = true;
		// cancel any pending combat timer to avoid premature reset
		if (combatTimer) {
			clearTimeout(combatTimer);
			combatTimer = null;
		}
	});

	// ゲームのメインループを開始
	startGameLoop(playfield);

	// FIGHTボタンにクリックイベントリスナーを登録
	const fightBtn = document.querySelector(
		"#action-menu .action-button:first-of-type",
	) as HTMLButtonElement | null;

	if (fightBtn && attackBox) {
		fightBtn.addEventListener("click", async () => {
			try {
				// Prevent double-clicks: disable action buttons immediately (DOM only)
				const allButtons = Array.from(
					document.querySelectorAll("#action-menu .action-button"),
				) as (HTMLElement | HTMLButtonElement)[];
				allButtons.forEach((b) => {
					if (b instanceof HTMLButtonElement) b.disabled = true;
					b.classList.add("disabled");
				});

				// ハート表示を予約
				pendingShowHeart = true;

				// プレイヤーオーバーレイに敵リストを表示
				try {
					const overlay = document.getElementById("player-overlay");
					if (overlay instanceof HTMLElement) {
						// 敵リスト表示中は行動選択を無効化
						const enemyListShownEvent = new CustomEvent(
							"combat:enemyListShown",
						);
						document.dispatchEvent(enemyListShownEvent);

						// 敵シンボルを取得して名前リストを作成
						const enemies = getEnemySymbols();
						const enemyNames: { [key: string]: string } = {
							skull: "がいこつ",
							fish: "さかな",
							papyrus: "パピルス",
						};

						if (enemies.length > 0) {
							const nameList = enemies
								.map((e) => enemyNames[e.id] || e.id)
								.join("\n");
							overlay.textContent = nameList;
						} else {
							overlay.textContent = "(敵なし)";
						}

						overlay.style.visibility = "visible";

						// 決定キーまたはキャンセルキーが押されるまで待機
						const userAction = await new Promise<"confirm" | "cancel">(
							(resolve) => {
								const handleKeyPress = (e: KeyboardEvent) => {
									if (isConfirmKey(e.key)) {
										e.preventDefault();
										document.removeEventListener("keydown", handleKeyPress);
										resolve("confirm");
									} else if (isCancelKey(e.key)) {
										e.preventDefault();
										document.removeEventListener("keydown", handleKeyPress);
										resolve("cancel");
									}
								};
								document.addEventListener("keydown", handleKeyPress);
							},
						);

						// オーバーレイを非表示
						overlay.style.visibility = "hidden";

						// キャンセルされた場合は、処理を中断して行動選択に戻る
						if (userAction === "cancel") {
							// キャンセル時のみ行動選択を再有効化
							const enemyListHiddenEvent = new CustomEvent(
								"combat:enemyListHidden",
							);
							document.dispatchEvent(enemyListHiddenEvent);
							return;
						}

						// 決定キーの場合は行動選択を再有効化せず、
						// そのまま攻撃バー表示に進む（無効状態を維持）
					}
				} catch (err) {
					console.error("敵リスト表示エラー:", err);
				} // 攻撃バーのSVGを表示する
				try {
					const inner = document.querySelector(
						".playfield-inner",
					) as HTMLElement | null;
					if (inner) {
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
									// notify that the attack bar overlay is now visible (svg)
									document.dispatchEvent(
										new CustomEvent("combat:attackBarShown"),
									);
								} else {
									// fetchに失敗した場合は<img>要素でフォールバック
									const img = document.createElement("img");
									img.id = "attack-bar-overlay";
									img.src = svgUrl;
									// ...同様のスタイル設定
									inner.appendChild(img);
									// notify that the attack bar overlay is now visible (img fallback)
									document.dispatchEvent(
										new CustomEvent("combat:attackBarShown"),
									);
								}
							} catch {
								// SVG処理でエラーが出た場合も<img>でフォールバック
								const innerImg = document.createElement("img");
								// ...同様の処理
								inner.appendChild(innerImg);
								// notify that the attack bar overlay is now visible (inner img fallback)
								document.dispatchEvent(
									new CustomEvent("combat:attackBarShown"),
								);
							}
						}
					}
				} catch {}

				// 攻撃ボックスを表示してアニメーション開始
				try {
					if (attackBox instanceof HTMLElement) {
						// 攻撃ボックスの幅の半分だけ左にはみ出した位置から開始
						// (攻撃ボックスの中心が枠線の中心に来るように)
						const startX = -(ATTACK_BOX_WIDTH / 2); // -10px

						// 攻撃ボックスを初期位置にセット（左端より少し外側）
						attackBox.style.visibility = "visible";
						attackBox.style.transform = `translateX(${startX}px)`;

						// startXから720px移動する（終了位置は710px）
						const distance = PLAYFIELD_INITIAL_WIDTH; // 720px
						const endX = startX + distance; // -10 + 720 = 710px
						const duration = ATTACK_BOX_DURATION_MS; // 1000ms

						// Web Animations API を使ってアニメーション
						attackBox.animate(
							[
								{ transform: `translateX(${startX}px)` },
								{ transform: `translateX(${endX}px)` },
							],
							{
								duration: duration,
								easing: "linear",
								fill: "forwards",
							},
						);

						// アニメーション完了後に非表示
						setTimeout(() => {
							if (attackBox instanceof HTMLElement) {
								attackBox.style.visibility = "hidden";
							}
						}, duration);
					}
				} catch (err) {
					console.error("攻撃ボックスのアニメーションエラー:", err);
				}

				// 攻撃バーを1秒間表示
				await new Promise((res) => setTimeout(res, 1000));

				// プレイフィールドのリサイズ前に攻撃バーを削除
				try {
					const existing = document.getElementById("attack-bar-overlay");
					if (existing?.parentElement) {
						existing.parentElement.removeChild(existing);
						// notify that the attack bar overlay was removed/hidden
						document.dispatchEvent(new CustomEvent("combat:attackBarHidden"));
					}
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

			// Start combat timer. When it expires, stop spawning,
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
					if (!isGameOver) {
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
						document.dispatchEvent(new CustomEvent("combat:timelineEnded"));
					}
					combatTimer = null;
				}, COMBAT_DURATION_MS);
			} catch {}
		});
	}

	// --- 移動した index.html 内スクリプトの初期化処理 ---
	try {
		// HPバーの初期表示を aria 属性に基づき反映する
		(function initHpBar() {
			const bar = document.querySelector(
				'#player-status .status-hp-bar[role="progressbar"]',
			) as HTMLElement | null;
			const fill = bar?.querySelector(".status-hp-fill") as HTMLElement | null;
			if (!bar || !fill) return;
			const now = Number(bar.getAttribute("aria-valuenow") ?? 0);
			const max = Number(bar.getAttribute("aria-valuemax") ?? 100);
			const pct =
				!Number.isFinite(now) || !Number.isFinite(max) || max <= 0
					? 0
					: (now / max) * 100;
			fill.style.width = `${pct}%`;
		})();

		// Action menu UI / keyboard navigation / overlay handlers
		(() => {
			// When player heart is shown, ensure selection images are suppressed and replaced with emoji
			document.addEventListener("player:heartShown", () => {
				const buttons = Array.from(
					document.querySelectorAll("#action-menu .action-button"),
				) as HTMLElement[];
				buttons.forEach((b) => {
					const icon = b.querySelector(".action-icon") as HTMLElement | null;
					if (!icon) return;
					const usesHeartIcon = icon.getAttribute("data-heart-icon") === "true";
					if (!usesHeartIcon) return;
					const img = icon.querySelector("img.action-icon-img");
					if (img) {
						img.remove();
						icon.textContent = icon.getAttribute("data-emoji") || "";
						icon.removeAttribute("aria-hidden");
						icon.removeAttribute("data-heart-icon");
					}
					const svg = icon.querySelector("svg.action-icon-svg");
					if (svg) {
						svg.remove();
						icon.textContent = icon.getAttribute("data-emoji") || "";
						icon.removeAttribute("aria-hidden");
						icon.removeAttribute("data-heart-icon");
					}
				});
			});

			// GAMEOVER overlay (after heart breaking animation)
			document.addEventListener("gameover", () => {
				pendingShowHeart = false;
				const overlay = document.getElementById("gameover-overlay");
				if (!overlay) return;
				overlay.setAttribute("aria-hidden", "false");
				const retry = document.getElementById("retry-button");
				if (retry instanceof HTMLElement) {
					retry.focus();
					retry.addEventListener("click", () => {
						window.location.reload();
					});
				}
			});

			// Allow pressing 'R' or confirm key to retry when gameover overlay is visible
			document.addEventListener("keydown", (e) => {
				const overlay = document.getElementById("gameover-overlay");
				if (!overlay || overlay.getAttribute("aria-hidden") !== "false") return;
				const key = e.key;

				// スペースキーを無効化（ブラウザのデフォルト動作を防ぐ）
				if (key === " " || key === "Spacebar") {
					e.preventDefault();
					return;
				}

				if (key?.toLowerCase() === "r" || isConfirmKey(key)) {
					e.preventDefault();
					window.location.reload();
				}
			}); // Action menu icon management API
			const buttons = Array.from(
				document.querySelectorAll("#action-menu .action-button"),
			) as HTMLElement[];
			function getIconEl(idx: number) {
				const btn = buttons[idx];
				if (!btn) return null;
				return btn.querySelector(".action-icon") as HTMLElement | null;
			}

			type ActionMenu = {
				setIcon(idx: number, imgSrc: string): void;
				clearIcon(idx: number): void;
				showIcon(idx: number, visible?: boolean): void;
			};

			(window as Window & { actionMenu?: ActionMenu }).actionMenu = {
				setIcon(idx: number, imgSrc: string) {
					const icon = getIconEl(idx);
					if (!icon) return;
					const existingSvg = icon.querySelector("svg.action-icon-svg");
					if (existingSvg) existingSvg.remove();
					const img = document.createElement("img");
					img.src = imgSrc;
					img.className = "action-icon-img";
					img.alt = "";
					icon.textContent = "";
					icon.appendChild(img);
					icon.removeAttribute("data-heart-icon");
				},
				clearIcon(idx: number) {
					const icon = getIconEl(idx);
					if (!icon) return;
					const existingSvg = icon.querySelector("svg.action-icon-svg");
					if (existingSvg) existingSvg.remove();
					const existingImg = icon.querySelector("img.action-icon-img");
					if (existingImg) existingImg.remove();
					icon.textContent = icon.getAttribute("data-emoji") || "";
					icon.removeAttribute("data-heart-icon");
					icon.removeAttribute("aria-hidden");
				},
				showIcon(idx: number, visible = true) {
					const icon = getIconEl(idx);
					if (!icon) return;
					icon.setAttribute("aria-hidden", visible ? "false" : "true");
				},
			};
			// preserve original emoji as data attribute for clearIcon
			buttons.forEach((b) => {
				const icon = b.querySelector(".action-icon") as HTMLElement | null;
				if (icon?.textContent) {
					icon.setAttribute("data-emoji", icon.textContent.trim());
				}
			});

			// Keyboard navigation for action menu
			(() => {
				let selectedIndex = 0;
				let navEnabled = true;
				let actionEnabled = true;
				const SVG_NS = "http://www.w3.org/2000/svg";
				const HEART_ICON_VIEWBOX = "0 0 476.36792 399.95195";
				const HEART_ICON_PATH =
					"m 238.15,437.221 v 0 C 449.09,352.067 530.371,154.668 437.481,69.515 344.582,-15.639 238.15,100.468 238.15,100.468 h -0.774 c 0,0 -106.44,-116.107 -199.331,-30.953 -92.889,85.143 -10.834,282.553 200.105,367.706 z";
				const DEFAULT_HEART_COLOR = "hsl(0 100% 50%)";
				let heartColor = DEFAULT_HEART_COLOR;

				function isHeartVisible() {
					const heartEl = document.getElementById("heart");
					return Boolean(heartEl && heartEl.style.visibility === "visible");
				}

				function createHeartIconSvg(color: string) {
					const svg = document.createElementNS(SVG_NS, "svg");
					svg.setAttribute("viewBox", HEART_ICON_VIEWBOX);
					svg.setAttribute("class", "action-icon-svg");
					svg.setAttribute("role", "presentation");
					svg.setAttribute("focusable", "false");
					const path = document.createElementNS(SVG_NS, "path");
					path.setAttribute("d", HEART_ICON_PATH);
					path.setAttribute("transform", "translate(0.34846644,-37.808257)");
					path.setAttribute("fill", color);
					path.setAttribute("stroke", "#000");
					path.setAttribute("stroke-width", "10");
					path.setAttribute("stroke-linejoin", "round");
					svg.appendChild(path);
					return svg;
				}

				function restoreIcon(iconEl: HTMLElement | null) {
					if (!iconEl) return;
					if (iconEl.getAttribute("data-heart-icon") !== "true") return;
					const existingSvg = iconEl.querySelector("svg.action-icon-svg");
					if (existingSvg) existingSvg.remove();
					const existingImg = iconEl.querySelector("img.action-icon-img");
					if (existingImg) existingImg.remove();
					iconEl.textContent = iconEl.getAttribute("data-emoji") || "";
					iconEl.removeAttribute("aria-hidden");
					iconEl.removeAttribute("data-heart-icon");
				}

				function applyHeartIcon(iconEl: HTMLElement | null) {
					if (!iconEl) return;
					const existingSvg = iconEl.querySelector("svg.action-icon-svg");
					if (existingSvg) {
						const path = existingSvg.querySelector("path");
						if (path instanceof SVGGeometryElement) {
							path.setAttribute("fill", heartColor);
						}
						iconEl.setAttribute("aria-hidden", "false");
						iconEl.setAttribute("data-heart-icon", "true");
						return;
					}
					iconEl.textContent = "";
					iconEl.appendChild(createHeartIconSvg(heartColor));
					iconEl.setAttribute("aria-hidden", "false");
					iconEl.setAttribute("data-heart-icon", "true");
				}

				function syncSelectionHeartIcons(color: string) {
					const paths = document.querySelectorAll(
						"#action-menu svg.action-icon-svg path",
					);
					paths.forEach((path) => {
						if (!(path instanceof SVGGeometryElement)) return;
						const wrapper = path.closest(".action-icon") as HTMLElement | null;
						if (!wrapper || wrapper.getAttribute("data-heart-icon") !== "true")
							return;
						path.setAttribute("fill", color);
					});
				}

				function updateSelection(newIndex: number) {
					if (newIndex < 0) newIndex = 0;
					if (newIndex >= buttons.length) newIndex = buttons.length - 1;
					if (selectedIndex === newIndex) return;
					buttons[selectedIndex].classList.remove("selected");
					const prevIcon = buttons[selectedIndex].querySelector(
						".action-icon",
					) as HTMLElement | null;
					if (prevIcon) restoreIcon(prevIcon);
					selectedIndex = newIndex;
					buttons[selectedIndex].classList.add("selected");
					const newIcon = buttons[selectedIndex].querySelector(
						".action-icon",
					) as HTMLElement | null;
					if (newIcon) {
						if (isHeartVisible()) {
							restoreIcon(newIcon);
						} else {
							applyHeartIcon(newIcon);
						}
					}
					const btn = buttons[selectedIndex];
					if (btn instanceof HTMLElement) btn.focus({ preventScroll: true });
				}

				// initialize selection
				buttons.forEach((b) => {
					b.classList.remove("selected");
				});
				if (buttons.length) {
					buttons[selectedIndex].classList.add("selected");
					const initIcon = buttons[selectedIndex].querySelector(
						".action-icon",
					) as HTMLElement | null;
					if (initIcon) {
						if (!isHeartVisible()) {
							applyHeartIcon(initIcon);
						} else {
							restoreIcon(initIcon);
						}
					}
				}

				// keyboard handling
				document.addEventListener("keydown", (e) => {
					const key = e.key;

					// スペースキーを無効化（ブラウザのデフォルト動作を防ぐ）
					if (key === " " || key === "Spacebar") {
						e.preventDefault();
						return;
					}

					if (!navEnabled && (isMoveLeftKey(key) || isMoveRightKey(key))) {
						return;
					}
					if (isMoveLeftKey(key)) {
						e.preventDefault();
						updateSelection(selectedIndex - 1);
					} else if (isMoveRightKey(key)) {
						e.preventDefault();
						updateSelection(selectedIndex + 1);
					} else if (isConfirmKey(key)) {
						e.preventDefault();
						if (!actionEnabled) return;
						const btn = buttons[selectedIndex];
						if (btn) btn.click();
					}
				});

				// Listen for spawning start/stop events to disable/enable navigation
				document.addEventListener("game:spawningStarted", () => {
					navEnabled = false;
				}); // Listen for enemy list shown/hidden events
				// to disable/enable action menu during enemy list display
				document.addEventListener("combat:enemyListShown", () => {
					navEnabled = false;
					actionEnabled = false;
					buttons.forEach((b) => {
						const icon = b.querySelector(".action-icon") as HTMLElement | null;
						if (icon) restoreIcon(icon);
						if (b instanceof HTMLButtonElement) b.disabled = true;
						b.classList.add("disabled");
					});
				});
				document.addEventListener("combat:enemyListHidden", () => {
					navEnabled = true;
					actionEnabled = true;
					buttons.forEach((b) => {
						if (b instanceof HTMLButtonElement) b.disabled = false;
						b.classList.remove("disabled");
					});
					// 現在選択されているボタンのアイコンを復元
					const currentBtn = buttons[selectedIndex];
					if (currentBtn) {
						const currentIcon = currentBtn.querySelector(
							".action-icon",
						) as HTMLElement | null;
						if (currentIcon) {
							if (isHeartVisible()) {
								restoreIcon(currentIcon);
							} else {
								applyHeartIcon(currentIcon);
							}
						}
					}
				});

				// Also listen for attack-bar (combat) overlay shown/hidden events
				// so selection navigation is disabled while the attack-bar is visible.
				document.addEventListener("combat:attackBarShown", () => {
					navEnabled = false;
					// also disable action activation while attack bar is visible
					actionEnabled = false;
					buttons.forEach((b) => {
						const icon = b.querySelector(".action-icon") as HTMLElement | null;
						if (icon) restoreIcon(icon);
						if (b instanceof HTMLButtonElement) b.disabled = true;
						b.classList.add("disabled");
					});
				});
				document.addEventListener("combat:attackBarHidden", () => {
					// Keep disabled style until entities start spawning
					// (no style changes here, wait for player:heartShown)
				});
				document.addEventListener("combat:timelineEnded", () => {
					navEnabled = true;
					actionEnabled = true;
					buttons.forEach((b) => {
						if (b instanceof HTMLButtonElement) b.disabled = false;
						b.classList.remove("disabled");
					});
					const current = buttons[selectedIndex];
					if (current) {
						current.classList.remove("selected");
						const currentIcon = current.querySelector(
							".action-icon",
						) as HTMLElement | null;
						if (currentIcon) restoreIcon(currentIcon);
					}
					selectedIndex = 0;
					const fightButton = buttons[0];
					if (fightButton) {
						fightButton.classList.add("selected");
						const fightIcon = fightButton.querySelector(
							".action-icon",
						) as HTMLElement | null;
						if (fightIcon) {
							if (isHeartVisible()) {
								restoreIcon(fightIcon);
							} else {
								applyHeartIcon(fightIcon);
							}
						}
						fightButton.focus({ preventScroll: true });
					}
				});
				document.addEventListener("game:spawningStopped", () => {
					// Only re-enable if not in game over state
					if (!isGameOver) {
						navEnabled = true;
						actionEnabled = true;
						buttons.forEach((b) => {
							if (b instanceof HTMLButtonElement) b.disabled = false;
							b.classList.remove("disabled");
						});
					}
				}); // disable action activation when heart becomes visible (combat started)
				document.addEventListener("player:heartShown", () => {
					actionEnabled = false;
					buttons.forEach((b) => {
						if (b instanceof HTMLButtonElement) b.disabled = true;
						b.classList.add("disabled");
					});
				});

				document.addEventListener("player:heartColorChange", (event: Event) => {
					const nextColor = (event as CustomEvent)?.detail?.color;
					if (typeof nextColor === "string" && nextColor) {
						heartColor = nextColor;
						syncSelectionHeartIcons(heartColor);
					}
				});

				// click-to-select
				buttons.forEach((b, idx) => {
					b.addEventListener("click", (ev) => {
						if (selectedIndex !== idx) {
							ev.preventDefault();
							updateSelection(idx);
							return;
						}
						if (!actionEnabled) {
							ev.preventDefault();
							return;
						}
					});
				});
			})();
		})();

		// When the heart is hidden (combat ended), restore the player overlay
		document.addEventListener("player:heartHidden", () => {
			if (isGameOver) return;
			try {
				const overlay = document.getElementById("player-overlay");
				if (overlay instanceof HTMLElement) {
					overlay.textContent = "テスト";
					overlay.style.visibility = "visible";
				}
			} catch {}
		});
	} catch {}
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
					if (existing?.parentElement) {
						existing.parentElement.removeChild(existing);
						// notify that the attack bar overlay was removed/hidden (transition)
						document.dispatchEvent(new CustomEvent("combat:attackBarHidden"));
					}
				} catch {}
			}
		} catch {}
	}
});
