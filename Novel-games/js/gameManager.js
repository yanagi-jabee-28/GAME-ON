/**
 * @file gameManager.js
 * @description ゲームの状態を管理するファイル
 * プレイヤーのステータス、時間、フラグなどを一元管理します。
 */

class GameManager {
    /**
     * GameManagerのコンストラクタ
     * @param {object} initialStatus - プレイヤーの初期ステータス
     */
    constructor(initialStatus) {
        // config.jsから受け取った初期ステータスをディープコピーして設定
        this.playerStatus = JSON.parse(JSON.stringify(initialStatus));
        // 変更リスナー (UIやイベントが購読可能)
        this._listeners = [];
    }

    /**
     * 汎用ステータス変更メソッド。
     * changes のフォーマット例:
     * {
     *   stats: { academic: 5, physical: -3 },
     *   money: 200,
     *   cp: 1,
     *   reportDebt: 1,
     *   itemsAdd: ['energy_drink']
     * }
     * @param {object} changes
     */
    applyChanges(changes = {}) {
        let mutated = false;

        if (changes.stats) {
            this.changeStats(changes.stats, { suppressUpdateCondition: true });
            mutated = true;
        }

        if (typeof changes.money === 'number') {
            this.playerStatus.money += changes.money;
            mutated = true;
        }

        if (typeof changes.cp === 'number') {
            this.playerStatus.cp += changes.cp;
            mutated = true;
        }

        if (typeof changes.reportDebt === 'number') {
            this.playerStatus.reportDebt += changes.reportDebt;
            mutated = true;
        }

        if (Array.isArray(changes.itemsAdd)) {
            changes.itemsAdd.forEach(itemId => this.playerStatus.items.push(itemId));
            mutated = true;
        }

        if (typeof changes.menuLocked === 'boolean') {
            this.playerStatus.menuLocked = changes.menuLocked;
            mutated = true;
        }

        // changeStats の中で updateCondition を抑止している場合は最後に一回だけ実行
        if (mutated) {
            this.updateCondition();
            this._notifyListeners();
        }
    }

    /**
     * 変更リスナーを登録する
     * @param {function} listener - (newStatus) => void
     */
    subscribe(listener) {
        if (typeof listener === 'function') this._listeners.push(listener);
    }

    _notifyListeners() {
        this._listeners.forEach(fn => {
            try { fn(this.getStatus()); } catch (e) { console.error('Listener error', e); }
        });
    }

    /**
     * 指定された日数から曜日名を返す
     * @returns {string} 曜日名（例: '水'）
     */
    getWeekdayName() {
        // dayは1始まり。START_WEEKDAY_INDEXはWEEKDAYS配列のインデックスでday=1が何曜日か
        const startIndex = CONFIG.START_WEEKDAY_INDEX || 0;
        const weekdayIndex = (startIndex + (this.playerStatus.day - 1)) % CONFIG.WEEKDAYS.length;
        return CONFIG.WEEKDAYS[weekdayIndex];
    }

    /**
     * 現在のプレイヤーのステータスを取得する
     * @returns {object} プレイヤーのステータスオブジェクト
     */
    getStatus() {
        return this.playerStatus;
    }

    /**
     * プレイヤーの全ステータスを返す
     * @returns {object} プレイヤーの全ステータスオブジェクト
     */
    getAllStatus() {
        return this.playerStatus;
    }

    /**
     * 指定された値でステータスを更新する
     * @param {string} key - 更新するステータスのキー (例: 'money', 'condition')
     * @param {any} value - 新しい値
     */
    updateStatus(key, value) {
        if (key in this.playerStatus) {
            this.playerStatus[key] = value;
            console.log(`Status updated: ${key} = ${value}`);
        } else {
            console.error(`Error: Invalid status key '${key}'`);
        }
    }

    /**
     * プレイヤーの所持金を増減させる
     * @param {number} amount - 増減させる金額
     */
    addMoney(amount) {
        this.applyChanges({ money: amount });
    }

    /**
     * 内部ステータス（学力、フィジカル、メンタルなど）を更新する
     * @param {object} changes - 更新内容。例: { academic: 5, mental: -10 }
     */
    /**
     * ステータスを変更する補助。通常は applyChanges を使う想定だが
     * 個別に呼びたい場合はこのメソッドを使う。
     * @param {object} changes
     * @param {object} options
     */
    changeStats(changes, options = {}) {
        for (const key in changes) {
            if (key in this.playerStatus.stats) {
                this.playerStatus.stats[key] += changes[key];

                // ステータスが0未満にならないように制御
                if (this.playerStatus.stats[key] < 0) {
                    this.playerStatus.stats[key] = 0;
                }

                // physicalとmentalは100を超えないように制御
                if ((key === 'physical' || key === 'mental') && this.playerStatus.stats[key] > 100) {
                    this.playerStatus.stats[key] = 100;
                }
            }
        }

        if (!options.suppressUpdateCondition) {
            this.updateCondition();
            this._notifyListeners();
        }
    }

    /**
     * ターンを次に進める
     */
    nextTurn() {
        // ターンインデックスを進める
        this.playerStatus.turnIndex++;

        // 夜ターンが終わったら、次の日に進む
        if (this.playerStatus.turnIndex >= CONFIG.TURNS.length) {
            this.playerStatus.turnIndex = 0; // 午前から
            this.playerStatus.day++;
        }
        console.log(`Turn advanced to: Day ${this.playerStatus.day}, ${this.getCurrentTurnName()}`);
    }

    /**
     * 現在のターン名を取得する
     * @returns {string} 現在のターン名 (例: '午前')
     */
    getCurrentTurnName() {
        return CONFIG.TURNS[this.playerStatus.turnIndex];
    }

    /**
     * アイテムを追加する
     * @param {string} itemId - 追加するアイテムのID
     */
    addItem(itemId) {
        this.playerStatus.items.push(itemId);
        console.log(`Item added: ${itemId}`);
    }

    // --- 今後の拡張で追加する関数群 ---

    /**
     * コンディションを計算・更新する
     * (フィジカルとメンタルの状態から総合的なコンディションを算出するロジック)
     */
    updateCondition() {
        const { physical, mental } = this.playerStatus.stats;
        // フィジカルとメンタルの平均値をコンディションとする
        this.playerStatus.condition = Math.round((physical + mental) / 2);
    }
}
