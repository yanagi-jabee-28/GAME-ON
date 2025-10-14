/// <reference path="../global.d.ts" />

/**
 * @file ui.js
 * @description UIの描画や更新を担当するファイル
 * HTML要素の操作はすべてここで行い、他のロジックから分離します。
 */

import { CONFIG } from "./config.ts";
import type { GameManager, PlayerStatus } from "./gameManager.ts";
import type { ItemData } from "./items.ts";
import { ITEMS } from "./items.ts";
import type { SoundManager } from "./soundManager.ts";

// `main.ts` wires runtime instances onto window; declare them here with types
// so this module can use them without falling back to `any`.
declare const gameManager: GameManager;
declare const soundManager: SoundManager;
// Reference the runtime GameEventManager exported in ./events.ts
type GameEventManagerType = typeof import("./events").GameEventManager;
declare const GameEventManager: GameEventManagerType;
// runtime global UI instance (wired in main.ts)
declare const ui: UIManager;

// initializeGame is wired by the runtime (main.ts). Declare it so TS knows its shape.
declare function initializeGame(name: string): void;

// Minimal, focused types for UI interactions. Keep these narrow and
// representative so UIManager can rely on proper typings without
// coupling to the entire GameManager implementation.
interface Character {
	id: string;
	name?: string;
	trust?: number;
	notes?: string;
}

interface EffectEntry {
	displayName?: string;
	turns?: number;
}

interface ReportEntry {
	title?: string;
 	progress: number;
 	required: number;
}

interface HistoryDetail {
	itemId?: string;
	itemName?: string;
	price?: number;
	shopId?: string;
	shopLabel?: string;
	label?: string;
	purchased?: boolean;
}

interface HistoryEntry {
	day: number;
	turn?: string | number;
	type: string;
	detail?: HistoryDetail & { _label?: string };
	_label?: string;
}

// Use PlayerStatus from gameManager for the canonical runtime state shape
type GameStatus = PlayerStatus;

export class UIManager {
	// Screen containers
	private titleScreen: HTMLElement | null = null;
	private gameScreen: HTMLElement | null = null;

	// Status displays
	private dateDisplay: HTMLElement | null = null;
	private timeOfDayDisplay: HTMLElement | null = null;
	private physicalDisplay: HTMLElement | null = null;
	private mentalDisplay: HTMLElement | null = null;
	private technicalDisplay: HTMLElement | null = null;
	private academicDisplay: HTMLElement | null = null; // may be attached dynamically
	private moneyDisplay: HTMLElement | null = null;
	private cpDisplay: HTMLElement | null = null;

	// Message window
	private messageWindow: HTMLElement | null = null;
	private characterName: HTMLElement | null = null;
	private messageText: HTMLElement |null = null;
	private clickIndicator: HTMLElement | null = null;

	// Choices
	private choicesArea: HTMLElement | null = null;

	// Menu elements
	private menuButton: HTMLElement | null = null;
	private menuCloseButton: (HTMLElement & { disabled?: boolean }) | null = null;
	public menuOverlay: (HTMLElement & { dataset?: DOMStringMap }) | null = null;
	private menuAcademic: HTMLElement | null = null;
	private menuPhysical: HTMLElement | null = null;
	private menuMental: HTMLElement | null = null;
	private menuTechnical: HTMLElement | null = null;
	private menuReportDebt: HTMLElement | null = null;
	private menuItemList: HTMLElement | null = null;
	private menuCloseFloating: HTMLElement | null = null;
	private menuItemSection: HTMLElement | null = null;
	private menuHistorySection: HTMLElement | null = null;
	private toggleItemsButton: HTMLElement | null = null;
	private toggleHistoryButton: HTMLElement | null = null;
	private toggleCharactersButton: HTMLElement | null = null;
	private menuCharactersSection: HTMLElement | null = null;

	// Character focused area
	private focusedCharacterWrap: HTMLElement | null = null;
	private focusedCharacterName: HTMLElement | null = null;
	private focusedCharacterTrust: HTMLElement | null = null;

	// Save/Load
	private saveGameButton: HTMLElement | null = null;
	private loadGameButton: HTMLElement | null = null;
	private loadGameFileInput: HTMLElement | null = null;

	// Keyboard handler
	private _boundKeyboardHandler?: (e: KeyboardEvent) => void;
	private _keyboardHandler?: (e: KeyboardEvent) => void;
	private toggleReportButton?: HTMLElement | null = null;
	/**
	 * UIManagerのコンストラクタ
	 */
	constructor() {
		// UI要素を取得してプロパティに保持
		this.titleScreen = document.getElementById("title-screen");
		this.gameScreen = document.getElementById("game-screen");

		this.dateDisplay = document.getElementById("date-display");
		this.timeOfDayDisplay = document.getElementById("time-of-day-display");
		this.physicalDisplay = document.getElementById("physical-display");
		this.mentalDisplay = document.getElementById("mental-display");
		this.technicalDisplay = document.getElementById("technical-display");
		this.moneyDisplay = document.getElementById("money-display");
		this.cpDisplay = document.getElementById("cp-display");

		this.messageWindow = document.getElementById("message-window");
		this.characterName = document.getElementById("character-name");
		this.messageText = document.getElementById("message-text");
		this.clickIndicator = document.getElementById("click-indicator");

		this.choicesArea = document.getElementById("choices-area");

		// メニュー関連の要素
		this.menuButton = document.getElementById("menu-button");
		this.menuCloseButton = document.getElementById("menu-close-button");
		this.menuOverlay = document.getElementById("menu-overlay");
		this.menuAcademic = document.getElementById("menu-academic");
		this.menuPhysical = document.getElementById("menu-physical");
		this.menuMental = document.getElementById("menu-mental");
		this.menuTechnical = document.getElementById("menu-technical");
		this.menuReportDebt = document.getElementById("menu-report-debt");
		this.menuItemList = document.getElementById("menu-item-list");
		this.menuCloseFloating = document.getElementById("menu-close-floating");
		this.menuItemSection = document.getElementById("menu-item-section");
		this.menuHistorySection = document.getElementById("menu-history-section");
		this.toggleItemsButton = document.getElementById("toggle-items-button");
		this.toggleHistoryButton = document.getElementById("toggle-history-button");
		this.toggleCharactersButton = document.getElementById(
			"toggle-characters-button",
		);
		this.menuCharactersSection = document.getElementById(
			"menu-characters-section",
		);

		// キャラクター関連 UI 要素
		this.focusedCharacterWrap = document.getElementById("focused-character");
		this.focusedCharacterName = document.getElementById(
			"focused-character-name",
		);
		this.focusedCharacterTrust = document.getElementById(
			"focused-character-trust",
		);

		// セーブ・ロード関連の要素
		this.saveGameButton = document.getElementById("save-game-button");
		this.loadGameButton = document.getElementById("load-game-button");
		this.loadGameFileInput = document.getElementById("load-game-file-input");

		// GameManager のステータス変更を購読して自動的に表示を更新
		if (
			typeof gameManager !== "undefined" &&
			typeof gameManager.subscribe === "function"
		) {
			gameManager.subscribe((status: GameStatus) => {
				this.updateStatusDisplay(status);
				// メニューが開いている場合はメニューの内容も更新する
				if (
					this.menuOverlay &&
					!this.menuOverlay.classList.contains("hidden")
				) {
					this.updateMenuDisplay();
				}
				// キャラクター表示の更新
				this.updateFocusedCharacter(status);
			});
		}

		// グローバルキーハンドラを早期に登録しておく（タイトル画面でも有効にするため）
		if (!this._boundKeyboardHandler) {
			this._boundKeyboardHandler = this._handleGlobalKeydown.bind(this);
			window.addEventListener("keydown", this._boundKeyboardHandler);
		}
	}

	showTitleScreen() {
		if (this.titleScreen) this.titleScreen.style.display = "flex";
		if (this.gameScreen) this.gameScreen.style.display = "none";

		// 初期フォーカスをタイトルの最初のボタンに移す（キーボード操作を容易にする）
		setTimeout(() => {
			try {
				const buttons = Array.from(
					document.querySelectorAll<HTMLButtonElement>(
						"#title-screen .title-buttons button",
					),
				);
				if (buttons.length > 0) {
					buttons.forEach((b) => {
						b.classList.remove("focused");
					});
					buttons[0].classList.add("focused");
					try {
						buttons[0].focus();
					} catch {
						/* ignore focus failure */
					}
				}
			} catch {
				/* ignore DOM query failure */
			}
		}, 40);
	}

