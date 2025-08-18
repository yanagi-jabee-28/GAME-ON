/**
 * @file ui.js
 * @description UIの描画や更新を担当するファイル
 * HTML要素の操作はすべてここで行い、他のロジックから分離します。
 */

class UIManager {
	/**
	 * UIManagerのコンストラクタ
	 */
	constructor() {
		// UI要素を取得してプロパティに保持
		this.titleScreen = document.getElementById('title-screen');
		this.gameScreen = document.getElementById('game-screen');

		this.dateDisplay = document.getElementById('date-display');
		this.timeOfDayDisplay = document.getElementById('time-of-day-display');
		this.physicalDisplay = document.getElementById('physical-display');
		this.mentalDisplay = document.getElementById('mental-display');
		this.technicalDisplay = document.getElementById('technical-display');
		this.moneyDisplay = document.getElementById('money-display');
		this.cpDisplay = document.getElementById('cp-display');

		this.messageWindow = document.getElementById('message-window');
		this.characterName = document.getElementById('character-name');
		this.messageText = document.getElementById('message-text');
		this.clickIndicator = document.getElementById('click-indicator');

		this.choicesArea = document.getElementById('choices-area');

		// メニュー関連の要素
		this.menuButton = document.getElementById('menu-button');
		this.menuCloseButton = document.getElementById('menu-close-button');
		this.menuOverlay = document.getElementById('menu-overlay');
		this.menuAcademic = document.getElementById('menu-academic');
		this.menuPhysical = document.getElementById('menu-physical');
		this.menuMental = document.getElementById('menu-mental');
		this.menuTechnical = document.getElementById('menu-technical');
		this.menuReportDebt = document.getElementById('menu-report-debt');
		this.menuItemList = document.getElementById('menu-item-list');
		this.menuCloseFloating = document.getElementById('menu-close-floating');
		this.menuItemSection = document.getElementById('menu-item-section');
		this.menuHistorySection = document.getElementById('menu-history-section');
		this.toggleItemsButton = document.getElementById('toggle-items-button');
		this.toggleHistoryButton = document.getElementById('toggle-history-button');

		// キャラクター関連 UI 要素
		this.focusedCharacterWrap = document.getElementById('focused-character');
		this.focusedCharacterName = document.getElementById('focused-character-name');
		this.focusedCharacterTrust = document.getElementById('focused-character-trust');


		// セーブ・ロード関連の要素
		this.saveGameButton = document.getElementById('save-game-button');
		this.loadGameButton = document.getElementById('load-game-button');
		this.loadGameFileInput = document.getElementById('load-game-file-input');

		// GameManager のステータス変更を購読して自動的に表示を更新
		if (typeof gameManager !== 'undefined' && typeof gameManager.subscribe === 'function') {
			gameManager.subscribe(status => {
				this.updateStatusDisplay(status);
				// メニューが開いている場合はメニューの内容も更新する
				if (this.menuOverlay && !this.menuOverlay.classList.contains('hidden')) {
					this.updateMenuDisplay();
				}
				// キャラクター表示の更新
				this.updateFocusedCharacter(status);
			});
		}
	}

	showTitleScreen() {
		if (this.titleScreen) this.titleScreen.style.display = 'flex';
		if (this.gameScreen) this.gameScreen.style.display = 'none';
	}

	showGameScreen() {
		if (this.titleScreen) this.titleScreen.style.display = 'none';
		if (this.gameScreen) this.gameScreen.style.display = 'block';
	}

	/**
	 * メニューの専用ウィンドウを開く
	 * @param {'item'|'history'} type
	*/
	async openMenuWindow(type) {
		try {
			// メニュー自体が閉じている場合は開く（ただしフリー行動チェックは openMenu が行う）
			if (this.menuOverlay && this.menuOverlay.classList.contains('hidden')) {
				this.menuOverlay.classList.remove('hidden');
			}
			// Mark as user-opened because this is invoked from a user action
			try { if (this.menuOverlay) this.menuOverlay.dataset.userOpened = '1'; } catch (e) { }

			if (type === 'item') {
				const win = document.getElementById('menu-item-window');
				if (!win) return;
				const list = document.getElementById('menu-item-window-list');
				list.innerHTML = '';
				const status = gameManager.getAllStatus();
				if (!status.items || status.items.length === 0) {
					const li = document.createElement('li');
					li.textContent = '(アイテムはありません)';
					list.appendChild(li);
				} else {
					status.items.forEach(itemId => {
						const item = ITEMS[itemId];
						const li = document.createElement('li');
						li.innerHTML = `<span>${item ? item.name : itemId} - ${item ? item.description : ''}</span>`;

						const useBtn = document.createElement('button');
						useBtn.textContent = '使用';
						useBtn.onclick = async () => {
							if (useBtn.disabled) return;
							useBtn.disabled = true;
							try {
								const ok = await gameManager.useItem(itemId);
								// 使用が成功していればこのウィンドウを再描画して所持数を反映する
								if (ok) {
									await this.openMenuWindow('item');
								} else {
									// 失敗（所持していない等）はトーストで通知して再描画
									this.showTransientNotice('アイテムを所持していません。', { duration: 1200 });
									await this.openMenuWindow('item');
								}
							} catch (e) {
								console.error('useItem error (window)', e);
							} finally {
								useBtn.disabled = false;
							}
						};
						li.appendChild(useBtn);
						list.appendChild(li);
					});
				}
				win.classList.remove('hidden');
				return;
			}

			if (type === 'history') {
				const win = document.getElementById('menu-history-window');
				if (!win) return;
				const list = document.getElementById('menu-history-window-list');
				list.innerHTML = '';
				const status = gameManager.getAllStatus();
				const history = status.history || [];
				if (history.length === 0) {
					const li = document.createElement('li');
					li.textContent = '(履歴はありません)';
					list.appendChild(li);
				} else {
					const entries = history.slice().reverse();
					entries.forEach(h => {
						const li = document.createElement('li');
						const time = `${h.day}日目 ${h.turn || ''}`.trim();
						let text = '';

						// If a human-readable label was attached by gameManager.addHistory, prefer it.
						if (h && h._label) {
							li.textContent = `${time}: ${h._label}`;
							list.appendChild(li);
							return;
						}
						if (h.type === 'use_item') {
							const itemName = h.detail && h.detail.itemName ? h.detail.itemName : (h.detail && h.detail.itemId && ITEMS[h.detail.itemId] ? ITEMS[h.detail.itemId].name : h.detail && h.detail.itemId ? h.detail.itemId : 'アイテム');
							text = `${time}: アイテム使用 - ${itemName}`;
						} else if (h.type === 'choice') {
							const label = h.detail && h.detail.label ? h.detail.label : '';
							text = `${time}: 選択 - ${label}`;
						} else {
							text = `${time}: ${h.type}`;
						}
						li.textContent = text;
						list.appendChild(li);
					});
				}
				win.classList.remove('hidden');
				return;
			}
		} catch (e) {
			console.error('openMenuWindow error', e);
		}
	}

