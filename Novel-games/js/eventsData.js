/**
 * @file eventsData.js
 * @description ゲーム内で使用する定義済みイベント（データ）を管理する。
 *
 * 型ガイド（開発者向け）:
 * @typedef {Object} EventData
 * @property {string} [name]        - 話者名（ウィンドウ左上に表示）
 * @property {string} [message]     - 最初に表示するメッセージ
 * @property {Object} [changes]     - 状態変化。基本は { stats:{ academic?, physical?, mental?, technical? }, money?, cp?, reportDebt?, itemsAdd? }
 * @property {string} [afterMessage]- 変化後に表示する追いメッセージ
 * @property {string} [nextAction]  - 次に実行するアクション（例: "showMainActions"）
 *
 * 注意:
 * - 旧仕様のキー（connections/condition のトップレベル）はロジック側で正規化されます。
 * - 可能であれば changes.stats 内に academic/physical/mental/technical を入れる形で記述してください。
 */

const EVENTS = {
	"STUDY_ACTION": {
		message: "自主的に机に向かい、黙々と勉強を始めた。",
		changes: {
			stats: { academic: 4, mental: -3, physical: -2 }
		},
		afterMessage: "勉強の手応えを感じた。少し疲れたが着実に力がついた。",
		nextAction: "showMainActions" // 次に実行するアクション
	},
	"WORK_ACTION": {
		message: "お金を稼ぎに行こう。",
		changes: {
			money: 400,
			stats: { physical: -8 }
		},
		afterMessage: "疲れた...でも、これで少しは生活が楽になるはずだ。",
		nextAction: "showMainActions"
	},
	"REPORT_ACTION": {
		message: "溜まっているレポートを片付けないと...",
		changes: { stats: { mental: -4 } },
		afterMessage: "", // レポート進捗によってメッセージが変わるため空
		nextAction: "showMainActions"
	},
	"REST_ACTION": {
		message: "今日はゆっくり休んで、明日に備えよう。",
		changes: { stats: { physical: 8, mental: 8 } },
		afterMessage: "",
		nextAction: "showMainActions"
	},
	"ATTEND_CLASS_ACTION": {
		message: "授業に集中する。学びを吸収しよう。",
		changes: {
			stats: { academic: 6, mental: -2 }
		},
		afterMessage: "", // 特にメッセージなし
		nextAction: "showMainActions"
	},
	"MOONLIGHT_WORK_ACTION": {
		message: "授業中に内職（レポートを進める）をする。授業の時間を使ってレポートを進めよう。",
		changes: { stats: { mental: -3 } },
		afterMessage: "", // doReport に委譲するため特にメッセージなし
		nextAction: "showMainActions"
	},
	"DOZE_OFF_ACTION": {
		message: "うとうと... 居眠りをしてしまった。",
		changes: { stats: { mental: 2 } },
		afterMessage: "", // 特にメッセージなし
		nextAction: "showMainActions"
	},
	// 汎用のゲームオーバー用イベントテンプレート
	"GAME_OVER_EVENT": {
		message: "ここでゲームは終了します。お疲れさまでした。",
		afterMessage: "プレイを終了します。リスタートまたはタイトルへ戻ってください。"
	}
};

/**
 * RANDOM_EVENTS: ランダムイベントのデータ定義（分割を減らすため本ファイルに集約）
 */
const RANDOM_EVENTS = {
	"PROFESSOR_TALK": {
		id: "PROFESSOR_TALK",
		name: "教授の雑談、宇宙へ",
		conditions: { turn: ["午前"], weekday: true },
		message: "物理の教授の雑談が白熱し、授業そっちのけで宇宙の神秘について語り始めた...",
		choices: [
			{ text: "興味深く聞く", consequences: { message: "宇宙の壮大さに思いを馳せ、少しだけ心が軽くなった。", changes: { mental: 5, condition: 5 } } },
			{ text: "内職して勉強する", consequences: { probability: 0.7, success: { message: "教授の話をBGMに、集中して勉強ができた。", changes: { academic: 5 } }, failure: { message: "内職が教授にバレてしまい、気まずい思いをした...", changes: { condition: -10 } } } }
		]
	},
	"SOLDER_CHALLENGE": {
		id: "SOLDER_CHALLENGE",
		name: "急募：はんだ付け",
		conditions: { turn: ["午前"], weekday: true },
		message: "急遽、はんだ付けのスキルチェックが行われることになった！",
		choices: [
			{ text: "自信満々で挑む", consequences: { probability: 0.5, success: { message: "見事なはんだ付けを披露し、友人たちから尊敬の眼差しを受けた。", changes: { connections: 5 } }, failure: { message: "手を滑らせてしまい、基盤を焦がしてしまった...", changes: { physical: -5 } } } },
			{ text: "得意な友人に助けを求める", consequences: { message: "友人に助けてもらい、難なく乗り切ることができた。持つべきものは友だ。", changes: { connections: -1 } } }
		]
	},
	"MIDNIGHT_RAMEN": {
		id: "MIDNIGHT_RAMEN",
		name: "深夜のラーメンの誘惑",
		conditions: { turn: ["夜"], status: { physical: { max: 40 } } },
		message: "友人から「禁断の夜食ラーメンに行かないか？」と誘われた。",
		choices: [
			{ text: "誘いに乗る", consequences: { message: "背徳感と共にすするラーメンは格別だった。明日から頑張ろう...", changes: { money: -500, mental: 15, physical: -10 } } },
			{ text: "断って勉強する", consequences: { message: "誘惑を振り切り、机に向かった。偉い。", changes: {} } }
		]
	},
	"JUNK_PC_REBUILD": {
		id: "JUNK_PC_REBUILD",
		name: "ジャンクPC再生計画",
		conditions: { turn: ["放課後"] },
		message: "友人がガラクタ同然のPCを拾ってきた。「一緒に直さないか？」と持ちかけられる。",
		choices: [
			{ text: "修理を手伝う", consequences: { probability: 0.6, success: { message: "苦労の末、PCは息を吹き返した！お礼にいくらか貰えた。", changes: { physical: -20, money: 2000, connections: 5 } }, failure: { message: "結局、PCが直ることはなく、ただただ疲れただけだった...", changes: { physical: -20 } } } },
			{ text: "面倒だから断る", consequences: { message: "「そうか、残念だ」と友人は少しがっかりした様子だった。", changes: {} } }
		]
	}
};