	/**
	 * タイトル画面のボタンに対してフォーカス表示を設定する
	 * @param {Element[]} buttons
	 * @param {number} index
	 */
	_setTitleButtonFocus(
		buttons: Element[] | HTMLButtonElement[],
		index: number,
	) {
		buttons.forEach((b, i) => {
			if (i === index) {
				b.classList.add("focused");
				try {
					(b as HTMLElement).focus();
				} catch {
					/* ignore */
				}
			} else {
				b.classList.remove("focused");
			}
		});
	}

	showGameScreen() {
		if (this.titleScreen) this.titleScreen.style.display = "none";
		if (this.gameScreen) this.gameScreen.style.display = "block";
	}

	/**
	 * メニューの専用ウィンドウを開く
	 * @param {'item'|'history'|'character'|'report'} type
	 */
	async openMenuWindow(type: "item" | "history" | "character" | "report") {
		try {
			// メニュー自体が閉じている場合は開く（ただしフリー行動チェックは openMenu が行う）
			if (this.menuOverlay?.classList.contains("hidden")) {
				this.menuOverlay.classList.remove("hidden");
			}
			// Mark as user-opened because this is invoked from a user action
			try {
				if (this.menuOverlay) this.menuOverlay.dataset.userOpened = "1";
			} catch (_e) {}

			if (type === "item") {
				const win = document.getElementById("menu-item-window");
				if (!win) return;
				const list = document.getElementById("menu-item-window-list");
				if (!list) return;
				list.innerHTML = "";
				const status = gameManager.getAllStatus();
				if (!status.items || status.items.length === 0) {
					const li = document.createElement("li");
					li.textContent = "(アイテムはありません)";
					list.appendChild(li);
				} else {
					for (const itemId of status.items) {
						const item = (ITEMS as Record<string, ItemData>)[
							itemId as keyof typeof ITEMS as string
						];
						const li = document.createElement("li");
						li.innerHTML = `<span>${item ? item.name : itemId} - ${item ? item.description : ""}</span>`;

						const useBtn = document.createElement("button");
						useBtn.textContent = "使用";
						useBtn.className = "item-use-btn";
						useBtn.onclick = async () => {
							if (useBtn.disabled) return;
							useBtn.disabled = true;
							try {
								const ok = await gameManager.useItem(itemId);
								if (ok) {
									await this.openMenuWindow("item");
								} else {
									try {
										if (typeof soundManager !== "undefined")
											soundManager.play("error");
									} catch {
										/* ignore */
									}
									this.showTransientNotice("アイテムを所持していません。", {
										duration: 1200,
									});
									await this.openMenuWindow("item");
								}
							} catch (err) {
								console.error("useItem error (window)", err);
							} finally {
								useBtn.disabled = false;
							}
						};
						li.appendChild(useBtn);
						list.appendChild(li);
					}
				}
				win.classList.remove("hidden");
				// When the item window is open, disable the main menu close controls to avoid accidental closure
				this._setMenuCloseEnabled(false);
				return;
			}

			if (type === "history") {
				const win = document.getElementById("menu-history-window");
				if (!win) return;
				const list = document.getElementById("menu-history-window-list");
				if (!list) return;
				list.innerHTML = "";
				const status = gameManager.getAllStatus();
				const history = status.history || [];
				if (history.length === 0) {
					const li = document.createElement("li");
					li.textContent = "(履歴はありません)";
					list.appendChild(li);
				} else {
					const entries = history.slice().reverse();
					for (const h of entries) {
						const li = document.createElement("li");
						const time = `${h.day}日目 ${h.turn || ""}`.trim();
						let text = "";

						// If a human-readable label was attached by gameManager.addHistory, prefer it.
						if (h._label) {
							li.textContent = `${time}: ${h._label}`;
							list.appendChild(li);
							continue;
						}
						if (h.type === "use_item") {
							const itemName =
								h.detail?.itemName ??
								(h.detail?.itemId
									? (ITEMS as Record<string, ItemData>)[h.detail.itemId]?.name
									: undefined) ??
								h.detail?.itemId ??
								"アイテム";
							text = `${time}: アイテム使用 - ${itemName}`;
						} else if (h.type === "choice") {
							const label = h.detail?.label ?? "";
							text = `${time}: 選択 - ${label}`;
						} else {
							text = `${time}: ${h.type}`;
						}
						li.textContent = text;
						list.appendChild(li);
					}
				}
				win.classList.remove("hidden");
				return;
			}

			if (type === "character") {
				const winId = "menu-character-window";
				let win = document.getElementById(winId);
				if (!win) {
					win = document.createElement("div");
					win.id = winId;
					win.className = "menu-window";
					win.innerHTML = `<div class="menu-window-header">キャラクター一覧<button class="menu-window-close">✕</button></div><div class="menu-window-body" id="menu-character-window-list"></div>`;
					const container = document.getElementById("game-container");
					if (container) container.appendChild(win);
					else if (document.body) document.body.appendChild(win);
					// wire close
					win
						.querySelector(".menu-window-close")
						.addEventListener("click", () => {
							this.closeMenuWindow(win);
						});
				}
				const listEl = document.getElementById("menu-character-window-list");
				if (!listEl) return;
				listEl.innerHTML = "";
				const status = gameManager.getAllStatus();
				const chars = (status.characters || []).filter(
					(c) => c.id !== "player",
				);
				if (chars.length === 0) {
					const p = document.createElement("p");
					p.textContent = "(キャラクターが登録されていません)";
					listEl.appendChild(p);
				} else {
					const ul = document.createElement("ul");
					chars.forEach((c) => {
						const li = document.createElement("li");
						li.textContent = `${c.name} (信頼: ${c.trust})`;
						const btn = document.createElement("button");
						btn.textContent = "表示";
						btn.className = "char-view-btn";
						btn.onclick = () => {
							// reuse existing detail window logic
							let detail = document.getElementById(
								"menu-character-detail-window",
							);
							if (!detail) {
								detail = document.createElement("div");
								detail.id = "menu-character-detail-window";
								detail.className = "menu-window";
								detail.innerHTML = `<div class="menu-window-header">キャラクター詳細<button class="menu-window-close">✕</button></div><div class="menu-window-body" id="menu-character-detail-body"></div>`;
								const gameContainer = document.getElementById("game-container");
								if (gameContainer) gameContainer.appendChild(detail);
								// wire close
								const closeBtn = detail.querySelector(
									".menu-window-close",
								);
								if (closeBtn) {
									closeBtn.addEventListener("click", () => {
										this.closeMenuWindow(detail);
									});
								}
							}
							const body = document.getElementById(
								"menu-character-detail-body",
							);
							if (body) {
								body.innerHTML = "";
								const nameEl = document.createElement("h4");
								nameEl.textContent = c.name;
								const trustEl = document.createElement("p");
								trustEl.textContent = `信頼: ${c.trust}`;
								const notes = document.createElement("p");
								notes.textContent = c.notes || "";
								body.appendChild(nameEl);
								body.appendChild(trustEl);
								body.appendChild(notes);
							}
							detail.classList.remove("hidden");
							this._setMenuCloseEnabled(false);
						};
						li.appendChild(btn);
						ul.appendChild(li);
					});
					listEl.appendChild(ul);
				}
				win.classList.remove("hidden");
				this._setMenuCloseEnabled(false);
				return;
			}

			if (type === "report") {
				const winId = "menu-report-window";
				let win = document.getElementById(winId);
				if (!win) {
					win = document.createElement("div");
					win.id = winId;
					win.className = "menu-window";
					win.innerHTML = `<div class="menu-window-header">レポート一覧<button class="menu-window-close">✕</button></div><div class="menu-window-body" id="menu-report-window-body"></div>`;
					document.getElementById("game-container").appendChild(win);
					win
						.querySelector(".menu-window-close")
						.addEventListener("click", () => {
							this.closeMenuWindow(win);
						});
				}
				const body = document.getElementById("menu-report-window-body");
				if (body) body.innerHTML = "";
				const status = gameManager.getAllStatus();
				const reports = status.reports || [];
				if (reports.length === 0) {
					const p = document.createElement("p");
					p.textContent = "(進行中のレポートはありません)";
					body.appendChild(p);
				} else {
					const ul = document.createElement("ul");
					reports.forEach((r) => {
						const li = document.createElement("li");
						li.textContent = `${r.title} (${r.progress}/${r.required})`;
						ul.appendChild(li);
					});
					body.appendChild(ul);
				}
				win.classList.remove("hidden");
				this._setMenuCloseEnabled(false);
				return;
			}
		} catch (_e) {
			console.error("openMenuWindow error", _e);
		}
	}

