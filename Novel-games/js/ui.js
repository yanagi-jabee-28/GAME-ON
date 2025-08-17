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
        this.dateDisplay = document.getElementById('date-display');
        this.timeOfDayDisplay = document.getElementById('time-of-day-display');
        this.conditionDisplay = document.getElementById('condition-display');
        this.moneyDisplay = document.getElementById('money-display');
        this.cpDisplay = document.getElementById('cp-display');
        
        this.messageWindow = document.getElementById('message-window');
        this.characterName = document.getElementById('character-name');
        this.messageText = document.getElementById('message-text');
        this.clickIndicator = document.getElementById('click-indicator');

        this.choicesArea = document.getElementById('choices-area');
    }

    /**
     * ステータス表示を更新する
     * @param {object} status - 表示するステータス情報 (GameManagerから取得)
     */
    updateStatusDisplay(status) {
        this.dateDisplay.textContent = `${status.day}日目`;
        this.timeOfDayDisplay.textContent = CONFIG.TURNS[status.turnIndex];
        this.conditionDisplay.textContent = status.condition;
        this.moneyDisplay.textContent = `${status.money}G`;
        this.cpDisplay.textContent = status.cp;
    }

    /**
     * メッセージとキャラクター名を表示する
     * @param {string} text - 表示するメッセージ本文
     * @param {string} [characterName=''] - 表示するキャラクター名 (省略可能)
     */
    displayMessage(text, characterName = '') {
        this.characterName.textContent = characterName;
        this.messageText.textContent = text;
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
                // イベントリスナーを一度実行したら削除する
                this.messageWindow.removeEventListener('click', listener);
                // インジケーターを非表示にする
                this.clickIndicator.style.display = 'none';
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
                // 選択肢をクリックしたら、コールバック関数を実行
                if (choice.callback) {
                    choice.callback();
                }
                // 選択後は選択肢を非表示にする
                this.clearChoices();
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
}