	/**
	 * メニュー専用ウィンドウを閉じる
	 * @param {HTMLElement} winEl
	 */
	closeMenuWindow(winEl) {
		if (!winEl) return;
		winEl.classList.add('hidden');
	}

	/**
	 * ステータス表示を更新する
	 * @param {object} status - 表示するステータス情報 (GameManagerから取得)
	 */
	updateStatusDisplay(status) {
		console.log('UI.updateStatusDisplay called with status:', status);
		// 日付表示に曜日を付与
		const weekday = typeof gameManager.getWeekdayName === 'function' ? gameManager.getWeekdayName() : '';
		// DOM が差し替えられている可能性があるため、要素が document に存在するか確認して再取得する
		try {
			if (!this.dateDisplay || !document.contains(this.dateDisplay)) this.dateDisplay = document.getElementById('date-display');
			if (!this.timeOfDayDisplay || !document.contains(this.timeOfDayDisplay)) this.timeOfDayDisplay = document.getElementById('time-of-day-display');
			if (!this.moneyDisplay || !document.contains(this.moneyDisplay)) this.moneyDisplay = document.getElementById('money-display');
			if (!this.cpDisplay || !document.contains(this.cpDisplay)) this.cpDisplay = document.getElementById('cp-display');
			if (!this.physicalDisplay || !document.contains(this.physicalDisplay)) this.physicalDisplay = document.getElementById('physical-display');
			if (!this.mentalDisplay || !document.contains(this.mentalDisplay)) this.mentalDisplay = document.getElementById('mental-display');
			if (!this.technicalDisplay || !document.contains(this.technicalDisplay)) this.technicalDisplay = document.getElementById('technical-display');
			// academic may be added in the header chips
			if (!this.academicDisplay || !document.contains(this.academicDisplay)) this.academicDisplay = document.getElementById('academic-display');
		} catch (e) { console.warn('Error checking status display elements', e); }

		if (this.dateDisplay) this.dateDisplay.textContent = `${status.day}日目 (${weekday}曜日)`;
		if (this.timeOfDayDisplay) this.timeOfDayDisplay.textContent = CONFIG.TURNS[status.turnIndex];
		if (this.physicalDisplay) this.physicalDisplay.textContent = status.stats && typeof status.stats.physical !== 'undefined' ? status.stats.physical : '';
		if (this.mentalDisplay) this.mentalDisplay.textContent = status.stats && typeof status.stats.mental !== 'undefined' ? status.stats.mental : '';
		if (this.academicDisplay) this.academicDisplay.textContent = status.stats && typeof status.stats.academic !== 'undefined' ? status.stats.academic : '';
		if (this.technicalDisplay) this.technicalDisplay.textContent = status.stats && typeof status.stats.technical !== 'undefined' ? status.stats.technical : '';
		// 通貨単位は CONFIG.LABELS.currencyUnit を優先
		const unit = (CONFIG && CONFIG.LABELS && CONFIG.LABELS.currencyUnit) ? CONFIG.LABELS.currencyUnit : '円';
		this.moneyDisplay.textContent = `${status.money}${unit}`;
		this.cpDisplay.textContent = status.cp;
	}

	/**
	 * フォーカス中のキャラクター表示を更新する
	 */
	updateFocusedCharacter(status) {
		try {
			if (!this.focusedCharacterWrap) return;
			const player = gameManager.getCharacter('player');
			if (!player) {
				this.focusedCharacterWrap.style.display = 'none';
				return;
			}
			this.focusedCharacterName.textContent = player.name || '';
			this.focusedCharacterTrust.textContent = (typeof player.trust === 'number') ? `${player.trust}` : '';
			this.focusedCharacterWrap.style.display = 'flex';
		} catch (e) { console.warn('updateFocusedCharacter error', e); }
	}