	/**
	 * メニュー専用ウィンドウを閉じる
	 * @param {Element} winEl
	 */
	closeMenuWindow(winEl: Element | null) {
		if (!winEl) return;
		winEl.classList.add("hidden");
		// If the closed window was an item or character window, re-enable main menu close controls
		try {
			const itemWin = document.getElementById("menu-item-window");
			const charWin = document.getElementById("menu-character-window");
			const charDetail = document.getElementById(
				"menu-character-detail-window",
			);
			const reportWin = document.getElementById("menu-report-window");
			const stillOpen =
				(itemWin?.classList.contains("hidden") === false) ||
				(charWin?.classList.contains("hidden") === false) ||
				(charDetail?.classList.contains("hidden") === false);
			if (!stillOpen) this._setMenuCloseEnabled(true);
		} catch {}
	}

	/**
	 * Enable or disable the main menu close controls while modal-like windows are open
	 * @param {boolean} enabled
	 */
	_setMenuCloseEnabled(enabled: boolean) {
		try {
			if (this.menuCloseButton) {
				this.menuCloseButton.disabled = !enabled;
				if (!enabled) this.menuCloseButton.classList.add("disabled");
				else this.menuCloseButton.classList.remove("disabled");
			}
			if (this.menuCloseFloating) {
				this.menuCloseFloating.setAttribute(
					"aria-disabled",
					enabled ? "false" : "true",
				);
				if (!enabled) this.menuCloseFloating.classList.add("disabled");
				else this.menuCloseFloating.classList.remove("disabled");
			}
		} catch {}
	}

	/**
	 * ステータス表示を更新する
	 * @param {object} status - 表示するステータス情報 (GameManagerから取得)
	 */
	updateStatusDisplay(status: GameStatus) {
		console.log("UI.updateStatusDisplay called with status:", status);
		// 日付表示に曜日を付与
		const weekday =
			typeof gameManager.getWeekdayName === "function"
				? gameManager.getWeekdayName()
				: "";
		// DOM が差し替えられている可能性があるため、要素が document に存在するか確認して再取得する
		try {
			if (!this.dateDisplay || !document.contains(this.dateDisplay))
				this.dateDisplay = document.getElementById("date-display");
			if (!this.timeOfDayDisplay || !document.contains(this.timeOfDayDisplay))
				this.timeOfDayDisplay = document.getElementById("time-of-day-display");
			if (!this.moneyDisplay || !document.contains(this.moneyDisplay))
				this.moneyDisplay = document.getElementById("money-display");
			if (!this.cpDisplay || !document.contains(this.cpDisplay))
				this.cpDisplay = document.getElementById("cp-display");
			if (!this.physicalDisplay || !document.contains(this.physicalDisplay))
				this.physicalDisplay = document.getElementById("physical-display");
			if (!this.mentalDisplay || !document.contains(this.mentalDisplay))
				this.mentalDisplay = document.getElementById("mental-display");
			if (!this.technicalDisplay || !document.contains(this.technicalDisplay))
				this.technicalDisplay = document.getElementById("technical-display");
			// academic may be added in the header chips
			if (!this.academicDisplay || !document.contains(this.academicDisplay))
				this.academicDisplay = document.getElementById("academic-display");
		} catch {
			console.warn("Error checking status display elements");
		}

		if (this.dateDisplay)
			this.dateDisplay.textContent = `${status.day}日目 (${weekday}曜日)`;
		if (this.timeOfDayDisplay && typeof status.turnIndex !== "undefined")
			this.timeOfDayDisplay.textContent = CONFIG.TURNS[status.turnIndex];
		if (this.physicalDisplay) {
			const stats = status.stats;
			this.physicalDisplay.textContent =
				typeof stats?.physical !== "undefined" ? String(stats.physical) : "";
		}
		if (this.mentalDisplay) {
			const stats = status.stats;
			this.mentalDisplay.textContent =
				typeof stats?.mental !== "undefined" ? String(stats.mental) : "";
		}
		if (this.academicDisplay) {
			const stats = status.stats;
			this.academicDisplay.textContent =
				typeof stats?.academic !== "undefined" ? String(stats.academic) : "";
		}
		if (this.technicalDisplay) {
			const stats = status.stats;
			this.technicalDisplay.textContent =
				typeof stats?.technical !== "undefined" ? String(stats.technical) : "";
		}
		// 通貨単位は CONFIG.LABELS.currencyUnit を優先
		const unit = CONFIG?.LABELS?.currencyUnit ?? "円";
		if (this.moneyDisplay)
			this.moneyDisplay.textContent = `${status.money}${unit}`;
		if (this.cpDisplay) this.cpDisplay.textContent = String(status.cp ?? "");
	}

	/**
	 * フォーカス中のキャラクター表示を更新する
	 */
	updateFocusedCharacter(_status?: GameStatus) {
		try {
			if (!this.focusedCharacterWrap) return;
			const player =
				typeof gameManager !== "undefined"
					? gameManager.getCharacter("player")
					: null;
			if (!player) {
				this.focusedCharacterWrap.style.display = "none";
				return;
			}
			if (this.focusedCharacterName)
				this.focusedCharacterName.textContent = player.name || "";
			if (this.focusedCharacterTrust)
				this.focusedCharacterTrust.textContent =
					typeof player.trust === "number" ? `${player.trust}` : "";
			this.focusedCharacterWrap.style.display = "flex";
		} catch (_e) {
			console.warn("updateFocusedCharacter error", _e);
		}
	}

	/**
	 * メッセージとキャラクター名を表示する
	 * @param {string} text - 表示するメッセージ本文
	 * @param {string} [characterName=''] - 表示するキャラクター名 (省略可能)
	 */
	displayMessage(text: string | undefined | null, characterName: string = "") {
		// Guard: ignore empty or whitespace-only messages to avoid showing
		// an empty message window that only waits for a click.
		if (text === null || typeof text === "undefined") return;
		const txt = String(text);
		if (txt.trim() === "") {
			console.log("UI.displayMessage: ignoring empty message");
			return;
		}

		let finalCharacterName = characterName;
		if (characterName === "主人公" && typeof gameManager !== "undefined") {
			const player = gameManager.getCharacter("player");
			if (player?.name) {
				finalCharacterName = player.name;
			}
		}

		console.log("UI.displayMessage called:", {
			characterName: finalCharacterName,
			text: txt,
		});
		// メニューが開いている場合はメッセージウィンドウを前面に出す
		// 常にメッセージウィンドウを前面に出しておく（overlay が残っている場合の救済策）
		try {
			if (this.messageWindow) this.messageWindow.style.zIndex = "2000"; // overlay (1000) より高くしておく
		} catch {
			/* ignore */
		}
		if (this.menuOverlay?.classList.contains("hidden") === false) {
			// 元の zIndex を保存しておく
			if (
				this.messageWindow &&
				typeof this.messageWindow.dataset.origZ === "undefined"
			) {
				this.messageWindow.dataset.origZ =
					this.messageWindow.style.zIndex || "";
			}
			if (this.messageWindow) this.messageWindow.style.zIndex = "10001"; // menuより前面
			// メッセージウィンドウが非表示になっている場合は表示する
			if (this.messageWindow) this.messageWindow.style.display = "block";
		}

		if (this.characterName) this.characterName.textContent = finalCharacterName;
		if (this.messageText) this.messageText.textContent = String(text ?? "");
		// 追加デバッグ: メッセージDOMの内容を確認
		try {
			console.log(
				"messageText.innerHTML:",
				this.messageText?.innerHTML,
				"computed display:",
				this.messageWindow
					? window.getComputedStyle(this.messageWindow).display
					: "",
				"zIndex:",
				this.messageWindow?.style.zIndex,
			);
		} catch {
			/* ignore logging failure */
		}
	}

	/**
	 * メッセージをクリアする
	 */
	clearMessage() {
		console.log("UI.clearMessage called");
		this.characterName.textContent = "";
		this.messageText.textContent = "";
		// クリックインジケーターを確実に消す
		try {
			this.clickIndicator.style.display = "none";
		} catch {
			/* ignore */
		}
		// 保存してあった zIndex を復元
		if (
			this.messageWindow &&
			typeof this.messageWindow.dataset.origZ !== "undefined"
		) {
			this.messageWindow.style.zIndex = this.messageWindow.dataset.origZ || "";
			delete this.messageWindow.dataset.origZ;
		}
		// safety: イベントフロー中に menuOverlay が誤って残っている場合は
		// 非自由行動フェーズなら閉じておく（誤って画面を覆わないようにする）
		try {
			// Only auto-hide the overlay when it's not opened by the user and
			// we're not in a free-action phase. If the user explicitly opened the
			// menu (dataset.userOpened === '1'), do not auto-hide here.
			if (
				this.menuOverlay &&
				typeof GameEventManager !== "undefined" &&
				!GameEventManager.isInFreeAction
			) {
				if (
					!this.menuOverlay.dataset ||
					this.menuOverlay.dataset.userOpened !== "1"
				) {
					this.menuOverlay.classList.add("hidden");
				}
			}
		} catch {
			/* ignore */
		}
	}

