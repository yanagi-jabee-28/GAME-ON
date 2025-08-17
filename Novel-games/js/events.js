/**
 * @file events.js
 * @description ゲーム内イベントの処理を記述するファイル
 * シナリオイベントやランダムイベントなどを関数として定義します。
 */

const GameEventManager = {

    /**
     * ゲーム開始時のイベント
     */
    startGame: async function() {
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
    showMainActions: function() {
        const status = gameManager.getStatus();
        const turnName = gameManager.getCurrentTurnName();

        ui.displayMessage(`今日は何をしようか... (${turnName})`);

        // ここでターンの種類や状況に応じて選択肢を動的に変更する
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

    // --- 以下、各行動の処理 --- //

    /**
     * 「勉強する」を選択したときの処理
     */
    doStudy: async function() {
        ui.displayMessage('よし、勉強に集中しよう。');
        
        // ■■■ ステータス変動処理 ■■■
        gameManager.changeStats({ academic: 5, mental: -10 });
        ui.updateStatusDisplay(gameManager.getStatus());
        // ■■■■■■■■■■■■■■■■■■

        await ui.waitForClick();

        ui.displayMessage('少し疲れたが、知識は身についた。');
        await ui.waitForClick();

        // 処理が終わったら次のターンへ
        gameManager.nextTurn();
        ui.updateStatusDisplay(gameManager.getStatus());
        this.showMainActions();
    },

    /**
     * 「レポートを進める」を選択したときの処理
     */
    doReport: async function() {
        ui.displayMessage('溜まっているレポートを片付けないと...');
        await ui.waitForClick();
        // TODO: レポート進捗管理、コンディション低下などの処理を実装

        ui.displayMessage('一歩ずつでも進めることが大事だ。');
        await ui.waitForClick();

        gameManager.nextTurn();
        ui.updateStatusDisplay(gameManager.getStatus());
        this.showMainActions();
    },

    /**
     * 「バイトに行く」を選択したときの処理
     */
    doWork: async function() {
        ui.displayMessage('お金を稼ぎに行こう。');
        await ui.waitForClick();
        // TODO: 所持金アップ、コンディション大幅低下などの処理を実装

        ui.displayMessage('疲れた...でも、これで少しは生活が楽になるはずだ。');
        await ui.waitForClick();

        gameManager.nextTurn();
        ui.updateStatusDisplay(gameManager.getStatus());
        this.showMainActions();
    },

    /**
     * 「休む」を選択したときの処理
     */
    doRest: async function() {
        ui.displayMessage('今日はゆっくり休んで、明日に備えよう。');
        await ui.waitForClick();
        // TODO: コンディション回復の処理を実装

        ui.displayMessage('体も心も、少し軽くなった気がする。');
        await ui.waitForClick();

        gameManager.nextTurn();
        ui.updateStatusDisplay(gameManager.getStatus());
        this.showMainActions();
    }

    // TODO: 今後、ランダムイベントなどをここに追加していく

};
