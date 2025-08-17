/**
 * @file config.js
 * @description ゲーム全体の設定を管理するファイル
 * 将来的にキャラクター、アイテム、イベントなどのデータをここに追加していきます。
 */

// ゲームの定数を定義
const CONFIG = {
    // 1日のターン名
    TURNS: ['午前', '放課後', '夜'],

    // 曜日表示（GAME開始の基準: day 1 = 水曜日）
    WEEKDAYS: ['日', '月', '火', '水', '木', '金', '土'],
    // WEEKDAYSのインデックスで、day=1 が何曜日かを指定する（'水' => index 3）
    START_WEEKDAY_INDEX: 3,

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
        items: ['energy_drink'], // 所持アイテムにエナジードリンクを追加
        reportDebt: 0, // レポート負債（互換性用の総数）
        reports: [ // 個別レポート管理のための配列（将来拡張用）
            { id: 'test_report_1', title: 'テストレポート', progress: 0, required: 3 }
        ],
        menuLocked: false // メニュー開閉が制御されるフェーズ用フラグ
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
    'energy_drink': {
        name: 'エナジードリンク',
        price: 300, // 購入価格（仮）
        description: '一時的に体力を回復するが、後で反動が来る。',
        effect: { // アイテム効果
            changes: {
                stats: {
                    physical: 15, // 体力回復 (20 - 5 = 15)
                    mental: 0     // 精神回復 (10 - 10 = 0)
                }
            }
        }
    }
};

// イベントデータ (将来の拡張用)
const EVENTS = {
    "STUDY_ACTION": {
        message: "よし、勉強に集中しよう。",
        changes: {
            stats: { academic: 5, mental: -10 }
        },
        afterMessage: "少し疲れたが、知識は身についた。",
        nextAction: "showMainActions" // 次に実行するアクション
    },
    "WORK_ACTION": {
        message: "お金を稼ぎに行こう。",
        changes: {
            money: 500,
            stats: { mental: -20, physical: -10 }
        },
        afterMessage: "疲れた...でも、これで少しは生活が楽になるはずだ。",
        nextAction: "showMainActions"
    },
    "REPORT_ACTION": {
        message: "溜まっているレポートを片付けないと...",
        // changes はレポート進捗で動的に変わるため、ここでは定義しない
        changes: {
            stats: { // stats オブジェクトを内包
                mental: -5, // レポートによる精神的疲労
                physical: -3 // レポートによる肉体的疲労
            }
        },
        afterMessage: "", // レポート進捗によってメッセージが変わるため空
        nextAction: "showMainActions"
    },
    "REST_ACTION": {
        message: "今日はゆっくり休んで、明日に備えよう。",
        changes: {
            stats: { // stats オブジェクトを内包
                physical: 10, // 体力回復
                mental: 10    // 精神回復
            }
        },
        afterMessage: "",
        nextAction: "showMainActions"
    },
    "ATTEND_CLASS_ACTION": {
        message: "授業に集中する。学びを吸収しよう。",
        changes: {
            stats: { academic: 8, physical: -5, mental: -5 }
        },
        afterMessage: "", // 特にメッセージなし
        nextAction: "showMainActions"
    },
    "MOONLIGHT_WORK_ACTION": {
        message: "授業中に内職（レポートを進める）をする。授業の時間を使ってレポートを進めよう。",
        changes: {
            mental: -8, // 内職による精神的疲労（授業中なのでより疲れる）
            physical: -5 // 内職による肉体的疲労
        },
        afterMessage: "", // doReport に委譲するため特にメッセージなし
        nextAction: "showMainActions"
    },
    "DOZE_OFF_ACTION": {
        message: "うとうと... 居眠りをしてしまった。",
        changes: {
            stats: { physical: 5 }
        },
        afterMessage: "", // 特にメッセージなし
        nextAction: "showMainActions"
    }
};
