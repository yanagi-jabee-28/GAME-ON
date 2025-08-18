/**
 * @file items.js
 * @description アイテムデータを別ファイルで管理します。
 * ITEMS オブジェクトをグローバルに定義します。
 */

const ITEMS = {
	'energy_drink': {
		name: 'エナジードリンク',
		price: 300,
		description: '一時的に体力を回復するが、後で反動が来る。',
		// duration: 効果が続くターン数（使用ターンもカウントする）
		// flagId: 内部識別子、displayName: メニュー表示向けの名前
		effect: { changes: { stats: { condition: 10 } }, duration: 3, flagId: 'energy_drink_effect', displayName: 'エナジードリンク効果' }
	},
	'onigiri': {
		name: 'おにぎり',
		price: 150,
		description: '小腹を満たす。',
		effect: { changes: { stats: { condition: 5 } } }
	},
	'sandwich': {
		name: 'サンドイッチ',
		price: 400,
		description: 'しっかり食事できる。',
		effect: { changes: { stats: { condition: 12 } } }
	},
	'instant_noodles': {
		name: 'カップ麺',
		price: 250,
		description: '夜食に最適。',
		effect: { changes: { stats: { condition: 8 } } }
	}
};
