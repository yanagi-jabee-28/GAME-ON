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
        // スナップショットを取り、差分を計算してメッセージを生成する
        const before = JSON.parse(JSON.stringify(this.playerStatus));
        let mutated = false;

        if (changes.stats) {
            // 内部処理では updateCondition の呼び出しを抑制する
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

        // 変更があればコンディション更新と通知、差分メッセージ表示
        if (mutated) {
            this.updateCondition();
            this._notifyListeners();

            // 差分を計算してユーザーに表示する
            const after = this.playerStatus;
            const messages = [];

            // stats の差分
            if (before.stats && after.stats) {
                const map = { academic: '学力', physical: 'フィジカル', mental: 'メンタル' };
                for (const key of Object.keys(after.stats)) {
                    const delta = after.stats[key] - (before.stats[key] || 0);
                    if (delta !== 0) {
                        const sign = delta > 0 ? '+' : '';
                        messages.push(`${map[key] || key}: ${sign}${delta}`);
                    }
                }
            }

            // money
            if (typeof after.money === 'number' && after.money !== before.money) {
                const delta = after.money - (before.money || 0);
                const sign = delta > 0 ? '+' : '';
                messages.push(`所持金: ${sign}${delta}G`);
            }

            // cp
            if (typeof after.cp === 'number' && after.cp !== before.cp) {
                const delta = after.cp - (before.cp || 0);
                const sign = delta > 0 ? '+' : '';
                messages.push(`人脈: ${sign}${delta}`);
            }

            // reportDebt
            if (typeof after.reportDebt === 'number' && after.reportDebt !== before.reportDebt) {
                const delta = after.reportDebt - (before.reportDebt || 0);
                const sign = delta > 0 ? '+' : '';
                messages.push(`レポート負債: ${sign}${delta}`);
            }

            // itemsAdd: show added items
            if (Array.isArray(changes.itemsAdd) && changes.itemsAdd.length > 0) {
                const itemNames = changes.itemsAdd.map(id => (ITEMS[id] && ITEMS[id].name) ? ITEMS[id].name : id);
                messages.push(`アイテム入手: ${itemNames.join(', ')}`);
            }

            // menuLocked
            if (typeof changes.menuLocked === 'boolean') {
                messages.push(`メニューロック: ${changes.menuLocked ? '有効' : '解除'}`);
            }

            if (messages.length > 0 && typeof ui !== 'undefined' && typeof ui.displayMessage === 'function') {
                ui.displayMessage(messages.join('\n'), 'システム');
            }
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
        // 可能なら applyChanges による一元管理へ委譲
        if (!options.suppressUpdateCondition) {
            this.applyChanges({ stats: changes });
            return;
        }

        // suppressUpdateCondition が真の場合は低レベルで直接変更する
        for (const key in changes) {
            if (key in this.playerStatus.stats) {
                this.playerStatus.stats[key] += changes[key];

                if (this.playerStatus.stats[key] < 0) this.playerStatus.stats[key] = 0;
                if ((key === 'physical' || key === 'mental') && this.playerStatus.stats[key] > 100) this.playerStatus.stats[key] = 100;
            }
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

    /**
     * レポート（個別）の追加
     * @param {object} report - { id: string, title?: string, progress: number, required: number }
     */
    addReport(report) {
        if (!report || !report.id) return;
        const r = Object.assign({ title: report.title || report.id, progress: 0, required: 1 }, report);
        this.playerStatus.reports.push(r);
        // reportDebt を互換性のために更新
        this.playerStatus.reportDebt = this.playerStatus.reports.length;
        this._notifyListeners();
    }

    /**
     * レポートの進捗を進める
     * @param {string} id
     * @param {number} amount
     */
    progressReport(id, amount = 1) {
        const idx = this.playerStatus.reports.findIndex(r => r.id === id);
        if (idx === -1) return;
        const report = this.playerStatus.reports[idx];
        report.progress += amount;
        if (report.progress >= report.required) {
            // 完了扱い: レポート配列から削除
            this.playerStatus.reports.splice(idx, 1);
        }
        // reportDebt を互換性のために更新
        this.playerStatus.reportDebt = this.playerStatus.reports.length;
        this._notifyListeners();
    }

    getReports() {
        return this.playerStatus.reports;
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