	/**
	 * メッセージとキャラクター名を表示する
	 * @param {string} text - 表示するメッセージ本文
	 * @param {string} [characterName=''] - 表示するキャラクター名 (省略可能)
	 */
	displayMessage(text, characterName = '') {
		// Guard: ignore empty or whitespace-only messages to avoid showing
		// an empty message window that only waits for a click.
		if (text === null || typeof text === 'undefined') return;
		const txt = String(text);
		if (txt.trim() === '') {
			console.log('UI.displayMessage: ignoring empty message');
			return;
		}

		let finalCharacterName = characterName;
		if (characterName === '主人公' && typeof gameManager !== 'undefined') {
			const player = gameManager.getCharacter('player');
			if (player && player.name) {
				finalCharacterName = player.name;
			}
		}

		console.log('UI.displayMessage called:', { characterName: finalCharacterName, text: txt });
		// メニューが開いている場合はメッセージウィンドウを前面に出す
		// 常にメッセージウィンドウを前面に出しておく（overlay が残っている場合の救済策）
		try {
			this.messageWindow.style.zIndex = 2000; // overlay (1000) より高くしておく
		} catch (e) { }
		if (this.menuOverlay && !this.menuOverlay.classList.contains('hidden')) {
			// 元の zIndex を保存しておく
			if (typeof this.messageWindow.dataset.origZ === 'undefined') {
				this.messageWindow.dataset.origZ = this.messageWindow.style.zIndex || '';
			}
			this.messageWindow.style.zIndex = 10001; // menuより前面
			// メッセージウィンドウが非表示になっている場合は表示する
			this.messageWindow.style.display = 'block';
		}

		this.characterName.textContent = finalCharacterName;
		this.messageText.textContent = text;
		// 追加デバッグ: メッセージDOMの内容を確認
		try { console.log('messageText.innerHTML:', this.messageText.innerHTML, 'computed display:', window.getComputedStyle(this.messageWindow).display, 'zIndex:', this.messageWindow.style.zIndex); } catch (e) { }
	}

	/**
	 * メッセージをクリアする
	 */
	clearMessage() {
		console.log('UI.clearMessage called');
		this.characterName.textContent = '';
		this.messageText.textContent = '';
		// クリックインジケーターを確実に消す
		try { this.clickIndicator.style.display = 'none'; } catch (e) { }
		// 保存してあった zIndex を復元
		if (this.messageWindow && typeof this.messageWindow.dataset.origZ !== 'undefined') {
			this.messageWindow.style.zIndex = this.messageWindow.dataset.origZ || '';
			delete this.messageWindow.dataset.origZ;
		}
		// safety: イベントフロー中に menuOverlay が誤って残っている場合は
		// 非自由行動フェーズなら閉じておく（誤って画面を覆わないようにする）
		try {
			// Only auto-hide the overlay when it's not opened by the user and
			// we're not in a free-action phase. If the user explicitly opened the
			// menu (dataset.userOpened === '1'), do not auto-hide here.
			if (this.menuOverlay && typeof GameEventManager !== 'undefined' && !GameEventManager.isInFreeAction) {
				if (!this.menuOverlay.dataset || this.menuOverlay.dataset.userOpened !== '1') {
					this.menuOverlay.classList.add('hidden');
				}
			}
		} catch (e) { }
	}

	/**
	 * ユーザーのクリックを待つ
	 * @returns {Promise<void>} クリックされたら解決するPromise
	 */
	waitForClick() {
		return new Promise(resolve => {
			// クリックインジケーターを表示
			this.clickIndicator.style.display = 'block';

			const listener = () => {
				console.log('UI.waitForClick: click detected, resolving');
				// イベントリスナーを一度実行したら削除する
				this.messageWindow.removeEventListener('click', listener);
				// インジケーターを非表示にする
				this.clickIndicator.style.display = 'none';
				// クリック音を鳴らす（存在すれば）
				if (typeof soundManager !== 'undefined') soundManager.play('click');

				this.clearMessage(); // メッセージをクリア

				// Promiseを解決して、待機状態を終了する
				resolve();
			};

			// メッセージウィンドウにクリックイベントを設定
			this.messageWindow.addEventListener('click', listener);
		});
	}

	/**
	 * 選択肢を表示する
	 * @param {Array<object>} choices - 選択肢の配列。各オブジェクトは { text: '選択肢の文言', callback: 選択されたときの関数 } を持つ
	 */
	displayChoices(choices) {
		// 既存の選択肢をクリア
		this.choicesArea.innerHTML = '';

		if (!choices || choices.length === 0) {
			return; // 選択肢がなければ何もしない
		}

		choices.forEach(choice => {
			const button = document.createElement('button');
			button.textContent = choice.text;
			button.className = 'choice-button';
			button.onclick = () => {
				// 効果音（存在すれば）
				if (typeof soundManager !== 'undefined') soundManager.play('click');
				// 選択肢をクリックしたら、選択履歴を記録
				try {
					if (typeof gameManager !== 'undefined' && typeof gameManager.recordChoice === 'function') {
						gameManager.recordChoice(choice.text);
					}
				} catch (e) { console.error('recordChoice error', e); }

				// 先に既存の選択肢を消してからコールバックを実行する
				// これにより、コールバック内で新しい選択肢を表示しても
				// 直後に元のクリックハンドラがそれらを消してしまう問題を防ぐ
				this.clearChoices();

				try {
					if (choice.callback) {
						choice.callback();
					}
				} catch (e) {
					console.error('choice callback error', e);
				}
			};
			this.choicesArea.appendChild(button);
		});
	}

