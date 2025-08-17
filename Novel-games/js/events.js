/**
 * @file events.js
 * @description ゲーム内イベントの処理を記述するファイル
 * シナリオイベントやランダムイベントなどを関数として定義します。
 */

const GameEventManager = {
    lastCheckedDay: 1, // 日付変更時の回復メッセージ表示用

    /**
     * 汎用的な行動実行関数
     * @param {string} actionId - config.jsのEVENTSに定義されたアクションID
     */
    executeAction: async function (actionId) {
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
            await ui.waitForClick(); // ここに待機処理を追加
        }

        // 行動後のメッセージ表示
        if (eventData.afterMessage) {
            ui.displayMessage(eventData.afterMessage);
            await ui.waitForClick();
        }

        // ターンを進める
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

            // 回復処理
            gameManager.changeStats({ physical: 5, mental: 5 });
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

        ui.displayChoices(choices);
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

};