	/**
	 * ユーザーのクリックを待つ
	 * @returns {Promise<void>} クリックされたら解決するPromise
	 */
	waitForClick(): Promise<void> {
		return new Promise<void>((resolve) => {
			// クリックインジケーターを表示
			if (this.clickIndicator) this.clickIndicator.style.display = "block";

			const listener = () => {
				console.log("UI.waitForClick: click detected, resolving");
				// イベントリスナーを一度実行したら削除する
				if (this.messageWindow)
					this.messageWindow.removeEventListener("click", listener);
				if (this.clickIndicator) this.clickIndicator.style.display = "none";
				// クリック音を鳴らす（存在すれば）
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch {
					/* ignore */
				}

				this.clearMessage(); // メッセージをクリア

				// Promiseを解決して、待機状態を終了する
				resolve();
			};

			// メッセージウィンドウにクリックイベントを設定
			if (this.messageWindow)
				this.messageWindow.addEventListener("click", listener);
		});
	}

	/**
	 * 選択肢を表示する
	 * @param {Array<object>} choices - 選択肢の配列。各オブジェクトは { text: '選択肢の文言', callback: 選択されたときの関数 } を持つ
	 */
	displayChoices(choices: Array<{ text: string; callback?: () => void }>) {
		// 既存の選択肢をクリア
		if (this.choicesArea) this.choicesArea.innerHTML = "";

		if (!choices || choices.length === 0) {
			return; // 選択肢がなければ何もしない
		}

		choices.forEach((choice) => {
			const button = document.createElement("button");
			button.textContent = choice.text;
			button.className = "choice-button";
			button.onclick = () => {
				// 効果音（存在すれば）
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch {
					/* ignore */
				}
				// 選択肢をクリックしたら、選択履歴を記録
				try {
					if (
						typeof gameManager !== "undefined" &&
						typeof gameManager.recordChoice === "function"
					) {
						gameManager.recordChoice(choice.text);
					}
				} catch (_e) {
					console.error("recordChoice error", _e);
				}

				// 先に既存の選択肢を消してからコールバックを実行する
				// これにより、コールバック内で新しい選択肢を表示しても
				// 直後に元のクリックハンドラがそれらを消してしまう問題を防ぐ
				this.clearChoices();

				try {
					if (choice.callback) {
						choice.callback();
					}
				} catch (_e) {
					console.error("choice callback error", _e);
				}
			};
			if (this.choicesArea) this.choicesArea.appendChild(button);
		});

		// 初期選択を一つ目に設定（キーボード操作のため）
		const buttons: HTMLElement[] = this.choicesArea
			? Array.from(this.choicesArea.querySelectorAll<HTMLElement>(".choice-button"))
			: [];
		if (buttons.length > 0) {
			buttons.forEach((b) => {
				b.classList.remove("focused");
			});
			buttons[0].classList.add("focused");
		}
	}

	/**
	 * 選択肢を非表示にする
	 */
	clearChoices() {
		if (this.choicesArea) this.choicesArea.innerHTML = "";
	}

	// --- メニュー関連のメソッド ---

	/**
	 * メニューを開く
	 */
	openMenu() {
		const status = gameManager.getStatus();
		if (status.menuLocked) return; // メニューがロックされているフェーズでは開けない
		// 自由行動時間のみメニューを開ける
		if (
			typeof GameEventManager === "undefined" ||
			!GameEventManager.isInFreeAction
		) {
			// メニューを開けない場合は一時的なダイアログで通知（イベントメッセージの上書きは避ける）
			try {
				if (typeof soundManager !== "undefined") soundManager.play("error");
			} catch {
				/* ignore */
			}
			try {
				if (typeof soundManager !== "undefined") soundManager.play("error");
			} catch {
				/* ignore */
			}
			this.showTransientNotice("メニューは自由行動時間のみ開けます。", {
				duration: 1200,
			});
			return;
		}

		// メニューを開く際、もしメッセージウィンドウが表示中であれば
		// メニューとの重なりを防ぐため一時的に非表示にする
		try {
					if (
						this.messageWindow &&
						window.getComputedStyle(this.messageWindow).display !== "none"
					) {
				this.messageWindow.dataset.wasVisible = "1"; // Store visibility state
				this.messageWindow.style.display = "none";
			}
		} catch {
			/* ignore */
		}
		this.menuOverlay?.classList.remove("hidden");
		// Mark that the menu was opened by user action so automatic
		// safety code does not hide it unexpectedly.
		try {
			if (this.menuOverlay) this.menuOverlay.dataset.userOpened = "1";
		} catch {
			/* ignore DOM query failure */
		}
		this.updateMenuDisplay(); // メニューを開く際に最新の情報を表示
		try {
			if (typeof soundManager !== "undefined") soundManager.play("ui_action");
		} catch {
			/* ignore */
		}
	}

	/**
	 * メニューを閉じる
	 */
	closeMenu() {
		// Prevent closing the menu while item window (effect display) is open
		try {
			const itemWin = document.getElementById("menu-item-window");
			if (itemWin && !itemWin.classList.contains("hidden")) {
				this.showTransientNotice(
					"アイテム効果表示中はメニューを閉じられません。",
					{
						duration: 1200,
					},
				);
				// ensure close controls remain disabled
				this._setMenuCloseEnabled(false);
				return;
			}
		} catch {
			/* ignore */
		}
	// hide menu overlay
	this.menuOverlay?.classList.add("hidden");
		if (this.menuCloseFloating)
			this.menuCloseFloating.setAttribute("aria-visible", "false");
		// メッセージウィンドウを一時的に隠していた場合は復元する
		try {
			if (this.messageWindow?.dataset.wasVisible) {
				this.messageWindow.style.display = "block";
				delete this.messageWindow.dataset.wasVisible;
			}
		} catch (_e) {
			/* ignore */
		}
		// Clear the userOpened marker when the menu is explicitly closed
		try {
			if (this.menuOverlay?.dataset?.userOpened) delete this.menuOverlay.dataset.userOpened;
		} catch (_e) {
			/* ignore */
		}
		try {
			if (typeof soundManager !== "undefined") soundManager.play("ui_action");
		} catch {
			/* ignore */
		}
	}