	/**
	 * 選択肢を非表示にする
	 */
	clearChoices() {
		this.choicesArea.innerHTML = '';
	}

	// --- メニュー関連のメソッド ---

	/**
	 * メニューを開く
	 */
	openMenu() {
		const status = gameManager.getStatus();
		if (status.menuLocked) return; // メニューがロックされているフェーズでは開けない
		// 自由行動時間のみメニューを開ける
		if (typeof GameEventManager === 'undefined' || !GameEventManager.isInFreeAction) {
			// メニューを開けない場合は一時的なダイアログで通知（イベントメッセージの上書きは避ける）
			this.showTransientNotice('メニューは自由行動時間のみ開けます。', { duration: 1200 });
			return;
		}

		// メニューを開く際、もしメッセージウィンドウが表示中であれば
		// メニューとの重なりを防ぐため一時的に非表示にする
		try {
			if (this.messageWindow && window.getComputedStyle(this.messageWindow).display !== 'none') {
				this.messageWindow.dataset.wasVisible = '1';
				this.messageWindow.style.display = 'none';
			}
		} catch (e) { }
		this.menuOverlay.classList.remove('hidden');
		// Mark that the menu was opened by user action so automatic
		// safety code does not hide it unexpectedly.
		try { if (this.menuOverlay) this.menuOverlay.dataset.userOpened = '1'; } catch (e) { }
		if (this.menuCloseFloating) this.menuCloseFloating.setAttribute('aria-visible', 'true');
		this.updateMenuDisplay(); // メニューを開く際に最新の情報を表示
	}

	/**
	 * メニューを閉じる
	 */
	closeMenu() {
		const status = gameManager.getStatus();
		this.menuOverlay.classList.add('hidden');
		if (this.menuCloseFloating) this.menuCloseFloating.setAttribute('aria-visible', 'false');
		// メッセージウィンドウを一時的に隠していた場合は復元する
		try {
			if (this.messageWindow && this.messageWindow.dataset.wasVisible) {
				this.messageWindow.style.display = 'block';
				delete this.messageWindow.dataset.wasVisible;
			}
		} catch (e) { }
		// Clear the userOpened marker when the menu is explicitly closed
		try { if (this.menuOverlay && this.menuOverlay.dataset && this.menuOverlay.dataset.userOpened) delete this.menuOverlay.dataset.userOpened; } catch (e) { }
	}

