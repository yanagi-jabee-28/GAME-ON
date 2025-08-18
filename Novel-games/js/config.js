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

	// ステータス定義。将来的にステータス名や最大/最小値が増えるときはここを編集する
	STAT_DEFS: {
		academic: { label: '学力', min: 0, max: 100, default: 10 },
		condition: { label: 'コンディション', min: 0, max: 100, default: 100 }
	},

	// 期末試験の設定: 何日目に試験があるかと合格基準値
	EXAM: {
		day: 8,
		passThreshold: 60
	},

	// 試験報酬（合格時に付与するデフォルト報酬）
	// cp はデフォルトで 0 にしておく（意図しない人脈増加を防止）
	EXAM_REWARDS: {
		// 試験は目的そのものなので金銭報酬は一旦0にしておく
		pass: { money: 0, cp: 0 },
		fail: { money: 0, cp: 0 }
	},

	// EXAM の拡張設定: repeatWeekly を true にすると指定曜日ごとに試験を実施
	// weekday は '日','月',... のいずれか。デフォルトは '水'（START_WEEKDAY_INDEX に合わせる）
	EXAM_EXT: {
		repeatWeekly: true,
		weekday: '水'
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
			// physical/mental を廃止し、condition に一本化
			condition: 100
		},
		items: ['energy_drink'], // 所持アイテムにエナジードリンクを追加
		history: [], // 行動履歴（選択やアイテム使用などを記録する配列）
		reportDebt: 0, // レポート負債（互換性用の総数）
		reports: [ // 個別レポート管理のための配列（将来拡張用）
			{ id: 'test_report_1', title: 'テストレポート', progress: 0, required: 3 }
		],
		menuLocked: false // メニュー開閉が制御されるフェーズ用フラグ
	}
};

// 表示用ラベルをまとめて定義しておく（将来変更が簡単になる）
CONFIG.LABELS = {
	date: '日付',
	timeOfDay: '時間',
	money: '所持金',
	currencyUnit: '円',
	academic: '学力',
	condition: 'コンディション',
	physical: 'フィジカル',
	mental: 'メンタル',
	cp: '人脈',
	reportDebt: 'レポート負債',
	menu: 'メニュー',
	menuTitle: 'メニュー',
	items: 'アイテム',
	ownedItems: '所持品',
	shop: '購買',
	conveni: 'コンビニ',
	supermarket: 'スーパー',
	history: '行動履歴',
	useButton: '使用',
	noReportsMessage: '進行中のレポートはありません。',
	noItemsMessage: 'アイテムはありません。',
	saveLoad: 'セーブ・ロード'
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

// アイテムデータは別ファイル `js/items.js` で管理します。
// ここではアイテムのIDだけを参照する設計にし、具体的な定義は分離しました。

// 店舗ごとの品揃え（IDの配列）
CONFIG.SCHOOL_SHOP_ITEMS = ['onigiri', 'sandwich', 'energy_drink'];
CONFIG.CONVENIENCE_ITEMS = ['instant_noodles', 'onigiri', 'energy_drink'];

// ショップ定義を一元管理する（UIやイベントから参照するため）
CONFIG.SHOPS = {
	school: { id: 'school', labelKey: 'shop', label: '購買', items: CONFIG.SCHOOL_SHOP_ITEMS },
	conveni: { id: 'conveni', labelKey: 'conveni', label: 'コンビニ', items: CONFIG.CONVENIENCE_ITEMS },
	// ひとまずスーパーの品揃えはコンビニと同一にする（将来は別ラインナップや価格調整を想定）
	supermarket: { id: 'supermarket', labelKey: 'supermarket', label: 'スーパー', items: CONFIG.CONVENIENCE_ITEMS }
};

// EVENTS は js/eventsData.js に分離しました