	/**
	 * メニューの表示内容を更新する
	 */
	updateMenuDisplay() {
		const status = gameManager.getAllStatus(); // GameManagerから全ステータスを取得

		// ラベル定義を取得（なければデフォルト）
		const labels = CONFIG?.LABELS ?? ({} as Record<string, string>);

		// メニューの見出しなど静的ラベルを設定（存在すれば）
		const headerEl = document.getElementById("menu-header");
		if (headerEl) headerEl.textContent = labels.menuTitle || "メニュー";
		const ownedEl = document.getElementById("menu-owned-heading");
		if (ownedEl) ownedEl.textContent = labels.ownedItems || "所持品";
		const shopEl = document.getElementById("menu-shop-heading");
		if (shopEl) shopEl.textContent = labels.shop || "購買";
		const historyEl = document.getElementById("menu-history-heading");
		if (historyEl) historyEl.textContent = labels.history || "行動履歴";

	// ステータスセクションの更新
	if (this.menuAcademic) this.menuAcademic.textContent = String(status?.stats?.academic ?? "");
	if (this.menuPhysical) this.menuPhysical.textContent = String(status?.stats?.physical ?? "");
	if (this.menuMental) this.menuMental.textContent = String(status?.stats?.mental ?? "");
	if (this.menuTechnical) this.menuTechnical.textContent = String(status?.stats?.technical ?? "");
	if (this.menuReportDebt) this.menuReportDebt.textContent = String(status?.reportDebt ?? "");

		// 個別レポートの表示（存在すれば）
		const reportListId = "menu-report-list";
		let reportList = document.getElementById(reportListId);
		if (!reportList) {
			reportList = document.createElement("ul");
			reportList.id = reportListId;
			const section = document.getElementById("menu-status-section");
			if (section) section.appendChild(reportList);
		}
		reportList.innerHTML = "";
		if (status.reports && status.reports.length > 0) {
			for (const r of status.reports) {
				const li = document.createElement("li");
				li.textContent = `${r.title} (${r.progress}/${r.required})`;
				reportList.appendChild(li);
			}
		} else {
			const li = document.createElement("li");
			li.textContent =
				labels.noReportsMessage || "進行中のレポートはありません。";
			reportList.appendChild(li);
		}

		// アイテムリストの更新
		if (this.menuItemList) this.menuItemList.innerHTML = ""; // 一度クリア
		if (!status.items || status.items.length === 0) {
			const li = document.createElement("li");
			li.textContent = labels.noItemsMessage || "アイテムはありません。";
			this.menuItemList?.appendChild(li);
		} else {
			for (const itemId of status.items) {
				const item = (ITEMS as Record<string, ItemData>)[itemId as string]; // config.jsからアイテム情報を取得
				if (item) {
					const li = document.createElement("li");
					li.innerHTML = `<span>${item.name} - ${item.description}</span>`;

					// アイテム使用ボタンの追加
					const useButton = document.createElement("button");
					useButton.textContent = "使用";
					useButton.onclick = async () => {
						if (typeof gameManager === "undefined") return;
						if (useButton.disabled) return;
						useButton.disabled = true;
						try {
							const ok = await gameManager.useItem(itemId);
							if (ok) {
								this.updateMenuDisplay();
								try {
									const itemWin = document.getElementById("menu-item-window");
									if (itemWin) itemWin.classList.add("hidden");
									this._setMenuCloseEnabled(true);
								} catch {
									/* ignore */
								}
								this.closeMenu();
								if (
									typeof GameEventManager !== "undefined" &&
									typeof GameEventManager.showMainActions === "function"
								) {
									GameEventManager.showMainActions();
								} else if (typeof ui !== "undefined") {
									ui.displayMessage("（アイテムを使用しました）");
									if (typeof ui.waitForClick === "function")
										await ui.waitForClick();
									if (
										typeof GameEventManager !== "undefined" &&
										typeof GameEventManager.showMainActions === "function"
									) {
										GameEventManager.showMainActions();
									}
								}
							} else {
								this.showTransientNotice("アイテムを所持していません。", {
									duration: 1200,
								});
								this.updateMenuDisplay();
							}
						} catch (err) {
							console.error("useItem error", err);
						} finally {
							useButton.disabled = false;
						}
					};
					li.appendChild(useButton);
					this.menuItemList?.appendChild(li);
				}
			}
		}

		// 履歴表示の更新
		const historyListId = "menu-history-list";
		let historyList = document.getElementById(historyListId);
			if (!historyList) {
			historyList = document.createElement("ul");
			historyList.id = historyListId;
			const section = document.getElementById("menu-item-section");
					if (section?.parentNode) {
					// 履歴セクションはアイテムセクションの下に配置
					const historySectionHeader = document.createElement("h3");
					historySectionHeader.id = "menu-history-heading";
					historySectionHeader.textContent = labels.history || "行動履歴";
					section.parentNode.insertBefore(
						historySectionHeader,
						section.nextSibling,
					);
					section.parentNode.insertBefore(
						historyList,
						historySectionHeader.nextSibling,
					);
				}
		}
		historyList.innerHTML = "";
		const history = status.history || [];
		const unit = CONFIG?.LABELS?.currencyUnit ?? "円";
		if (history.length === 0) {
			const li = document.createElement("li");
			li.textContent = "(履歴はありません)";
			historyList.appendChild(li);
		} else {
			// 最新が最後尾に入っている想定なので逆順で表示（最新が上）
			const entries = history.slice().reverse();
			for (const h of entries) {
				const li = document.createElement("li");
				const time = `${h.day}日目 ${h.turn || ""}`.trim();
				let text = "";

				// ユーザー向けのラベルを優先して取得するユーティリティ
				const resolveShopLabel = (shopId?: string, detail?: HistoryDetail) => {
					if (detail?.shopLabel) return detail.shopLabel;
					// shopId may not be a known key; guard access
					if (!shopId) return "";
					const shopLabel = (CONFIG?.SHOPS as Record<string, any> | undefined)?.[shopId]?.label;
					return shopLabel ?? shopId ?? "";
				};

				// safe ITEMS name lookup when only a string id is available
				const getItemNameSafe = (id?: string) => {
					if (!id) return undefined;
					const catalog = ITEMS as Record<string, ItemData | undefined>;
					return catalog[id]?.name;
				};

				switch (h.type) {
					case "shop_visit": {
						const shopLabel = resolveShopLabel(h.detail?.shopId, h.detail);
						text = `${time}: ${shopLabel}に入店`;
						break;
					}
					case "shop_leave": {
						const shopLabel = resolveShopLabel(h.detail?.shopId, h.detail);
						if (h.detail?.purchased) {
							const itemName = h.detail?.itemName ?? getItemNameSafe(h.detail?.itemId) ?? (h.detail?.itemId ?? "アイテム");
							text = `${time}: ${shopLabel}で購入して退店（${itemName}、${h.detail.price || ""}${unit}）`;
						} else {
							text = `${time}: ${shopLabel}を訪れて何も買わず退店`;
						}
						break;
					}
					case "purchase": {
						const shopLabel = resolveShopLabel(h.detail?.shopId, h.detail);
						const itemName = h.detail?.itemName
							? h.detail?.itemName
							: h.detail?.itemId && (ITEMS as Record<string, ItemData>)[h.detail.itemId]
								? (ITEMS as Record<string, ItemData>)[h.detail.itemId].name
								: (h.detail?.itemId ?? "アイテム");
						text = `${time}: ${itemName} を ${shopLabel}で購入（${h.detail.price || ""}${unit}）`;
						break;
					}
					case "choice": {
						const label = h.detail?.label ?? "";
						text = `${time}: 選択 - ${label}`;
						break;
					}
					case "use_item": {
						const itemName = h.detail?.itemName
							? h.detail.itemName
							: h.detail?.itemId && ITEMS[h.detail.itemId]
								? ITEMS[h.detail.itemId].name
								: (h.detail?.itemId ?? "アイテム");
						text = `${time}: アイテム使用 - ${itemName}`;
						break;
					}
					default:
						text = `${time}: ${h.type}`;
				}

				li.textContent = text;
					historyList.appendChild(li);
			}
		}

		// --- 効果表示 (effects) ---
		const effectsSectionId = "menu-effects-section";
	let effectsSection = document.getElementById(effectsSectionId);
		if (!effectsSection) {
			effectsSection = document.createElement("div");
			effectsSection.id = effectsSectionId;
			const header = document.createElement("h3");
			header.textContent = "効果";
			// 場所: スクロール可能なコンテンツ領域 (.menu-scroll) に追加
			const scroll = document.querySelector(".menu-scroll");
			if (scroll) scroll.appendChild(effectsSection);
			else {
				const menuContent = document.getElementById("menu-content");
				if (menuContent) menuContent.appendChild(effectsSection);
			}
		}

		// --- キャラクター表示 ---
		const charsSectionId = "menu-characters-section";
		let charsSection = document.getElementById(charsSectionId);
		if (!charsSection) {
			charsSection = document.createElement("div");
			charsSection.id = charsSectionId;
			const header = document.createElement("h3");
			header.textContent = "キャラクター";
			const scroll = document.querySelector(".menu-scroll");
			if (scroll) scroll.appendChild(charsSection);
			else {
				const menuContent = document.getElementById("menu-content");
				if (menuContent) menuContent.appendChild(charsSection);
			}
		}
		charsSection.innerHTML = "";
		// キャラクターの追加や直接編集はメニューから行わない仕様に変更。
		// ここでは主人公(player)を除外した一覧表示と、各キャラごとに個別ウィンドウを開くボタンを表示する。
		const ulId = "menu-characters-list";
		let ul = document.getElementById(ulId);
		if (!ul) {
			ul = document.createElement("ul");
			ul.id = ulId;
			charsSection.appendChild(ul);
		}
		ul.innerHTML = "";
		const chars = (status.characters || []).filter((c) => c.id !== "player"); // exclude player
		if (chars.length === 0) {
			const li = document.createElement("li");
			li.textContent = "(キャラクターが登録されていません)";
			ul.appendChild(li);
		} else {
			chars.forEach((c) => {
				const li = document.createElement("li");
				const left = document.createElement("span");
				left.textContent = `${c.name} (信頼: ${c.trust})`;
				li.appendChild(left);
				const btnWrap = document.createElement("span");
				// キャラクター詳細表示ボタン（個別ウィンドウ）
				const viewBtn = document.createElement("button");
				viewBtn.textContent = "表示";
				viewBtn.className = "char-view-btn";
				viewBtn.onclick = async () => {
					// Open a dedicated character detail window (modal-like)
					let win = document.getElementById("menu-character-detail-window");
					if (!win) {
						win = document.createElement("div");
						win.id = "menu-character-detail-window";
						win.className = "menu-window";
						win.innerHTML = `<div class="menu-window-header">キャラクター詳細<button class="menu-window-close">閉じる</button></div><div class="menu-window-body" id="menu-character-detail-body"></div>`;
						document.getElementById("game-container").appendChild(win);
						// wire close
						win
							.querySelector(".menu-window-close")
							.addEventListener("click", (e) => {
								this.closeMenuWindow(win);
							});
					}
					const body = document.getElementById("menu-character-detail-body");
					if (body) {
						body.innerHTML = "";
						const nameEl = document.createElement("h4");
						nameEl.textContent = c.name;
						const trustEl = document.createElement("p");
						trustEl.textContent = `信頼: ${c.trust}`;
						const notes = document.createElement("p");
						notes.textContent = c.notes || "";
						body.appendChild(nameEl);
						body.appendChild(trustEl);
						body.appendChild(notes);
					}
					win.classList.remove("hidden");
					// While a detail window is open, prevent the menu from being closed accidentally
					this._setMenuCloseEnabled(false);
				};
				btnWrap.appendChild(viewBtn);
				li.appendChild(btnWrap);
				ul.appendChild(li);
			});
		}
		effectsSection.innerHTML = "";
		const effects = status.effects || {};
		console.log("UI.updateMenuDisplay effects:", effects);
		if (effectsSection) {
			if (Object.keys(effects).length === 0) {
				const p = document.createElement("p");
				p.textContent = "(現在、効果はありません)";
				effectsSection.appendChild(p);
			} else {
				const ul = document.createElement("ul");
				for (const key of Object.keys(effects)) {
					const entry = effects[key];
					if (!entry) continue;
					const li = document.createElement("li");
					const display = entry.displayName || key;
					li.textContent = `${display} (${entry.turns}ターン)`;
					ul.appendChild(li);
				}
				effectsSection.appendChild(ul);
			}
		}
	}