	/**
	 * メニューの表示内容を更新する
	 */
	updateMenuDisplay() {
		const status = gameManager.getAllStatus(); // GameManagerから全ステータスを取得

		// ラベル定義を取得（なければデフォルト）
		const labels = (typeof CONFIG !== 'undefined' && CONFIG.LABELS) ? CONFIG.LABELS : {};

		// メニューの見出しなど静的ラベルを設定（存在すれば）
		const headerEl = document.getElementById('menu-header');
		if (headerEl) headerEl.textContent = labels.menuTitle || 'メニュー';
		const ownedEl = document.getElementById('menu-owned-heading');
		if (ownedEl) ownedEl.textContent = labels.ownedItems || '所持品';
		const shopEl = document.getElementById('menu-shop-heading');
		if (shopEl) shopEl.textContent = labels.shop || '購買';
		const historyEl = document.getElementById('menu-history-heading');
		if (historyEl) historyEl.textContent = labels.history || '行動履歴';

		// ステータスセクションの更新
		this.menuAcademic.textContent = status.stats.academic;
		this.menuPhysical.textContent = status.stats.physical;
		this.menuMental.textContent = status.stats.mental;
		this.menuTechnical.textContent = status.stats.technical;
		this.menuReportDebt.textContent = status.reportDebt;

		// 個別レポートの表示（存在すれば）
		const reportListId = 'menu-report-list';
		let reportList = document.getElementById(reportListId);
		if (!reportList) {
			reportList = document.createElement('ul');
			reportList.id = reportListId;
			const section = document.getElementById('menu-status-section');
			if (section) section.appendChild(reportList);
		}
		reportList.innerHTML = '';
		if (status.reports && status.reports.length > 0) {
			status.reports.forEach(r => {
				const li = document.createElement('li');
				li.textContent = `${r.title} (${r.progress}/${r.required})`;
				reportList.appendChild(li);
			});
		} else {
			const li = document.createElement('li');
			li.textContent = (labels.noReportsMessage || '進行中のレポートはありません。');
			reportList.appendChild(li);
		}

		// アイテムリストの更新
		this.menuItemList.innerHTML = ''; // 一度クリア
		if (status.items.length === 0) {
			const li = document.createElement('li');
			li.textContent = (labels.noItemsMessage || 'アイテムはありません。');
			this.menuItemList.appendChild(li);
		} else {
			status.items.forEach(itemId => {
				const item = ITEMS[itemId]; // config.jsからアイテム情報を取得
				if (item) {
					const li = document.createElement('li');
					li.innerHTML = `<span>${item.name} - ${item.description}</span>`;

					// アイテム使用ボタンの追加
					const useButton = document.createElement('button');
					useButton.textContent = '使用';
					useButton.onclick = async () => {
						if (typeof gameManager === 'undefined') return;
						if (useButton.disabled) return;
						useButton.disabled = true;
						try {
							const ok = await gameManager.useItem(itemId);
							// 使用が成功していればメニューを再描画して反映
							if (ok) {
								this.updateMenuDisplay();
								this.closeMenu();
								if (typeof GameEventManager !== 'undefined' && typeof GameEventManager.showMainActions === 'function') {
									GameEventManager.showMainActions();
								} else if (typeof ui !== 'undefined') {
									ui.displayMessage('（アイテムを使用しました）');
									if (typeof ui.waitForClick === 'function') await ui.waitForClick();
									if (typeof GameEventManager !== 'undefined' && typeof GameEventManager.showMainActions === 'function') {
										GameEventManager.showMainActions();
									}
								}
							} else {
								// 使用に失敗した場合はトーストで通知し、メニューを再描画
								this.showTransientNotice('アイテムを所持していません。', { duration: 1200 });
								this.updateMenuDisplay();
							}
						} catch (e) {
							console.error('useItem error', e);
						} finally {
							useButton.disabled = false;
						}
					};
					li.appendChild(useButton);
					this.menuItemList.appendChild(li);
				}
			});
		}

		// 履歴表示の更新
		const historyListId = 'menu-history-list';
		let historyList = document.getElementById(historyListId);
		if (!historyList) {
			historyList = document.createElement('ul');
			historyList.id = historyListId;
			const section = document.getElementById('menu-item-section');
			if (section) {
				// 履歴セクションはアイテムセクションの下に配置
				const historySectionHeader = document.createElement('h3');
				historySectionHeader.id = 'menu-history-heading';
				historySectionHeader.textContent = labels.history || '行動履歴';
				section.parentNode.insertBefore(historySectionHeader, section.nextSibling);
				section.parentNode.insertBefore(historyList, historySectionHeader.nextSibling);
			}
		}
		historyList.innerHTML = '';
		const history = status.history || [];
		const unit = (CONFIG && CONFIG.LABELS && CONFIG.LABELS.currencyUnit) ? CONFIG.LABELS.currencyUnit : '円';
		if (history.length === 0) {
			const li = document.createElement('li');
			li.textContent = '(履歴はありません)';
			historyList.appendChild(li);
		} else {
			// 最新が最後尾に入っている想定なので逆順で表示（最新が上）
			const entries = history.slice().reverse();
			entries.forEach(h => {
				const li = document.createElement('li');
				const time = `${h.day}日目 ${h.turn || ''}`.trim();
				let text = '';

				// ユーザー向けのラベルを優先して取得するユーティリティ
				const resolveShopLabel = (shopId, detail) => {
					if (detail && detail.shopLabel) return detail.shopLabel;
					if (shopId && CONFIG && CONFIG.SHOPS && CONFIG.SHOPS[shopId] && CONFIG.SHOPS[shopId].label) return CONFIG.SHOPS[shopId].label;
					return shopId || '';
				};

				switch (h.type) {
					case 'shop_visit': {
						const shopLabel = resolveShopLabel(h.detail && h.detail.shopId, h.detail);
						text = `${time}: ${shopLabel}に入店`;
						break;
					}
					case 'shop_leave': {
						const shopLabel = resolveShopLabel(h.detail && h.detail.shopId, h.detail);
						if (h.detail && h.detail.purchased) {
							const itemName = (h.detail.itemName) ? h.detail.itemName : (h.detail.itemId && ITEMS[h.detail.itemId] ? ITEMS[h.detail.itemId].name : h.detail.itemId || 'アイテム');
							text = `${time}: ${shopLabel}で購入して退店（${itemName}、${h.detail.price || ''}${unit}）`;
						} else {
							text = `${time}: ${shopLabel}を訪れて何も買わず退店`;
						}
						break;
					}
					case 'purchase': {
						const shopLabel = resolveShopLabel(h.detail && h.detail.shopId, h.detail);
						const itemName = h.detail && h.detail.itemName ? h.detail.itemName : (h.detail && h.detail.itemId && ITEMS[h.detail.itemId] ? ITEMS[h.detail.itemId].name : h.detail && h.detail.itemId ? h.detail.itemId : 'アイテム');
						text = `${time}: ${itemName} を ${shopLabel}で購入（${h.detail.price || ''}${unit}）`;
						break;
					}
					case 'choice': {
						const label = h.detail && h.detail.label ? h.detail.label : '';
						text = `${time}: 選択 - ${label}`;
						break;
					}
					case 'use_item': {
						const itemName = h.detail && h.detail.itemName ? h.detail.itemName : (h.detail && h.detail.itemId && ITEMS[h.detail.itemId] ? ITEMS[h.detail.itemId].name : h.detail && h.detail.itemId ? h.detail.itemId : 'アイテム');
						text = `${time}: アイテム使用 - ${itemName}`;
						break;
					}
					default:
						text = `${time}: ${h.type}`;
				}

				li.textContent = text;
				historyList.appendChild(li);
			});
		}

		// --- 効果表示 (effects) ---
		const effectsSectionId = 'menu-effects-section';
		let effectsSection = document.getElementById(effectsSectionId);
		if (!effectsSection) {
			effectsSection = document.createElement('div');
			effectsSection.id = effectsSectionId;
			const header = document.createElement('h3');
			header.textContent = '効果';
			// 場所: スクロール可能なコンテンツ領域 (.menu-scroll) に追加
			const scroll = document.querySelector('.menu-scroll');
			if (scroll) scroll.appendChild(effectsSection);
			else {
				const menuContent = document.getElementById('menu-content');
				if (menuContent) menuContent.appendChild(effectsSection);
			}
		}

		// --- キャラクター表示 ---
		const charsSectionId = 'menu-characters-section';
		let charsSection = document.getElementById(charsSectionId);
		if (!charsSection) {
			charsSection = document.createElement('div');
			charsSection.id = charsSectionId;
			const header = document.createElement('h3');
			header.textContent = 'キャラクター';
			const scroll = document.querySelector('.menu-scroll');
			if (scroll) scroll.appendChild(charsSection);
			else {
				const menuContent = document.getElementById('menu-content');
				if (menuContent) menuContent.appendChild(charsSection);
			}
		}
		charsSection.innerHTML = '';
		const addBtn = document.createElement('button');
		addBtn.textContent = 'キャラクターを追加';
		addBtn.className = 'char-trust-btn';
		addBtn.onclick = () => {
			const name = prompt('キャラクター名を入力してください');
			if (name && typeof gameManager !== 'undefined') {
				const id = gameManager.addCharacter({ name: name, trust: 50 });
				// 再描画
				this.updateMenuDisplay();
			}
		};
		charsSection.appendChild(addBtn);

		const ulId = 'menu-characters-list';
		let ul = document.getElementById(ulId);
		if (!ul) {
			ul = document.createElement('ul');
			ul.id = ulId;
			charsSection.appendChild(ul);
		}
		ul.innerHTML = '';
		const chars = status.characters || [];
		if (chars.length === 0) {
			const li = document.createElement('li');
			li.textContent = '(キャラクターが登録されていません)';
			ul.appendChild(li);
		} else {
			chars.forEach(c => {
				const li = document.createElement('li');
				const left = document.createElement('span');
				left.textContent = `${c.name} (信頼: ${c.trust})`;
				li.appendChild(left);
				const btnWrap = document.createElement('span');
				// 信頼度 + ボタン
				const plus = document.createElement('button');
				plus.textContent = '+5';
				plus.className = 'char-trust-btn';
				plus.onclick = async () => { if (typeof gameManager !== 'undefined') { gameManager.updateCharacterTrust(c.id, 5); this.updateMenuDisplay(); } };
				const minus = document.createElement('button');
				minus.textContent = '-5';
				minus.className = 'char-trust-btn';
				minus.onclick = async () => { if (typeof gameManager !== 'undefined') { gameManager.updateCharacterTrust(c.id, -5); this.updateMenuDisplay(); } };
				btnWrap.appendChild(plus);
				btnWrap.appendChild(minus);
				li.appendChild(btnWrap);
				ul.appendChild(li);
			});
		}
		effectsSection.innerHTML = '';
		const effects = status.effects || {};
		console.log('UI.updateMenuDisplay effects:', effects);
		if (Object.keys(effects).length === 0) {
			const p = document.createElement('p');
			p.textContent = '(現在、効果はありません)';
			effectsSection.appendChild(p);
		} else {
			const ul = document.createElement('ul');
			for (const key of Object.keys(effects)) {
				const li = document.createElement('li');
				const display = effects[key].displayName || key;
				li.textContent = `${display} (${effects[key].turns}ターン)`;
				ul.appendChild(li);
			}
			effectsSection.appendChild(ul);
		}
	}

