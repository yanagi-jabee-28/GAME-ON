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

        // メニュー関連の要素
        this.menuButton = document.getElementById('menu-button');
        this.menuCloseButton = document.getElementById('menu-close-button');
        this.menuOverlay = document.getElementById('menu-overlay');
        this.menuAcademic = document.getElementById('menu-academic');
        this.menuPhysical = document.getElementById('menu-physical');
        this.menuMental = document.getElementById('menu-mental');
        this.menuReportDebt = document.getElementById('menu-report-debt');
        this.menuItemList = document.getElementById('menu-item-list');
        this.menuCloseFloating = document.getElementById('menu-close-floating');
        // GameManager のステータス変更を購読して自動的に表示を更新
        if (typeof gameManager !== 'undefined' && typeof gameManager.subscribe === 'function') {
            gameManager.subscribe(status => this.updateStatusDisplay(status));
        }
    }

    /**
     * ステータス表示を更新する
     * @param {object} status - 表示するステータス情報 (GameManagerから取得)
     */
    updateStatusDisplay(status) {
        // 日付表示に曜日を付与
        const weekday = typeof gameManager.getWeekdayName === 'function' ? gameManager.getWeekdayName() : '';
        this.dateDisplay.textContent = `${status.day}日目 (${weekday}曜日)`;
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
                // クリック音を鳴らす（存在すれば）
                if (typeof soundManager !== 'undefined') soundManager.play('click');
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

    // --- メニュー関連のメソッド ---

    /**
     * メニューを開く
     */
    openMenu() {
        const status = gameManager.getStatus();
        if (status.menuLocked) return; // メニューがロックされているフェーズでは開けない
        this.menuOverlay.classList.remove('hidden');
        if (this.menuCloseFloating) this.menuCloseFloating.setAttribute('aria-visible', 'true');
        this.updateMenuDisplay(); // メニューを開く際に最新の情報を表示
    }

    /**
     * メニューを閉じる
     */
    closeMenu() {
        const status = gameManager.getStatus();
        if (status.menuLocked) return; // ロック中は閉じることもできない
        this.menuOverlay.classList.add('hidden');
        if (this.menuCloseFloating) this.menuCloseFloating.setAttribute('aria-visible', 'false');
    }

    /**
     * メニューの表示内容を更新する
     */
    updateMenuDisplay() {
        const status = gameManager.getAllStatus(); // GameManagerから全ステータスを取得

        // ステータスセクションの更新
        this.menuAcademic.textContent = status.stats.academic;
        this.menuPhysical.textContent = status.stats.physical;
        this.menuMental.textContent = status.stats.mental;
        this.menuReportDebt.textContent = status.reportDebt;

        // アイテムリストの更新
        this.menuItemList.innerHTML = ''; // 一度クリア
        if (status.items.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'アイテムはありません。';
            this.menuItemList.appendChild(li);
        } else {
            status.items.forEach(itemId => {
                const item = ITEMS[itemId]; // config.jsからアイテム情報を取得
                if (item) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${item.name} - ${item.description}</span>`;
                    // TODO: アイテム使用ボタンの追加（将来的な拡張）
                    this.menuItemList.appendChild(li);
                }
            });
        }
    }

    /**
     * メニューボタンと閉じるボタンのイベントリスナーを設定する
     */
    initializeMenuListeners() {
        this.menuButton.addEventListener('click', () => this.openMenu());
        this.menuCloseButton.addEventListener('click', () => this.closeMenu());
        if (this.menuCloseFloating) this.menuCloseFloating.addEventListener('click', () => this.closeMenu());
    }
}