	/**
	 * メニュー内にメッセージを表示する（アイテム使用などで使う）
	 * @param {string} text
	 */
	displayMenuMessage(text: string) {
		const menuContent = document.getElementById("menu-content");
		if (!menuContent) return;
		// Guard: do not show empty menu messages
		if (text === null || typeof text === "undefined") return;
		const mtxt = String(text);
		if (mtxt.trim() === "") return;
		let menuMsg = document.getElementById("menu-message");
		if (!menuMsg) {
			menuMsg = document.createElement("div");
			menuMsg.id = "menu-message";
			menuMsg.className = "menu-message";
			// メッセージはメニューの上部に表示
			menuContent.insertBefore(menuMsg, menuContent.firstChild);
		}
		// If the menu overlay is present but currently hidden, temporarily show it
		// so the menu message becomes visible. Remember the original state and
		// restore it in clearMenuMessage.
		try {
			// Important: do NOT unhide the full menu overlay here. The menu must only
			// be opened during自由行動 (free action) periods. If the menu is
			// currently hidden, fall back to showing the message in the main message
			// area so the UI does not briefly reveal the overlay.
			if (this.menuOverlay?.classList.contains("hidden")) {
				if (typeof this.showFloatingMessage === "function") {
					// showFloatingMessage already handles click waits and visibility.
					this.showFloatingMessage(text).catch(() => {});
					return;
				} else if (typeof this.displayMessage === "function") {
					this.displayMessage(text, "システム");
					return;
				}
			}
		} catch {
			/* ignore */
		}

		menuMsg.textContent = String(text);
		menuMsg.style.display = "block";
	}

	/**
	 * メニュー内でのクリックを待つ
	 * @returns {Promise<void>}
	 */
	waitForMenuClick() {
		return new Promise<void>((resolve) => {
			// デフォルトはメニューのコンテンツ部分でのクリックを待つ
			const menuContent = document.getElementById("menu-content");
			if (!menuContent) return resolve();

			const listener = () => {
				// クリックが発生したらリスナーを解除して解決
				menuContent.removeEventListener("click", listener);
				// preventDefault や stopPropagation はここでは不要
				resolve();
			};

			menuContent.addEventListener("click", listener);
		});
	}

	/**
	 * メニュー内のメッセージをクリアする
	 */
	clearMenuMessage() {
		const menuMsg = document.getElementById("menu-message");
		if (menuMsg) {
			menuMsg.textContent = "";
			menuMsg.style.display = "none";
		}
		// restore any temporary menu overlay visibility change
		try {
			// No-op: do not restore or toggle menu overlay here. Menu visibility is
			// strictly controlled via openMenu/closeMenu and GameEventManager.isInFreeAction.
		} catch {
			/* ignore */
		}
	}

	/**
	 * 短時間だけ画面上部に表示される非破壊的なお知らせ（トースト）
	 * @param {string} text
	 * @param {{ duration?: number }}
 options
	 */
	showTransientNotice(text: string, options: { duration?: number } = {}) {
		if (!text || text.trim() === "") return;
		const dur = options.duration ?? 1200;
		let el = document.getElementById("transient-notice");
		if (!el) {
			el = document.createElement("div");
			el.id = "transient-notice";
			el.className = "transient-notice";
			const gameContainer = document.getElementById("game-container");
			if (gameContainer) gameContainer.appendChild(el);
			el.addEventListener("click", () => {
				el.classList.add("fadeout");
				setTimeout(() => el.remove(), 220);
			});
		}
		el.textContent = text;
		el.classList.remove("fadeout");
		// 自動で消す
		setTimeout(() => {
			if (el?.parentNode) {
				el.classList.add("fadeout");
				setTimeout(() => {
					try {
						el.remove();
					} catch {
						/* ignore */
					}
				}, 220);
			}
		}, dur);
	}

	/**
	 * メニューの上に重ねて表示するフローティングメッセージ
	 * 複数行が与えられた場合は順に表示し、最後まで表示し終えたら自動で閉じる
	 * @param {string} text
	 * @param {{ lineDelay?: number }}
 [options]
	 * @returns {Promise<void>}
	*/
	async showFloatingMessage(text: string | undefined | null, options: { lineDelay?: number } = {}) {
		console.log("UI.showFloatingMessage called:", text);
		const lines = ("" + text).split("\n");

		// 保持しておく既存の表示とスタイル
		const origZ = this.messageWindow.style.zIndex;
		const origDisplay = this.messageWindow.style.display;
		const prevChar = this.characterName.textContent;
		const prevMsg = this.messageText.textContent;
		const prevClick = this.clickIndicator.style.display;

		try {
			// メッセージウィンドウを最前面に出す
			this.messageWindow.style.zIndex = "9999";
			this.messageWindow.style.display = "block";

			for (const line of lines) {
				console.log("UI.showFloatingMessage line:", line);
				this.characterName.textContent = "システム";
				this.messageText.textContent = String(line ?? "");
				// クリックインジケーターを表示して、ユーザークリックで次へ進める
				this.clickIndicator.style.display = "block";

				// ローカルのクリック待ち（this.waitForClick を使わない）
				await new Promise<void>((resolve) => {
					const listener = () => {
						try {
							// クリック音
							if (typeof soundManager !== "undefined")
								soundManager.play("ui_action");
						} catch {
							/* ignore */
						}
						// リスナーを外して進行
						this.messageWindow.removeEventListener("click", listener);
						// クリックインジケーターは次行表示前に消す
						this.clickIndicator.style.display = "none";
						resolve();
					};
					this.messageWindow.addEventListener("click", listener);
					// タイムアウトフォールバック: lineDelay が正の数の場合のみタイムアウトを設定する。
					// lineDelay === 0 は「クリック待ちのみ」を意味する。
					if (
						options &&
						typeof options.lineDelay === "number" &&
						options.lineDelay > 0
					) {
						setTimeout(() => {
							this.messageWindow.removeEventListener("click", listener);
							try {
								this.clickIndicator.style.display = "none";
							} catch {
								/* ignore */
							}
							resolve();
						}, options.lineDelay);
					}
				});
			}
		} finally {
			// ループ後: 元の表示内容を復元して、メッセージウィンドウが空白になるのを防ぐ
			try {
				this.characterName.textContent = prevChar || "";
				this.messageText.textContent = prevMsg || "";
			} catch (_e) {}
			this.messageWindow.style.zIndex = origZ;
			this.messageWindow.style.display = origDisplay;
			this.clickIndicator.style.display = prevClick || "none";
		}
	}