	/**
	 * メニュー内にメッセージを表示する（アイテム使用などで使う）
	 * @param {string} text
	 */
	displayMenuMessage(text) {
		const menuContent = document.getElementById('menu-content');
		if (!menuContent) return;
		// Guard: do not show empty menu messages
		if (text === null || typeof text === 'undefined') return;
		const mtxt = String(text);
		if (mtxt.trim() === '') return;
		let menuMsg = document.getElementById('menu-message');
		if (!menuMsg) {
			menuMsg = document.createElement('div');
			menuMsg.id = 'menu-message';
			menuMsg.className = 'menu-message';
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
			if (this.menuOverlay && this.menuOverlay.classList.contains('hidden')) {
				if (typeof this.showFloatingMessage === 'function') {
					// showFloatingMessage already handles click waits and visibility.
					this.showFloatingMessage(text).catch(() => { });
					return;
				} else if (typeof this.displayMessage === 'function') {
					this.displayMessage(text, 'システム');
					return;
				}
			}
		} catch (e) { }

		menuMsg.textContent = text;
		menuMsg.style.display = 'block';
	}

	/**
	 * メニュー内でのクリックを待つ
	 * @returns {Promise<void>}
	 */
	waitForMenuClick() {
		return new Promise(resolve => {
			// デフォルトはメニューのコンテンツ部分でのクリックを待つ
			const menuContent = document.getElementById('menu-content');
			if (!menuContent) return resolve();

			const listener = (e) => {
				// クリックが発生したらリスナーを解除して解決
				menuContent.removeEventListener('click', listener);
				// preventDefault や stopPropagation はここでは不要
				resolve();
			};

			menuContent.addEventListener('click', listener);
		});
	}

