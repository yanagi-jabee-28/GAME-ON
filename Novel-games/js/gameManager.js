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
    }

    /**
     * 現在のプレイヤーのステータスを取得する
     * @returns {object} プレイヤーのステータスオブジェクト
     */
    getStatus() {
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
        this.playerStatus.money += amount;
    }

    /**
     * 内部ステータス（学力、フィジカル、メンタルなど）を更新する
     * @param {object} changes - 更新内容。例: { academic: 5, mental: -10 }
     */
    changeStats(changes) {
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
        // 内部ステータスの変更後にコンディションを再計算
        this.updateCondition();
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
