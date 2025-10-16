// SLOT-3 型定義（必要に応じて拡張）
declare const slotConfig: {
	reelCount: number;
	rowCount: number;
	minBet: number;
	maxBet: number;
	defaultBalance: number;
	symbols: string[];
	symbolWeights: number[];
	payouts: Record<string, number>;
};