	/**
	 * メニュー内のメッセージをクリアする
	 */
	clearMenuMessage() {
		const menuMsg = document.getElementById('menu-message');
		if (menuMsg) {
			menuMsg.textContent = '';
			menuMsg.style.display = 'none';
		}
		// restore any temporary menu overlay visibility change
		try {
			// No-op: do not restore or toggle menu overlay here. Menu visibility is
			// strictly controlled via openMenu/closeMenu and GameEventManager.isInFreeAction.
		} catch (e) { }
	}

	/**
	 * 短時間だけ画面上部に表示される非破壊的なお知らせ（トースト）
	 * @param {string} text
	 * @param {{ duration?: number }}
 options
	 */
	showTransientNotice(text, options = {}) {
		if (!text || ('' + text).trim() === '') return;
		const dur = typeof options.duration === 'number' ? options.duration : 1200;
		let el = document.getElementById('transient-notice');
		if (!el) {
			el = document.createElement('div');
			el.id = 'transient-notice';
			el.className = 'transient-notice';
			document.getElementById('game-container').appendChild(el);
			el.addEventListener('click', () => {
				el.classList.add('fadeout');
				setTimeout(() => el.remove(), 220);
			});
		}
		el.textContent = text;
		el.classList.remove('fadeout');
		// 自動で消す
		setTimeout(() => {
			if (el && el.parentNode) {
				el.classList.add('fadeout');
				setTimeout(() => { try { el.remove(); } catch (e) { } }, 220);
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
	async showFloatingMessage(text, options = {}) {
		console.log('UI.showFloatingMessage called:', text);
		const lines = ('' + text).split('\n');

		// 保持しておく既存の表示とスタイル
		const origZ = this.messageWindow.style.zIndex;
		const origDisplay = this.messageWindow.style.display;
		const prevChar = this.characterName.textContent;
		const prevMsg = this.messageText.textContent;
		const prevClick = this.clickIndicator.style.display;

		try {
			// メッセージウィンドウを最前面に出す
			this.messageWindow.style.zIndex = 9999;
			this.messageWindow.style.display = 'block';

			for (const line of lines) {
				console.log('UI.showFloatingMessage line:', line);
				this.characterName.textContent = 'システム';
				this.messageText.textContent = line;
				// クリックインジケーターを表示して、ユーザークリックで次へ進める
				this.clickIndicator.style.display = 'block';

				// ローカルのクリック待ち（this.waitForClick を使わない）
				await new Promise(resolve => {
					const listener = () => {
						try {
							// クリック音
							if (typeof soundManager !== 'undefined') soundManager.play('click');
						} catch (e) { }
						// リスナーを外して進行
						this.messageWindow.removeEventListener('click', listener);
						// クリックインジケーターは次行表示前に消す
						this.clickIndicator.style.display = 'none';
						resolve();
					};
					this.messageWindow.addEventListener('click', listener);
					// タイムアウトフォールバック: lineDelay が正の数の場合のみタイムアウトを設定する。
					// lineDelay === 0 は「クリック待ちのみ」を意味する。
					if (options && typeof options.lineDelay === 'number' && options.lineDelay > 0) {
						setTimeout(() => {
							this.messageWindow.removeEventListener('click', listener);
							try { this.clickIndicator.style.display = 'none'; } catch (e) { }
							resolve();
						}, options.lineDelay);
					}
				});
			}
		} finally {
			// ループ後: 元の表示内容を復元して、メッセージウィンドウが空白になるのを防ぐ
			try {
				this.characterName.textContent = prevChar || '';
				this.messageText.textContent = prevMsg || '';
			} catch (e) { }
			this.messageWindow.style.zIndex = origZ;
			this.messageWindow.style.display = origDisplay;
			this.clickIndicator.style.display = prevClick || 'none';
		}
	}

	/**
	 * メニューボタンと閉じるボタンのイベントリスナーを設定する
	 */
	initializeMenuListeners() {
		this.menuButton.addEventListener('click', () => this.openMenu());
		this.menuCloseButton.addEventListener('click', () => this.closeMenu());
		if (this.menuCloseFloating) this.menuCloseFloating.addEventListener('click', () => this.closeMenu());

		//折りたたみトグル
		if (this.toggleItemsButton && this.menuItemSection) {
			// Primary behavior: open dedicated item window when clicked
			this.toggleItemsButton.addEventListener('click', async () => {
				// If not in free action, show transient notice instead
				if (typeof GameEventManager === 'undefined' || !GameEventManager.isInFreeAction) {
					this.showTransientNotice('メニューは自由行動時間のみ開けます。', { duration: 1200 });
					return;
				}
				await this.openMenuWindow('item');
			});
		}
		if (this.toggleHistoryButton && this.menuHistorySection) {
			this.toggleHistoryButton.addEventListener('click', async () => {
				if (typeof GameEventManager === 'undefined' || !GameEventManager.isInFreeAction) {
					this.showTransientNotice('メニューは自由行動時間のみ開けます。', { duration: 1200 });
					return;
				}
				await this.openMenuWindow('history');
			});
		}

		// menu-window close buttons
		const winCloses = document.querySelectorAll('.menu-window .menu-window-close');
		winCloses.forEach(btn => {
			btn.addEventListener('click', (e) => {
				const win = e.target.closest('.menu-window');
				this.closeMenuWindow(win);
			});
		});

		// セーブ・ロードボタンのイベントリスナー
		if (this.saveGameButton) {
			this.saveGameButton.addEventListener('click', () => this.handleSaveGame());
		}
		if (this.loadGameButton) {
			this.loadGameButton.addEventListener('click', () => this.loadGameFileInput && this.loadGameFileInput.click());
		}
		if (this.loadGameFileInput) {
			this.loadGameFileInput.addEventListener('change', (event) => this.handleLoadGame(event, false)); // メニューからは isFromTitle=false
		}

		// Audio controls in menu (volume slider and mute button)
		const volEl = document.getElementById('sound-volume');
		const muteBtn = document.getElementById('sound-mute');
		if (volEl) {
			volEl.addEventListener('input', (e) => {
				const v = parseFloat(e.target.value);
				if (typeof soundManager !== 'undefined' && typeof soundManager.setVolume === 'function') {
					soundManager.setVolume(v);
				}
			});
		}
		if (muteBtn) {
			muteBtn.addEventListener('click', (e) => {
				if (typeof soundManager === 'undefined') return;
				soundManager.toggleMute();
				muteBtn.textContent = soundManager.muted ? 'ミュート解除' : 'ミュート';
			});
		}
	}

	/**
	 * ゲームのセーブ処理
	 */
	handleSaveGame() {
		if (typeof gameManager === 'undefined') return;
		const saveData = gameManager.getAllStatus(); // 全ステータスを取得
		const dataStr = JSON.stringify(saveData, null, 2); // 整形してJSON文字列に変換

		this.createDownloadLink(dataStr, 'game_save.json', 'application/json');
		this.displayMenuMessage('ゲームデータをセーブしました。ダウンロードリンクを確認してください。');
	}

	/**
	 * ゲームのロード処理
	 * @param {Event} event - ファイル入力のchangeイベント
	 * @param {boolean} [isFromTitle=false] - タイトル画面からの呼び出しかどうか
	 */
	handleLoadGame(eventOrIsFromTitle, isFromTitle = false) {
		// Backwards-compatible support:
		// - Called as handleLoadGame(changeEvent, boolean) from file input (menu)
		// - Called as handleLoadGame(true) from title screen (legacy call). In that
		//   case we create a temporary file input, open the picker and delegate to
		//   this function when a file is chosen.
		if (typeof eventOrIsFromTitle === 'boolean') {
			isFromTitle = eventOrIsFromTitle;
			// create temporary input
			const tempInput = document.createElement('input');
			tempInput.type = 'file';
			tempInput.accept = '.json,application/json';
			tempInput.style.display = 'none';
			document.body.appendChild(tempInput);
			const cleanup = () => { try { tempInput.remove(); } catch (e) { /* ignore */ } };
			tempInput.addEventListener('change', (ev) => {
				this.handleLoadGame(ev, isFromTitle);
				setTimeout(cleanup, 500);
			}, { once: true });
			// trigger file picker
			tempInput.click();
			return;
		}

		const event = eventOrIsFromTitle;
		const file = event && event.target && event.target.files ? event.target.files[0] : null;
		if (!file) {
			if (!isFromTitle) {
				this.displayMenuMessage('ファイルが選択されていません。');
			}
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const loadedData = JSON.parse(e.target.result);

				// ロード直後にゲームを開始または再開する共通ロジック
				const startGameAfterLoad = (loadedStatus) => {
					const playerName = (loadedStatus.characters && loadedStatus.characters.find(c => c.id === 'player'))
						? loadedStatus.characters.find(c => c.id === 'player').name
						: '主人公';

					// グローバルな gameManager/ui がなければ初期化
					if (typeof initializeGame !== 'function') {
						console.error('initializeGame is not defined');
						return;
					}
					initializeGame(playerName);
					gameManager.loadGame(loadedStatus);
					this.showTransientNotice('ゲームデータをロードしました。');
					GameEventManager.showMainActions();
				};

				if (isFromTitle) {
					startGameAfterLoad(loadedData);
				} else {
					// メニューからのロード
					gameManager.loadGame(loadedData);
					this.displayMenuMessage('ゲームデータをロードしました。');
					this.closeMenu();
					GameEventManager.showMainActions();
				}
			} catch (error) {
				console.error('Failed to load game data:', error);
				const message = 'ゲームデータのロードに失敗しました。ファイルが破損しているか、形式が正しくありません。';
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
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.textContent = `セーブデータをダウンロード (${filename})`;
		a.style.display = 'block';
		a.style.marginTop = '10px';
		a.style.color = '#87CEEB';
		a.style.textDecoration = 'underline';

		const menuSaveLoadSection = document.getElementById('menu-save-load-section');
		if (menuSaveLoadSection) {
			// 既存のダウンロードリンクがあれば削除
			const existingLink = menuSaveLoadSection.querySelector('a[download]');
			if (existingLink) {
				existingLink.remove();
			}
			menuSaveLoadSection.appendChild(a);
		}

		// オブジェクトURLは不要になったら解放する
		a.addEventListener('click', () => {
			setTimeout(() => URL.revokeObjectURL(url), 100);
		});
	}
}
