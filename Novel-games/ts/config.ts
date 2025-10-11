/**
 * @file config.js
 * @description ゲーム全体の設定を管理するファイル
 * 将来的にキャラクター、アイテム、イベントなどのデータをここに追加していきます。
 */

interface StatDef {
	label: string;
	min: number;
	max: number;
	default: number;
}

interface Report {
	id: string;
	title: string;
	progress: number;
	required: number;
	changes: {
		stats: {
			academic: number;
		};
	};
	progressMessage: string;
}

interface InitialPlayerStatus {
	day: number;
	turnIndex: number;
	condition: number;
	money: number;
	cp: number;
	stats: {
		academic: number;
		physical: number;
		mental: number;
		technical: number;
	};
	items: string[];
	history: unknown[]; // historyの型は別途検討
	reportDebt: number;
	reports: Report[];
	menuLocked: boolean;
}

interface Labels {
	date: string;
	timeOfDay: string;
	money: string;
	currencyUnit: string;
	academic: string;
	condition: string;
	physical: string;
	mental: string;
	technical: string;
	cp: string;
	reportDebt: string;
	menu: string;
	menuTitle: string;
	items: string;
	ownedItems: string;
	shop: string;
	conveni: string;
	supermarket: string;
	history: string;
	useButton: string;
	noReportsMessage: string;
	noItemsMessage: string;
	saveLoad: string;
}

interface Shop {
	id: string;
	labelKey: string;
	label: string;
	items: string[];
}

interface Config {
	TURNS: string[];
	WEEKDAYS: string[];
	START_WEEKDAY_INDEX: number;
	CONDITION_STATUS: {
		EXCELLENT: string;
		GOOD: string;
		BAD: string;
		WORST: string;
	};
	STAT_DEFS: {
		academic: StatDef;
		physical: StatDef;
		mental: StatDef;
		technical: StatDef;
	};
	EXAM: {
		day: number;
		passThreshold: number;
	};
	EXAM_REWARDS: {
		pass: { money: number; cp: number };
		fail: { money: number; cp: number };
	};
	EXAM_EXT: {
		repeatWeekly: boolean;
		weekday: string;
	};
	INITIAL_PLAYER_STATUS: InitialPlayerStatus;
	LABELS: Labels;
	SCHOOL_SHOP_ITEMS: string[];
	CONVENIENCE_ITEMS: string[];
	SUPERMARKET_ITEMS: string[];
	SHOPS: {
		school: Shop;
		conveni: Shop;
		supermarket: Shop;
	};
}

