/**
 * @file config.js
 * @description ゲーム全体の設定を管理するファイル
 * 将来的にキャラクター、アイテム、イベントなどのデータをここに追加していきます。
 */

// ゲームの定数を定義
const CONFIG = {
    // 1日のターン名
    TURNS: ['午前', '放課後', '夜'],

    // コンディションの状態
    CONDITION_STATUS: {
        EXCELLENT: '絶好調',
        GOOD: '普通',
        BAD: '不調',
        WORST: '疲労困憊'
    },

    // 初期ステータス
    INITIAL_PLAYER_STATUS: {
        day: 1,
        turnIndex: 0, // TURNS配列のインデックス
        condition: 100,
        money: 10000,
        cp: 0,
        stats: {
            academic: 10, // 学力
            physical: 50, // 肉体
            mental: 50,   // 精神
        },
        items: [], // 所持アイテム
        reportDebt: 0, // レポート負債
    }
};

// キャラクターデータ (将来の拡張用)
const CHARACTERS = {
    // 例:
    // 'tanaka': {
    //     name: '田中 誠',
    //     color: '#87CEEB'
    // },
    // 'suzuki': {
    //     name: '鈴木 先輩',
    //     color: '#90EE90'
    // }
};

// アイテムデータ (将来の拡張用)
const ITEMS = {
    // 例:
    // 'energy_drink': {
    //     name: 'エナジードリンク',
    //     price: 300,
    //     description: '次の1ターンの行動効率を上げるが、フィジカルを少し前借りする。'
    // }
};

// イベントデータ (将来の拡張用)
const EVENTS = {
    // ここにイベントデータを定義していく
};
