/**
 * @file randomEvents.js
 * @deprecated このファイルは randomEventsData.js に移行しました。今後は js/randomEventsData.js を読み込んでください。
 * @description ランダムイベントのデータ定義ファイル（旧）。
 * 各イベントの発生条件、メッセージ、選択肢、結果などを定義します。
 */

const RANDOM_EVENTS = {
	// --- 授業中イベント ---
	"PROFESSOR_TALK": {
		id: "PROFESSOR_TALK",
		name: "教授の雑談、宇宙へ",
		conditions: {
			turn: ["午前"], // 発生するターン
			weekday: true, // 平日のみ
		},
		message: "物理の教授の雑談が白熱し、授業そっちのけで宇宙の神秘について語り始めた...",
		choices: [
			{
				text: "興味深く聞く",
				consequences: {
					message: "宇宙の壮大さに思いを馳せ、少しだけ心が軽くなった。",
					changes: { mental: 5, condition: 5 } // メンタル回復、コンディション消費軽減（実装時に考慮）
				}
			},
			{
				text: "内職して勉強する",
				consequences: {
					// 確率で成功・失敗を分岐させる例
					probability: 0.7, // 70%で成功
					success: {
						message: "教授の話をBGMに、集中して勉強ができた。",
						changes: { academic: 5 }
					},
					failure: {
						message: "内職が教授にバレてしまい、気まずい思いをした...",
						changes: { condition: -10 }
					}
				}
			}
		]
	},
	"SOLDER_CHALLENGE": {
		id: "SOLDER_CHALLENGE",
		name: "急募：はんだ付け",
		conditions: {
			turn: ["午前"], // 発生するターン (実験・実習のある日という条件は別途実装が必要)
			weekday: true,
		},
		message: "急遽、はんだ付けのスキルチェックが行われることになった！",
		choices: [
			{
				text: "自信満々で挑む",
				consequences: {
					probability: 0.5, // 50%で成功
					success: {
						message: "見事なはんだ付けを披露し、友人たちから尊敬の眼差しを受けた。",
						changes: { connections: 5 }
					},
					failure: {
						message: "手を滑らせてしまい、基盤を焦がしてしまった...",
						changes: { physical: -5 }
					}
				}
			},
			{
				text: "得意な友人に助けを求める",
				consequences: {
					message: "友人に助けてもらい、難なく乗り切ることができた。持つべきものは友だ。",
					changes: { connections: -1 } // 人脈ポイントを少し消費
				}
			}
		]
	},

	// --- 放課後・夜イベント ---
	"MIDNIGHT_RAMEN": {
		id: "MIDNIGHT_RAMEN",
		name: "深夜のラーメンの誘惑",
		conditions: {
			turn: ["夜"],
			status: {
				condition: { max: 40 } // コンディションが40以下の時に発生しやすい
			}
		},
		message: "友人から「禁断の夜食ラーメンに行かないか？」と誘われた。",
		choices: [
			{
				text: "誘いに乗る",
				consequences: {
					message: "背徳感と共にすするラーメンは格別だった。明日から頑張ろう...",
					changes: { money: -500, mental: 15, physical: -10 } // 翌朝のフィジカル低下
				}
			},
			{
				text: "断って勉強する",
				consequences: {
					message: "誘惑を振り切り、机に向かった。偉い。",
					changes: {}
				}
			}
		]
	},
	"JUNK_PC_REBUILD": {
		id: "JUNK_PC_REBUILD",
		name: "ジャンクPC再生計画",
		conditions: {
			turn: ["放課後"],
		},
		message: "友人がガラクタ同然のPCを拾ってきた。「一緒に直さないか？」と持ちかけられる。",
		choices: [
			{
				text: "修理を手伝う",
				consequences: {
					probability: 0.6, // 60%で成功
					success: {
						message: "苦労の末、PCは息を吹き返した！お礼にいくらか貰えた。",
						changes: { physical: -20, money: 2000, connections: 5 }
					},
					failure: {
						message: "結局、PCが直ることはなく、ただただ疲れただけだった...",
						changes: { physical: -20 }
					}
				}
			},
			{
				text: "面倒だから断る",
				consequences: {
					message: "「そうか、残念だ」と友人は少しがっかりした様子だった。",
					changes: {}
				}
			}
		]
	}
};