// ゲームの定数を定義
export const CONFIG: Config = {
	// 1日のターン名
	TURNS: ["午前", "放課後", "夜"],

	// 曜日表示（GAME開始の基準: day 1 = 水曜日）
	WEEKDAYS: ["日", "月", "火", "水", "木", "金", "土"],
	// WEEKDAYSのインデックスで、day=1 が何曜日かを指定する（'水' => index 3）
	START_WEEKDAY_INDEX: 3,

	// コンディションの状態
	CONDITION_STATUS: {
		EXCELLENT: "絶好調",
		GOOD: "普通",
		BAD: "不調",
		WORST: "疲労困憊",
	},

	// ステータス定義。将来的にステータス名や最大/最小値が増えるときはここを編集する
	STAT_DEFS: {
		academic: { label: "学力", min: 0, max: 100, default: 10 },
		physical: { label: "体力", min: 0, max: 100, default: 80 },
		mental: { label: "精神力", min: 0, max: 100, default: 80 },
		technical: { label: "技術力", min: 0, max: 100, default: 5 },
	},

	// 期末試験の設定: 何日目に試験があるかと合格基準値
	EXAM: {
		day: 8,
		passThreshold: 60,
	},

	// 試験報酬（合格時に付与するデフォルト報酬）
	// cp はデフォルトで 0 にしておく（意図しない人脈増加を防止）
	EXAM_REWARDS: {
		// 試験は目的そのものなので金銭報酬は一旦0にしておく
		pass: { money: 0, cp: 0 },
		fail: { money: 0, cp: 0 },
	},

	// EXAM の拡張設定: repeatWeekly を true にすると指定曜日ごとに試験を実施
	// weekday は '日','月',... のいずれか。デフォルトは '水'（START_WEEKDAY_INDEX に合わせる）
	EXAM_EXT: {
		repeatWeekly: true,
		weekday: "水",
	},

	// 初期ステータス
	INITIAL_PLAYER_STATUS: {
		day: 1,
		turnIndex: 0, // TURNS配列のインデックス
		condition: 100, // 互換性のために残す（体力・精神力から算出）
		money: 10000,
		cp: 0,
		stats: {
			academic: 10, // 学力
			physical: 80,
			mental: 80,
			technical: 5,
		},
		items: ["energy_drink"], // 所持アイテムにエナジードリンクを追加
		history: [], // 行動履歴（選択やアイテム使用などを記録する配列）
		reportDebt: 0, // レポート負債（互換性用の総数）
		reports: [
			// 個別レポート管理のための配列（将来拡張用）
			{
				id: "test_report_1",
				title: "問題演習",
				progress: 0,
				required: 3,
				// 進捗ごとに学力が上がるように設定
				changes: { stats: { academic: 2 } },
				progressMessage: "問題演習を進めた。学力が少し上がった。",
			},
		],
		menuLocked: false, // メニュー開閉が制御されるフェーズ用フラグ
	},
	// 表示用ラベルをまとめて定義しておく（将来変更が簡単になる）
	LABELS: {
		date: "日付",
		timeOfDay: "時間",
		money: "所持金",
		currencyUnit: "円",
		academic: "学力",
		condition: "コンディション",
		physical: "体力",
		mental: "精神力",
		technical: "技術力",
		cp: "人脈",
		reportDebt: "レポート負債",
		menu: "メニュー",
		menuTitle: "メニュー",
		items: "アイテム",
		ownedItems: "所持品",
		shop: "購買",
		conveni: "コンビニ",
		supermarket: "スーパー",
		history: "行動履歴",
		useButton: "使用",
		noReportsMessage: "進行中のレポートはありません。",
		noItemsMessage: "アイテムはありません。",
		saveLoad: "セーブ・ロード",
	},
	// 店舗ごとの品揃え（IDの配列）
	SCHOOL_SHOP_ITEMS: ["onigiri", "sandwich", "energy_drink", "chocolate_bar"],
	CONVENIENCE_ITEMS: [
		"instant_noodles",
		"onigiri",
		"energy_drink",
		"calming_tea",
		"chocolate_bar",
	],
	SUPERMARKET_ITEMS: [
		"instant_noodles",
		"onigiri",
		"sandwich",
		"calming_tea",
		"chocolate_bar",
		"relax_bath_salt",
	],
	// ショップ定義を一元管理する（UIやイベントから参照するため）
	SHOPS: {
		school: {
			id: "school",
			labelKey: "shop",
			label: "購買",
			items: ["onigiri", "sandwich", "energy_drink", "chocolate_bar"],
		},
		conveni: {
			id: "conveni",
			labelKey: "conveni",
			label: "コンビニ",
			items: [
				"instant_noodles",
				"onigiri",
				"energy_drink",
				"calming_tea",
				"chocolate_bar",
			],
		},
		supermarket: {
			id: "supermarket",
			labelKey: "supermarket",
			label: "スーパー",
			items: [
				"instant_noodles",
				"onigiri",
				"sandwich",
				"calming_tea",
				"chocolate_bar",
				"relax_bath_salt",
			],
		},
	},
};

// キャラクターデータ (将来の拡張用)
export const CHARACTERS = {
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

// EVENTS は js/eventsData.js に分離しました
