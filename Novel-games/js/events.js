/**
 * @file events.js
 * @description ゲーム内イベントの処理を記述するファイル
 * シナリオイベントやランダムイベントなどを関数として定義します。
 */

const GameEventManager = {
	lastCheckedDay: 1, // 日付変更時の回復メッセージ表示用
	// 自由行動（選択肢表示）フラグ。メニューを開けるかどうかの判定に使う。
	isInFreeAction: false,

	/**
	 * 汎用的な行動実行関数
	 * @param {string} actionId - config.jsのEVENTSに定義されたアクションID
	 */
	executeAction: async function (actionId) {
		// 行動が始まるので自由行動フラグを下ろす
		this.isInFreeAction = false;
		const eventData = EVENTS[actionId];
		if (!eventData) {
			console.error(`Action data not found for ID: ${actionId}`);
			return;
		}

		// メッセージ表示
		if (eventData.message) {
			const speaker = eventData.noSpeaker ? undefined : (eventData.name || 'システム');
			ui.displayMessage(eventData.message, speaker);
			await ui.waitForClick();
		}

		// ステータス変動
		if (eventData.changes) {
			// applyChanges の内部表示は呼び出し側で制御して
			// 明示的にメッセージを表示・待機するようにする
			const msgs = gameManager.applyChanges(eventData.changes, { suppressDisplay: true }) || [];
			ui.updateStatusDisplay(gameManager.getStatus());
			if (msgs.length > 0) {
				ui.displayMessage(msgs.join('\n'), 'システム');
				if (typeof ui.waitForClick === 'function') await ui.waitForClick();
			}
		}

		// 行動後のメッセージ表示 (eventData.afterMessage)
		if (eventData.afterMessage) {
			const afterSpeaker = eventData.noSpeakerForAfterMessage || eventData.noSpeaker ? undefined : (eventData.name || 'システム');
			ui.displayMessage(eventData.afterMessage, afterSpeaker);
			await ui.waitForClick();
		}

		// ターンを進める
		// 次の処理へ（必要なクリック待ちは個々の表示で行っているためここでは直接進める）
		await gameManager.nextTurn();
		ui.updateStatusDisplay(gameManager.getStatus());

		// 日付が変わったかチェックし、回復処理とメッセージ表示
		await this.checkAndApplyDailyRecovery();

		// 次の行動へ
		if (eventData.nextAction === "showMainActions") {
			this.showMainActions();
		}
		// TODO: 他の nextAction の種類も考慮する
	},

	/**
	 * イベントデータを受け取り、メッセージ表示とステータス変化を同期的に実行する。
	 * この関数はターン進行を直接行わないため、呼び出し側で nextTurn を制御できます。
	 * @param {object} eventData - { message, name?, changes?, afterMessage? }
	 */
	executeEventInline: async function (eventData) {
		this.isInFreeAction = false;
		if (!eventData) return;

		if (eventData.message) {
			const speaker = eventData.noSpeaker ? undefined : (eventData.name || 'システム');
			ui.displayMessage(eventData.message, speaker);
			await ui.waitForClick();
		}

		if (eventData.changes) {
			// 旧仕様キーの正規化: connections->cp
			const normalized = { ...eventData.changes };
			if (typeof normalized.connections === 'number') {
				normalized.cp = (normalized.cp || 0) + normalized.connections;
				delete normalized.connections;
			}
			// physical/mental/technical がトップレベルに来た場合は stats へ寄せる
			['physical', 'mental', 'technical', 'academic'].forEach(k => {
				if (typeof normalized[k] === 'number') {
					normalized.stats = Object.assign({}, normalized.stats, { [k]: (normalized.stats && normalized.stats[k] ? normalized.stats[k] : 0) + normalized[k] });
					delete normalized[k];
				}
			});
			// legacy: condition がトップレベルにある場合は stats.condition に寄せる（互換用）
			if (typeof normalized.condition === 'number') {
				normalized.stats = Object.assign({}, normalized.stats, { condition: (normalized.stats && normalized.stats.condition ? normalized.stats.condition : 0) + normalized.condition });
				delete normalized.condition;
			}
			// academic がトップレベルに来た場合も stats へ寄せる
			if (typeof normalized.academic === 'number') {
				normalized.stats = Object.assign({}, normalized.stats, { academic: (normalized.stats && normalized.stats.academic ? normalized.stats.academic : 0) + normalized.academic });
				delete normalized.academic;
			}
			// applyChanges 側で表示制御が可能なのでここでは通常通り適用する
			// suppress display in applyChanges and show messages here so the
			// caller controls the click-wait timing and the player sees the
			// money/stat deltas clearly.
			const msgs = gameManager.applyChanges(normalized, { suppressDisplay: true }) || [];
			ui.updateStatusDisplay(gameManager.getStatus());
			if (msgs.length > 0) {
				ui.displayMessage(msgs.join('\n'), 'システム');
				if (typeof ui.waitForClick === 'function') await ui.waitForClick();
			}
		}

		if (eventData.afterMessage) {
			const afterSpeaker = eventData.noSpeakerForAfterMessage || eventData.noSpeaker ? undefined : (eventData.name || 'システム');
			ui.displayMessage(eventData.afterMessage, afterSpeaker);
			await ui.waitForClick();
		}
	},

	/**
	 * 汎用的に changes を受け取りイベントとして実行するラッパー。
	 * gameManager など外部からはこの関数を通してイベント表示と changes を適用する。
	 * @param {{ name?:string, message?:string, changes?:object, afterMessage?:string }} eventData
	 */
	performChangesEvent: async function (eventData) {
		// イベントとしての実行は executeEventInline に委譲
		try {
			await this.executeEventInline(eventData);
		} catch (e) {
			console.warn('performChangesEvent failed', e);
			// フォールバック: 直接 applyChanges を呼ぶ
			if (eventData && eventData.changes && typeof gameManager !== 'undefined') {
				gameManager.applyChanges(eventData.changes);
				if (typeof ui !== 'undefined' && typeof ui.waitForClick === 'function') await ui.waitForClick();
			}
		}
	},

	/**
	 * 日付が変わったかチェックし、回復処理とメッセージ表示を行う共通関数
	 */
	checkAndApplyDailyRecovery: async function () {
		const currentStatus = gameManager.getStatus();
		if (currentStatus.turnIndex === 0 && currentStatus.day > this.lastCheckedDay) {
			ui.displayMessage('夜が明け、新しい一日が始まりました。', 'システム'); // 導入メッセージ
			await ui.waitForClick();

			// 回復処理（体力と精神力を少し回復）
			// applyChanges を使って差分メッセージを取得し、他のステータス変化
			// と同じフォーマットで表示する。
			const recovery = { stats: { physical: 4, mental: 3 } };
			const msgs = (typeof gameManager.applyChanges === 'function') ? gameManager.applyChanges(recovery, { suppressDisplay: true }) : [];
			ui.updateStatusDisplay(gameManager.getStatus()); // 回復後のステータスを更新
			if (msgs && msgs.length > 0) {
				ui.displayMessage(msgs.join('\n'), 'システム');
				if (typeof ui.waitForClick === 'function') await ui.waitForClick();
			}
			this.lastCheckedDay = currentStatus.day; // 日付を更新
		}
	},

	/**
	 * ゲーム開始時のイベント
	 */
	startGame: async function () {
		ui.displayMessage('目が覚めると、見慣れた寮の天井が目に入った。', '主人公');
		await ui.waitForClick();

		// TODO: ここから初期設定診断のイベントを開始する

		ui.displayMessage('（これからどうしようか...）');
		// 最初の行動選択へ
		this.showMainActions();
	},

	/**
	 * そのターンで実行可能な行動の選択肢を表示する
	 */
	showMainActions: function () {
		const status = gameManager.getStatus();
		// ゲームオーバー時は通常の選択肢を表示せず、ゲームオーバー処理へ
		if (status && status.gameOver) {
			if (typeof this.triggerGameOver === 'function') this.triggerGameOver();
			return;
		}
		const turnName = gameManager.getCurrentTurnName();

		ui.displayMessage(`今日は何をしようか... (${turnName})`, '主人公');
		// 自由行動選択肢を表示している間はメニューを開ける
		this.isInFreeAction = true;

		// ここでターンの種類や状況に応じて選択肢を動的に変更する
		// 午前かつ平日（月〜金）の場合、授業ターンとして専用の選択肢を出す
		const weekday = typeof gameManager.getWeekdayName === 'function' ? gameManager.getWeekdayName() : '';
		const isWeekday = ['月', '火', '水', '木', '金'].includes(weekday);

		if (turnName === '午前' && isWeekday) {
			const choices = [
				{ text: '授業に集中する', callback: () => this.doAttendClass() },
				{ text: '授業中に内職する', callback: () => this.doMoonlightWork() },
				{ text: '授業中に居眠りする', callback: () => this.doDozeOff() },
				{ text: '授業中に隠れて遊ぶ', callback: () => this.doHidePlay() }
			];

			ui.displayChoices(choices);
			return;
		}

		const choices = [
			{
				text: '勉強する',
				callback: () => this.doStudy()
			},
			{
				text: 'レポートを進める',
				callback: () => this.doReport()
			},
			{
				text: 'バイトに行く',
				callback: () => this.doWork()
			},
			{
				text: '休む',
				callback: () => this.doRest()
			}
		];

		// 追加: 土日午前でもスーパーに行けるようにする
		if (turnName === '午前' && ['土', '日'].includes(weekday)) {
			const shop = (CONFIG && CONFIG.SHOPS && CONFIG.SHOPS['supermarket']) ? CONFIG.SHOPS['supermarket'] : null;
			const shopLabel = shop && shop.label ? shop.label : 'スーパー';
			choices.push({ text: `${shopLabel}に行く`, callback: () => this.openShop('supermarket') });
		}

		// 放課後（TURNS の '放課後'）なら購買/スーパーに行く選択肢を追加
		if (turnName === '放課後') {
			// 土日はスーパーに行くようにする
			const shopId = (['土', '日'].includes(weekday)) ? 'supermarket' : 'school';
			const shopLabel = (CONFIG && CONFIG.SHOPS && CONFIG.SHOPS[shopId] && CONFIG.SHOPS[shopId].label) ? CONFIG.SHOPS[shopId].label : '購買';
			choices.push({ text: `${shopLabel}に行く`, callback: () => this.openShop(shopId) });
		}

		// 夜ならコンビニへ行く選択肢を追加
		if (turnName === '夜') {
			choices.push({ text: 'コンビニに行く', callback: () => this.goToConveni() });
		}

		ui.displayChoices(choices);
	},

	/**
	 * 学校の購買に行く（放課後の行動）
	 */
	goToSchoolShop: async function () {
		return await this.openShop('school');
	},

	/**
	 * 汎用ショップオープン関数
	 * @param {string} shopId
	 */
	openShop: async function (shopId) {
		this.isInFreeAction = false;
		const shop = (CONFIG && CONFIG.SHOPS && CONFIG.SHOPS[shopId]) ? CONFIG.SHOPS[shopId] : null;
		if (!shop) {
			ui.displayMessage('そのお店は現在利用できません。', 'システム');
			await ui.waitForClick();
			this.showMainActions();
			return;
		}

		// 履歴に「ショップ訪問」を記録
		if (typeof gameManager !== 'undefined' && typeof gameManager.addHistory === 'function') {
			gameManager.addHistory({ type: 'shop_visit', detail: { shopId: shopId, shopLabel: shop.label } });
		}

		ui.displayMessage(`${shop.label}に行ってみよう。何を買う？`, '主人公');
		await ui.waitForClick();

		const items = shop.items || [];
		const unit = (typeof CONFIG !== 'undefined' && CONFIG.LABELS && CONFIG.LABELS.currencyUnit) ? CONFIG.LABELS.currencyUnit : '円';
		const choices = items.map(id => ({
			text: `${ITEMS[id].name} - ${ITEMS[id].price}${unit}`,
			callback: async () => {
				await this.attemptPurchase(id, shopId);
			}
		}));
		choices.push({
			text: '買わない', callback: async () => {
				// 履歴に「買わずに退店」を記録
				if (typeof gameManager !== 'undefined' && typeof gameManager.addHistory === 'function') {
					gameManager.addHistory({ type: 'shop_leave', detail: { shopId: shopId, purchased: false } });
				}
				this.showMainActions();
			}
		});

		ui.displayChoices(choices);
	},

	/**
	 * コンビニに行く（夜の行動）
	 */
	goToConveni: async function () {
		return await this.openShop('conveni');
	},

	/**
	 * 購入処理の共通化
	 * @param {string} itemId
	 */
	attemptPurchase: async function (itemId, shopId) {
		const item = ITEMS[itemId];
		if (!item) return;

		const status = gameManager.getStatus();
		console.log(`Attempting purchase: ${itemId} (${item.name}) price=${item.price}, playerMoney=${status.money}`);
		if (status.money < item.price) {
			ui.displayMessage('所持金が足りません。', 'システム');
			await ui.waitForClick();
			this.showMainActions();
			return;
		}

		// お金を減らしてアイテムを所持に追加し、差分メッセージを受け取る
		const msgs = gameManager.applyChanges({ money: -item.price, itemsAdd: [itemId] });
		console.log(`Purchase applied: -${item.price}. New money: ${gameManager.getStatus().money}`);

		// 購入履歴を残す
		if (typeof gameManager !== 'undefined' && typeof gameManager.addHistory === 'function') {
			gameManager.addHistory({ type: 'purchase', detail: { itemId: itemId, itemName: item.name, price: item.price, shopId: shopId } });
			// 購入したので退店履歴を更新（購入あり）
			gameManager.addHistory({ type: 'shop_leave', detail: { shopId: shopId, purchased: true, itemId: itemId, price: item.price } });
		}

		// 差分メッセージがあれば表示
		if (msgs.length > 0) {
			ui.displayMessage(msgs.join('\n'), 'システム');
			await ui.waitForClick();
		}

		// 購入後はターンを進める
		await gameManager.nextTurn();
		ui.updateStatusDisplay(gameManager.getStatus());
		await this.checkAndApplyDailyRecovery();
		this.showMainActions();
	},

	// --- 授業ターン用の行動 ---
	doAttendClass: async function () {
		await this.executeAction("ATTEND_CLASS_ACTION");
	},

	doMoonlightWork: async function () {
		ui.displayMessage('授業中に内職（レポートを進める）をする。授業の時間を使ってレポートを進めよう。');
		await ui.waitForClick();

		// 内職は「レポートを進める」と同等の処理にする
		await this.doReport();
	},

	doDozeOff: async function () {
		await this.executeAction("DOZE_OFF_ACTION");
	},

	doHidePlay: async function () {
		await this.executeAction("HIDE_PLAY_ACTION");
	},

	// --- 以下、各行動の処理 --- //

	/**
	 * 「勉強する」を選択したときの処理
	 */
	doStudy: async function () {
		await this.executeAction("STUDY_ACTION");
	},

	/**
	 * 「バイトに行く」を選択したときの処理
	 */
	doWork: async function () {
		await this.executeAction("WORK_ACTION");
	},

	/**
	 * 「休む」を選択したときの処理
	 */
	doRest: async function () {
		await this.executeAction("REST_ACTION");
	},

	/**
	 * 「レポートを進める」を選択したときの処理
	 */
	doReport: async function () {
		console.log('[doReport] enter');
		this.isInFreeAction = false;
		const reports = gameManager.getReports ? gameManager.getReports() : gameManager.getStatus().reports || [];
		console.log('[doReport] reports:', reports);

		if (reports.length === 0) {
			ui.displayMessage('現在、進行中のレポートはありません。');
			await ui.waitForClick();
			this.showMainActions(); // やることがないのでメインアクションに戻る
			return;
		}

		const eventData = EVENTS["REPORT_ACTION"];
		console.log('[doReport] eventData exists:', !!eventData, 'message:', eventData && eventData.message);
		// まずイベント本文を表示してクリック待ち
		if (eventData && eventData.message) {
			console.log('[doReport] show intro message');
			ui.displayMessage(eventData.message);
		} else {
			console.log('[doReport] show default intro message');
			ui.displayMessage('溜まっているレポートを片付けないと...');
		}
		await ui.waitForClick();
		console.log('[doReport] after intro click');

		// クリック後、選択肢の上に残る案内を表示して選択肢を出す（ここでは await しない）
		const prompt = 'どのレポートを進める？';
		try {
			console.log('[doReport] display prompt');
			ui.displayMessage(prompt, 'システム');
		} catch (e) {
			console.error('[doReport] display prompt error', e);
		}

		// 選択肢イベントとして、どのレポートを進めるかプレイヤーに選ばせる
		console.log('[doReport] build choices:', reports.length);
		const choices = reports.map(r => ({
			text: `${r.title} （${r.progress}/${r.required}）`,
			callback: async () => {
				console.log('[doReport.choice] selected:', r.id, r.title);
				this.isInFreeAction = false;
				ui.displayMessage(`${r.title} を進めます（${r.progress}/${r.required}）`);
				if (typeof ui.waitForClick === 'function') await ui.waitForClick();
				// 進行処理
				console.log('[doReport.choice] progressReport start');
				const progressResult = gameManager.progressReport(r.id, 1);
				console.log('[doReport.choice] progressReport result:', progressResult);
				// progressResult: { message, changeMsgs }
				if (progressResult && progressResult.message) {
					ui.displayMessage(progressResult.message, 'システム');
					if (typeof ui.waitForClick === 'function') await ui.waitForClick();
				}
				// レポート進捗によるステータス変化（report.changeMsgs）とイベント側の changes をまとめて表示
				const combinedMsgs = [];
				if (progressResult && Array.isArray(progressResult.changeMsgs) && progressResult.changeMsgs.length > 0) {
					combinedMsgs.push(...progressResult.changeMsgs);
				}
				if (eventData && eventData.changes) {
					console.log('[doReport.choice] apply changes:', eventData.changes);
					const msgs = gameManager.applyChanges(eventData.changes, { suppressDisplay: true }) || [];
					ui.updateStatusDisplay(gameManager.getStatus());
					if (msgs.length > 0) combinedMsgs.push(...msgs);
				}
				if (combinedMsgs.length > 0) {
					ui.displayMessage(combinedMsgs.join('\n'), 'システム');
					if (typeof ui.waitForClick === 'function') await ui.waitForClick();
				}
				// ターンを進める
				console.log('[doReport.choice] nextTurn');
				await gameManager.nextTurn();
				ui.updateStatusDisplay(gameManager.getStatus());
				await this.checkAndApplyDailyRecovery();
				this.showMainActions();
			}
		}));
		choices.push({ text: 'やめる', callback: () => { console.log('[doReport.choice] cancel'); this.showMainActions(); } });
		ui.displayChoices(choices);
		console.log('[doReport] choices displayed');
		// 念のため、選択肢描画直後にも案内を表示しておく（別処理で消えてしまうのを防ぐ）
		try {
			console.log('[doReport] re-display prompt');
			ui.displayMessage('どのレポートを進める？', 'システム');
		} catch (e) {
			console.error('[doReport] re-display prompt error', e);
		}
	},

	// TODO: 今後、ランダムイベントなどをここに追加していく

	/**
	 * ランダムイベントを処理する汎用関数
	 * @param {object} eventData - eventsData.js の RANDOM_EVENTS で定義されたイベントデータ
	 */
	handleRandomEvent: async function (eventData) {
		this.isInFreeAction = false; // イベント中は自由行動を制限

		// イベントメッセージの表示
		if (eventData.message) {
			ui.displayMessage(eventData.message, eventData.name); // イベント名をキャラクター名として表示
			await ui.waitForClick();
		}

		// 選択肢の表示
		if (eventData.choices && eventData.choices.length > 0) {
			const choices = eventData.choices.map(choice => ({
				text: choice.text,
				callback: async () => {
					// 選択肢の結果を処理
					await this.processRandomEventChoice(eventData.id, choice.text, choice.consequences); // eventData.id と choice.text を追加
					// 選択履歴を記録
					gameManager.recordChoice(choice.text); // 拡張された addHistory を利用
					// ターンを進める
					await gameManager.nextTurn();
					ui.updateStatusDisplay(gameManager.getStatus());
					await this.checkAndApplyDailyRecovery();
					this.showMainActions(); // メインアクションに戻る
				}
			}));
			ui.displayChoices(choices);
		} else {
			// 選択肢がない場合（直接結果が適用されるイベント）
			// TODO: 直接結果を適用するロジックをここに追加する
			// 現時点ではランダムイベントは選択肢を持つ前提で進める
			console.warn(`Random event ${eventData.id} has no choices. Direct consequence handling not yet implemented.`);
			// ターンを進める
			await gameManager.nextTurn();
			ui.updateStatusDisplay(gameManager.getStatus());
			await this.checkAndApplyDailyRecovery();
			this.showMainActions(); // メインアクションに戻る
		}
	},

	/**
	 * ランダムイベントの選択肢の結果を処理する
	 * @param {string} eventId - イベントのID
	 * @param {string} choiceText - 選択された選択肢のテキスト
	 * @param {object} consequences - 選択肢の結果データ
	 */
	processRandomEventChoice: async function (eventId, choiceText, consequences) { // eventId と choiceText を引数に追加
		if (consequences.probability) {
			// 確率分岐がある場合
			const rand = Math.random();
			if (rand < consequences.probability) {
				// 成功
				if (consequences.success.message) {
					ui.displayMessage(consequences.success.message, 'システム');
					await ui.waitForClick();
				}
				if (consequences.success.changes) {
					const msgs = gameManager.applyChanges(consequences.success.changes);
					if (msgs.length > 0) {
						ui.displayMessage(msgs.join('\n'), 'システム');
						await ui.waitForClick();
					}
					// 履歴に結果を記録
					gameManager.addHistory({ type: 'random_event_result', eventId: eventId, choiceId: choiceText, result: 'success', changes: consequences.success.changes });
				}
			} else {
				// 失敗
				if (consequences.failure.message) {
					ui.displayMessage(consequences.failure.message, 'システム');
					await ui.waitForClick();
				}
				if (consequences.failure.changes) {
					const msgs = gameManager.applyChanges(consequences.failure.changes);
					if (msgs.length > 0) {
						ui.displayMessage(msgs.join('\n'), 'システム');
						await ui.waitForClick();
					}
					// 履歴に結果を記録
					gameManager.addHistory({ type: 'random_event_result', eventId: eventId, choiceId: choiceText, result: 'failure', changes: consequences.failure.changes });
				}
			}
		} else {
			// 確率分岐がない場合
			if (consequences.message) {
				ui.displayMessage(consequences.message, 'システム');
				await ui.waitForClick();
			}
			if (consequences.changes) {
				const msgs = gameManager.applyChanges(consequences.changes);
				if (msgs.length > 0) {
					ui.displayMessage(msgs.join('\n'), 'システム');
					await ui.waitForClick();
				}
				// 履歴に結果を記録
				gameManager.addHistory({ type: 'random_event_result', eventId: eventId, choiceId: choiceText, result: 'normal', changes: consequences.changes });
			}
		}
	}

	,

	/**
	 * ゲームオーバー処理を統一して扱うユーティリティ
	 * 表示: GAME_OVER_EVENT の message, afterMessage を表示し、
	 * 選択肢でリスタート or タイトルへ戻るを選ばせる
	 */
	triggerGameOver: async function (customMessage) {
		// フラグを立てる
		if (typeof gameManager !== 'undefined') gameManager.playerStatus.gameOver = true;

		const eventData = Object.assign({}, EVENTS['GAME_OVER_EVENT']);
		if (customMessage) eventData.message = customMessage;

		// メッセージ表示
		if (eventData.message) {
			ui.displayMessage(eventData.message, 'システム');
			await ui.waitForClick();
		}
		if (eventData.afterMessage) {
			ui.displayMessage(eventData.afterMessage, 'システム');
			await ui.waitForClick();
		}

		// リスタート / タイトルへ戻る 選択肢
		const choices = [
			{
				text: 'リスタート', callback: () => {
					// 単純にページをリロードして初期化（簡易実装）
					location.reload();
				}
			},
			{
				text: 'タイトルへ戻る', callback: () => {
					// トップページへ移動。index.html がトップならばそれをロード
					window.location.href = '../index.html';
				}
			}
		];

		ui.displayChoices(choices);
	}
};
