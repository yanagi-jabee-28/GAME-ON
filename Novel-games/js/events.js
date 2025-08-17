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
            ui.displayMessage(eventData.message);
            await ui.waitForClick();
        }

        // ステータス変動
        if (eventData.changes) {
            gameManager.applyChanges(eventData.changes);
            ui.updateStatusDisplay(gameManager.getStatus());
        }

        // 行動後のメッセージ表示 (eventData.afterMessage)
        // if (eventData.afterMessage) {
        //     ui.displayMessage(eventData.afterMessage);
        //     await ui.waitForClick();
        // }

        // ターンを進める
        await ui.waitForClick(); // ここに待機処理を追加
        gameManager.nextTurn();
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
     * 日付が変わったかチェックし、回復処理とメッセージ表示を行う共通関数
     */
    checkAndApplyDailyRecovery: async function () {
        const currentStatus = gameManager.getStatus();
        if (currentStatus.turnIndex === 0 && currentStatus.day > this.lastCheckedDay) {
            ui.displayMessage('夜が明け、新しい一日が始まりました。', 'システム'); // 導入メッセージ
            await ui.waitForClick();

            // 回復処理（condition に一本化）
            gameManager.changeStats({ condition: 10 });
            ui.updateStatusDisplay(gameManager.getStatus()); // 回復後のステータスを更新

            await ui.waitForClick();
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
        const turnName = gameManager.getCurrentTurnName();

        ui.displayMessage(`今日は何をしようか... (${turnName})`);
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
                { text: '授業中に居眠りする', callback: () => this.doDozeOff() }
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
            ui.displayMessage('そのお店は現在利用できません。');
            await ui.waitForClick();
            this.showMainActions();
            return;
        }

        // 履歴に「ショップ訪問」を記録
        if (typeof gameManager !== 'undefined' && typeof gameManager.addHistory === 'function') {
            gameManager.addHistory({ type: 'shop_visit', detail: { shopId: shopId, shopLabel: shop.label } });
        }

        ui.displayMessage(`${shop.label}に行ってみよう。何を買う？`);
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
            ui.displayMessage('所持金が足りません。');
            await ui.waitForClick();
            this.showMainActions();
            return;
        }

        // お金を減らしてアイテムを所持に追加
        gameManager.applyChanges({ money: -item.price, itemsAdd: [itemId] });
        console.log(`Purchase applied: -${item.price}. New money: ${gameManager.getStatus().money}`);
        // 購入履歴を残す
        if (typeof gameManager !== 'undefined' && typeof gameManager.addHistory === 'function') {
            gameManager.addHistory({ type: 'purchase', detail: { itemId: itemId, itemName: item.name, price: item.price, shopId: shopId } });
            // 購入したので退店履歴を更新（購入あり）
            gameManager.addHistory({ type: 'shop_leave', detail: { shopId: shopId, purchased: true, itemId: itemId, price: item.price } });
        }
        ui.updateStatusDisplay(gameManager.getStatus());
        ui.displayMessage(`${item.name} を購入した。`);
        await ui.waitForClick();

        // 購入したアイテムはアイテム一覧に追加されます。
        // 使用はメニューから行ってください（自動使用は行わない）。

        // 購入後はターンを進める
        gameManager.nextTurn();
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
        console.log("doReport function called."); // デバッグ用ログ
        // config.jsからメッセージを読み込む
        const eventData = EVENTS["REPORT_ACTION"];
        if (eventData && eventData.message) {
            ui.displayMessage(eventData.message);
        } else {
            ui.displayMessage('溜まっているレポートを片付けないと...'); // フォールバック
        }
        await ui.waitForClick();

        // レポートがあるかチェックして、先頭のレポートを1進捗させる
        const reportsBefore = gameManager.getReports ? gameManager.getReports() : gameManager.getStatus().reports || [];
        console.log("reportsBefore:", reportsBefore); // デバッグ用ログ
        if (reportsBefore.length > 0) {
            const target = reportsBefore[0];
            console.log("target report:", target); // デバッグ用ログ
            ui.displayMessage(`${target.title} を進めます（${target.progress}/${target.required}）`);
            await ui.waitForClick();

            // 進捗を進める
            gameManager.progressReport(target.id, 1);
            console.log("progressReport called for:", target.id); // デバッグ用ログ

            // レポート進捗によるステータス変化を適用
            if (eventData.changes) {
                console.log("Applying changes for report:", eventData.changes); // デバッグ用ログ
                gameManager.applyChanges(eventData.changes);
                ui.updateStatusDisplay(gameManager.getStatus());
                await ui.waitForClick(); // ステータス変化メッセージ表示後の待機
            }

            // 進捗後の状態を取得
            const reportsAfter = gameManager.getReports ? gameManager.getReports() : gameManager.getStatus().reports || [];
            const still = reportsAfter.find(r => r.id === target.id);
            console.log("reportsAfter:", reportsAfter); // デバッグ用ログ
            if (!still) {
                ui.displayMessage('レポートを提出した！');
            } else {
                ui.displayMessage(`${still.title} の進捗が ${still.progress}/${still.required} になりました。`);
            }
        } else {
            ui.displayMessage('現在、進行中のレポートはありません。');
        }

        await ui.waitForClick();

        gameManager.nextTurn();
        ui.updateStatusDisplay(gameManager.getStatus());

        // 日付が変わったかチェックし、回復処理とメッセージ表示
        await this.checkAndApplyDailyRecovery();

        this.showMainActions();
    },

    // TODO: 今後、ランダムイベントなどをここに追加していく

    /**
     * ランダムイベントを処理する汎用関数
     * @param {object} eventData - randomEvents.js で定義されたイベントデータ
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
                    gameManager.nextTurn();
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
            gameManager.nextTurn();
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
                    gameManager.applyChanges(consequences.success.changes);
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
                    gameManager.applyChanges(consequences.failure.changes);
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
                gameManager.applyChanges(consequences.changes);
                // 履歴に結果を記録
                gameManager.addHistory({ type: 'random_event_result', eventId: eventId, choiceId: choiceText, result: 'normal', changes: consequences.changes });
            }
        }
    }
};
