// SLOT-3 スロットゲーム設定（初期値・型定義）

export const SLOT_SYMBOLS = [
	"\uD83C\uDF52", // 🍒
	"\uD83C\uDF4B", // 🍋
	"\uD83C\uDF4E", // 🍎
	"\uD83C\uDF4C", // 🍌
	"\uD83C\uDF49", // 🍉
	"\uD83C\uDF47", // 🍇
	"\uD83D\uDC8E", // 💎
	"7\uFE0F\u20E3", // 7️⃣
	"BAR",
] as const;

export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

export type SlotConfig = {
	reelCount: number;
	rowCount: number;
	minBet: number;
	maxBet: number;
	defaultBalance: number;
	symbols: readonly SlotSymbol[];
	symbolWeights: readonly number[];
	payouts: Record<SlotSymbol, number>;
	// 固定リール配列（各リールの出現順序）
	reelsData: readonly (readonly SlotSymbol[])[];
};

export const slotConfig: SlotConfig = {
	reelCount: 3,
	rowCount: 3,
	minBet: 10,
	maxBet: 100,
	defaultBalance: 1000,
	symbols: SLOT_SYMBOLS,
	symbolWeights: [5, 5, 3, 2, 1, 1, 1, 1, 1],
	payouts: {
		"\uD83C\uDF52": 10, // 🍒
		"\uD83C\uDF4B": 2, // 🍋
		"\uD83C\uDF4E": 5, // 🍎
		"\uD83C\uDF4C": 3, // 🍌
		"\uD83C\uDF49": 4, // 🍉
		"\uD83C\uDF47": 6, // 🍇
		"\uD83D\uDC8E": 20, // 💎
		"7\uFE0F\u20E3": 50, // 7️⃣
		BAR: 15,
	},
	reelsData: [
		[
			"🍌",
			"🍋",
			"🍎",
			"🍌",
			"🍋",
			"💎",
			"🍉",
			"🍌",
			"🍋",
			"BAR",
			"🍒",
			"🍎",
			"🍌",
			"🍋",
			"🍉",
			"🍌",
			"🍋",
			"7️⃣",
			"🍇",
			"7️⃣",
			"🍇",
		], // 左リール (インデックス 0)
		[
			"🍌",
			"🍒",
			"🍋",
			"🍌",
			"🍎",
			"💎",
			"🍉",
			"🍋",
			"🍌",
			"🍒",
			"BAR",
			"🍒",
			"🍋",
			"🍌",
			"🍉",
			"🍋",
			"🍌",
			"🍇",
			"7️⃣",
			"🍇",
			"🍋",
		], // 中央リール (インデックス 1)
		[
			"🍋",
			"🍎",
			"🍌",
			"🍋",
			"🍉",
			"💎",
			"🍌",
			"🍋",
			"🍒",
			"BAR",
			"🍌",
			"🍋",
			"🍉",
			"🍎",
			"🍌",
			"🍋",
			"🍇",
			"7️⃣",
			"🍇",
			"7️⃣",
			"🍌",
		], // 右リール (インデックス 2)
	],
};