	/**
	 * メニューボタンと閉じるボタンのイベントリスナーを設定する
	 */
	initializeMenuListeners() {
		this.menuButton.addEventListener("click", () => {
			try {
				if (typeof soundManager !== "undefined") soundManager.play("ui_action");
			} catch (_e) {}
			this.openMenu();
		});
		this.menuCloseButton.addEventListener("click", () => {
			try {
				if (typeof soundManager !== "undefined") soundManager.play("ui_action");
			} catch (_e) {}
			this.closeMenu();
		});
		if (this.menuCloseFloating)
			this.menuCloseFloating.addEventListener("click", () => {
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch (_e) {}
				this.closeMenu();
			});

		//折りたたみトグル
		if (this.toggleItemsButton && this.menuItemSection) {
			// Primary behavior: open dedicated item window when clicked
			this.toggleItemsButton.addEventListener("click", async () => {
				// If not in free action, show transient notice instead
				if (
					typeof GameEventManager === "undefined" ||
					!GameEventManager.isInFreeAction
				) {
					try {
						if (typeof soundManager !== "undefined") soundManager.play("error");
					} catch (_e) {}
					this.showTransientNotice("メニューは自由行動時間のみ開けます。", {
						duration: 1200,
					});
					return;
				}
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch (_e) {}
				await this.openMenuWindow("item");
			});
		}
		if (this.toggleHistoryButton && this.menuHistorySection) {
			this.toggleHistoryButton.addEventListener("click", async () => {
				if (
					typeof GameEventManager === "undefined" ||
					!GameEventManager.isInFreeAction
				) {
					try {
						if (typeof soundManager !== "undefined") soundManager.play("error");
					} catch (_e) {}
					this.showTransientNotice("メニューは自由行動時間のみ開けます。", {
						duration: 1200,
					});
					return;
				}
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch (_e) {}
				await this.openMenuWindow("history");
			});
		}
		if (this.toggleCharactersButton && this.menuCharactersSection) {
			this.toggleCharactersButton.addEventListener("click", async () => {
				if (
					typeof GameEventManager === "undefined" ||
					!GameEventManager.isInFreeAction
				) {
					try {
						if (typeof soundManager !== "undefined") soundManager.play("error");
					} catch (_e) {}
					this.showTransientNotice("メニューは自由行動時間のみ開けます。", {
						duration: 1200,
					});
					return;
				}
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch (_e) {}
				await this.openMenuWindow("character");
			});
		}

		this.toggleReportButton = document.getElementById("toggle-report-button");
		if (this.toggleReportButton) {
			this.toggleReportButton.addEventListener("click", async () => {
				if (
					typeof GameEventManager === "undefined" ||
					!GameEventManager.isInFreeAction
				) {
					try {
						if (typeof soundManager !== "undefined") soundManager.play("error");
					} catch (_e) {}
					this.showTransientNotice("メニューは自由行動時間のみ開けます。", {
						duration: 1200,
					});
					return;
				}
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch (_e) {}
				await this.openMenuWindow("report");
			});
		}

		// menu-window close buttons
		const winCloses = document.querySelectorAll(
			".menu-window .menu-window-close",
		);
		winCloses.forEach((btn) => {
			btn.addEventListener("click", (_e) => {
				// @ts-expect-error closest exists on EventTarget in runtime
				const win = (_e.target as Element).closest(".menu-window");
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch (_err) {}
				this.closeMenuWindow(win as Element);
			});
		});

		// セーブ・ロードボタンのイベントリスナー
		if (this.saveGameButton) {
			this.saveGameButton.addEventListener("click", () => {
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch (_e) {}
				this.handleSaveGame();
			});
		}
		if (this.loadGameButton) {
			this.loadGameButton.addEventListener("click", () => {
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("ui_action");
				} catch (_e) {}
				this.loadGameFileInput?.click();
			});
		}
		if (this.loadGameFileInput) {
			this.loadGameFileInput.addEventListener("change", (event) =>
				this.handleLoadGame(event, false),
			); // メニューからは isFromTitle=false
		}

		// Audio controls in menu (volume slider and mute button)
		const volEl = document.getElementById(
			"sound-volume",
		) as HTMLInputElement | null;
		const muteBtn = document.getElementById("sound-mute");
		if (volEl) {
			// Restore saved volume if present
			try {
				const saved = localStorage.getItem("game_sound_volume");
				if (saved !== null) {
					volEl.value = String(saved);
					const v = parseFloat(saved);
					if (
						typeof soundManager !== "undefined" &&
						typeof soundManager.setVolume === "function"
					)
						soundManager.setVolume(v);
				}
			} catch (_e) {}

			volEl.addEventListener("input", (evt: Event) => {
				const input = (evt.currentTarget ||
					evt.target) as HTMLInputElement | null;
				const v = parseFloat(String(input?.value ?? ""));
				if (
					typeof soundManager !== "undefined" &&
					typeof soundManager.setVolume === "function"
				) {
					soundManager.setVolume(v);
				}
				try {
					localStorage.setItem("game_sound_volume", String(v));
				} catch {
					/* ignore */
				}
			});
		}
		if (muteBtn) {
			// Restore mute state
			try {
				const savedMute = localStorage.getItem("game_sound_muted");
				if (savedMute !== null) {
					const m = savedMute === "1";
					if (typeof soundManager !== "undefined") {
						soundManager.setMuted(m);
						muteBtn.textContent = m ? "ミュート解除" : "ミュート";
					}
				}
			} catch (_e) {}

			muteBtn.addEventListener("click", () => {
				if (typeof soundManager === "undefined") return;
				soundManager.toggleMute();
				muteBtn.textContent = soundManager.muted ? "ミュート解除" : "ミュート";
				try {
					localStorage.setItem(
						"game_sound_muted",
						soundManager.muted ? "1" : "0",
					);
				} catch {
					/* ignore */
				}
			});
		}

		// キーボード操作の初期化
		this._keyboardHandler = this._keyboardHandler || this._boundKeyboardHandler;
		if (!this._boundKeyboardHandler) {
			this._boundKeyboardHandler = this._handleGlobalKeydown.bind(this);
			window.addEventListener("keydown", this._boundKeyboardHandler);
		}
	}

	/**
	 * グローバルな keydown ハンドラ
	 * - 矢印上下で選択肢を移動
	 * - Enter で選択（ある場合）
	 * - Escape または M でメニュー開閉
	 */
	_handleGlobalKeydown(e: KeyboardEvent) {
		try {
			// when menu overlay is visible, allow Esc to close
			const key = e.key;
			if (!key) return;

			// If menu is open, prefer navigating the menu's focusable elements
			const overlay = document.getElementById("menu-overlay");
			const menuOpen = overlay && !overlay.classList.contains("hidden");
			if (menuOpen) {
				// If an inner menu-window (item/history/character detail) is open,
				// Escape should close that window first instead of the whole menu.
				if (key === "Escape") {
					const openWindows = Array.from(
						document.querySelectorAll(".menu-window"),
					).filter((w) => !w.classList.contains("hidden"));
					if (openWindows.length > 0) {
						const last = openWindows[openWindows.length - 1];
						try {
							this.closeMenuWindow(last);
						} catch (_e) {
							console.warn("closeMenuWindow error", _e);
						}
						return;
					}
				}

				// If a dedicated menu-window (item/history/detail) is open, navigate inside it
				const openWindows = Array.from(
					document.querySelectorAll(".menu-window"),
				).filter((w) => !w.classList.contains("hidden"));
				const container =
					openWindows.length > 0
						? openWindows[openWindows.length - 1]
						: document.getElementById("menu-content");
				if (container) {
					const focusable = Array.from(
						container.querySelectorAll<HTMLElement>(
							'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
						),
					).filter((el) => el.offsetParent !== null) as HTMLElement[]; // visible only
					if (focusable.length > 0) {
						const idx = focusable.findIndex(
							(el) => el === document.activeElement,
						);
						if (key === "ArrowDown" || key === "ArrowRight") {
							e.preventDefault();
							const next = idx + 1 >= focusable.length ? 0 : idx + 1;
							focusable[next].focus();
							// visual sync
							focusable.forEach((el, _i) => {
								if (_i === next) el.classList.add("focused");
								else el.classList.remove("focused");
							});
							return;
						}
						if (key === "ArrowUp" || key === "ArrowLeft") {
							e.preventDefault();
							const prev = idx - 1 < 0 ? focusable.length - 1 : idx - 1;
							focusable[prev].focus();
							focusable.forEach((el, _i) => {
								if (_i === prev) el.classList.add("focused");
								else el.classList.remove("focused");
							});
							return;
						}
						if (key === "Enter") {
							e.preventDefault();
							const target = idx >= 0 ? focusable[idx] : focusable[0];
							if (target) target.click();
							// ensure focused class on activation
							focusable.forEach((el, _i) => {
								if (el === target) el.classList.add("focused");
								else el.classList.remove("focused");
							});
							return;
						}
					}
				}
				// allow closing menu with Escape/M even if no focusables
				if (key === "Escape" || key === "m" || key === "M") {
					this.closeMenu();
					return;
				}
				return; // don't let background choices move while menu is open
			}

			// If choices are visible, handle navigation
			const choices = Array.from(
				document.querySelectorAll("#choices-area .choice-button"),
			);
			if (choices && choices.length > 0) {
				// Find currently focused index
				const idx = choices.findIndex((b) => b.classList.contains("focused"));
				if (key === "ArrowDown" || key === "ArrowRight") {
					e.preventDefault();
					const next = idx + 1 >= choices.length ? 0 : idx + 1;
					this._setChoiceFocus(choices, next);
					return;
				}
				if (key === "ArrowUp" || key === "ArrowLeft") {
					e.preventDefault();
					const prev = idx - 1 < 0 ? choices.length - 1 : idx - 1;
					this._setChoiceFocus(choices, prev);
					return;
				}
				if (key === "Enter") {
					e.preventDefault();
					// Activate focused or first
					const target = idx >= 0 ? choices[idx] : choices[0];
					if (target) target.click();
					return;
				}
			}

			// If no choices are present, allow Enter to advance message (unless typing in an input)
			try {
				const active = document.activeElement;
				const tag = active ? (active.tagName || "").toUpperCase() : "";
				const isEditable =
					active &&
					(active.isContentEditable ||
						tag === "INPUT" ||
						tag === "TEXTAREA" ||
						tag === "SELECT");
				if (!isEditable && key === "Enter") {
					// If a message window is visible and waiting for click, emulate click to advance
					if (
						this.messageWindow &&
						window.getComputedStyle(this.messageWindow).display !== "none"
					) {
						// If clickIndicator is visible or messageText not empty, dispatch click
						try {
							const indicator = this.clickIndicator;
							const msgText = this.messageText?.textContent
								? this.messageText.textContent.trim()
								: "";
							const showIndicator =
								indicator &&
								window.getComputedStyle(indicator).display !== "none";
							if (showIndicator || msgText !== "") {
								e.preventDefault();
								// trigger the same path as a user click
								this.messageWindow.click();
								return;
							}
						} catch (_e) {}
					}
				}
			} catch (e) {
				console.warn("enter-advance guard error", e);
			}

			// Toggle menu with Escape or 'm'/'M'
			// If title screen is visible, handle title navigation first
			const titleVisible =
				this.titleScreen &&
				window.getComputedStyle(this.titleScreen).display !== "none";
			if (titleVisible) {
				const titleButtons = Array.from(
					document.querySelectorAll("#title-screen .title-buttons button"),
				);
				if (titleButtons.length > 0) {
					const tIdx = titleButtons.findIndex(
						(b) =>
							b === document.activeElement || b.classList.contains("focused"),
					);
					if (key === "ArrowDown" || key === "ArrowRight") {
						e.preventDefault();
						const next = tIdx + 1 >= titleButtons.length ? 0 : tIdx + 1;
						this._setTitleButtonFocus(titleButtons, next);
						return;
					}
					if (key === "ArrowUp" || key === "ArrowLeft") {
						e.preventDefault();
						const prev = tIdx - 1 < 0 ? titleButtons.length - 1 : tIdx - 1;
						this._setTitleButtonFocus(titleButtons, prev);
						return;
					}
					if (key === "Enter") {
						e.preventDefault();
						// If protagonist name input is focused, pressing Enter should start game
						const active = document.activeElement;
						if (active && active.id === "protagonist-name") {
							const btn = document.getElementById("new-game-button");
							if (btn) btn.click();
							return;
						}
						const target = tIdx >= 0 ? titleButtons[tIdx] : titleButtons[0];
						if (target) target.click();
						return;
					}
				}
			}

			if (key === "Escape" || key === "m" || key === "M") {
				// If menu is open, close it; otherwise try to open it (respecting free action)
				const overlay = document.getElementById("menu-overlay");
				if (!overlay) return;
				if (!overlay.classList.contains("hidden")) {
					this.closeMenu();
				} else {
					this.openMenu();
				}
			}
		} catch (err) {
			console.error("keyboard handler error", err);
		}
	}

	/**
	 * 選択肢ボタンに対してフォーカス表示を設定する
	 * @param {Element[]} choices
	 * @param {number} index
	 */
	_setChoiceFocus(choices: Element[], index: number) {
		choices.forEach((b, i) => {
			if (i === index) {
				b.classList.add("focused");
				// ensure visible
				try {
					b.scrollIntoView({ block: "nearest", inline: "nearest" });
				} catch (_e) {}
			} else {
				b.classList.remove("focused");
			}
		});
	}

	/**
	 * ゲームのセーブ処理
	 */
	handleSaveGame() {
		if (typeof gameManager === "undefined") return;
		const saveData = gameManager.getAllStatus(); // 全ステータスを取得
		const dataStr = JSON.stringify(saveData, null, 2); // 整形してJSON文字列に変換

		this.createDownloadLink(dataStr, "game_save.json", "application/json");
		this.displayMenuMessage(
			"ゲームデータをセーブしました。ダウンロードリンクを確認してください。",
		);
	}

	/**
	 * ゲームのロード処理
	 * @param {Event|boolean} eventOrIsFromTitle - ファイル入力のchangeイベントまたはタイトル画面からの呼び出しかどうか
	 * @param {boolean} [isFromTitle=false] - タイトル画面からの呼び出しかどうか
	 */
	handleLoadGame(eventOrIsFromTitle: Event | boolean, isFromTitle = false) {
		// Backwards-compatible support:
		// - Called as handleLoadGame(changeEvent, boolean) from file input (menu)
		// - Called as handleLoadGame(true) from title screen (legacy call). In that
		//   case we create a temporary file input, open the picker and delegate to
		//   this function when a file is chosen.
		if (typeof eventOrIsFromTitle === "boolean") {
			isFromTitle = eventOrIsFromTitle;
			// create temporary input
			const tempInput = document.createElement("input");
			tempInput.type = "file";
			tempInput.accept = ".json,application/json";
			tempInput.style.display = "none";
			document.body.appendChild(tempInput);
			const cleanup = () => {
				try {
					tempInput.remove();
				} catch (e) {
					/* ignore */
				}
			};
			tempInput.addEventListener(
				"change",
				(ev) => {
					this.handleLoadGame(ev, isFromTitle);
					setTimeout(cleanup, 500);
				},
				{ once: true },
			);
			// trigger file picker
			tempInput.click();
			return;
		}

		const event = eventOrIsFromTitle as Event;
		const target = event?.target as HTMLInputElement | null;
		const file = target?.files && target.files.length > 0 ? target.files[0] : null;
		if (!file) {
			if (!isFromTitle) {
				this.displayMenuMessage("ファイルが選択されていません。");
			}
			return;
		}

		const reader = new FileReader();
		reader.onload = (e: ProgressEvent<FileReader>) => {
			try {
				const result = (e.target as FileReader | null)?.result ?? null;
				if (typeof result !== "string") {
					throw new Error("Unexpected FileReader result");
				}
				const loadedData = JSON.parse(result);

				// ロード直後にゲームを開始または再開する共通ロジック
				const startGameAfterLoad = (loadedStatus: GameStatus) => {
					const playerChar = loadedStatus?.characters?.find((c: Character) => c.id === "player");
					const playerName = playerChar?.name ?? "主人公";

					// グローバルな gameManager/ui がなければ初期化
					if (typeof initializeGame !== "function") {
						console.error("initializeGame is not defined");
						return;
					}
					initializeGame(playerName);
					gameManager.loadGame(loadedStatus);
					this.showTransientNotice("ゲームデータをロードしました。");
					GameEventManager.showMainActions();
				};

				if (isFromTitle) {
					startGameAfterLoad(loadedData);
				} else {
					// メニューからのロード
					gameManager.loadGame(loadedData);
					this.displayMenuMessage("ゲームデータをロードしました。");
					this.closeMenu();
					GameEventManager.showMainActions();
				}
			} catch (error) {
				console.error("Failed to load game data:", error);
				const message =
					"ゲームデータのロードに失敗しました。ファイルが破損しているか、形式が正しくありません。";
				try {
					if (typeof soundManager !== "undefined") soundManager.play("error");
				} catch (e) {}
				if (isFromTitle) {
					this.showTransientNotice(message);
				} else {
					this.displayMessage(message);
				}
			}
		};
		reader.readAsText(file);
	}

	/**
	 * ダウンロードリンクを生成し、ユーザーに提示する
	 * @param {string} data - ダウンロードするデータ文字列
	 * @param {string} filename - ファイル名
	 * @param {string} type - MIMEタイプ
	 */
	createDownloadLink(data, filename, type) {
		const blob = new Blob([data], { type: type });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.textContent = `セーブデータをダウンロード (${filename})`;
		a.style.display = "block";
		a.style.marginTop = "10px";
		a.style.color = "#87CEEB";
		a.style.textDecoration = "underline";

		const menuSaveLoadSection = document.getElementById(
			"menu-save-load-section",
		);
		if (menuSaveLoadSection) {
			// 既存のダウンロードリンクがあれば削除
			const existingLink = menuSaveLoadSection.querySelector("a[download]");
			if (existingLink) {
				existingLink.remove();
			}
			menuSaveLoadSection.appendChild(a);
		}

		// オブジェクトURLは不要になったら解放する
		a.addEventListener("click", () => {
			setTimeout(() => URL.revokeObjectURL(url), 100);
		});
	}
}
