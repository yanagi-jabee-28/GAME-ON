// Shared Slot Game type definitions used across GAME-SLOT-1 and adapters

export type ReelSymbol = string;

export interface SlotAudioVolumes {
	spinStart: number;
	reelStop: number;
	win: number;
}

export interface SlotSoundFiles {
	spinStart?: string;
	reelStop?: string;
	win?: string;
	[key: string]: string | undefined;
}

export interface SlotSoundsConfig {
	enabled: boolean;
	volume: number; // master volume 0-1
	volumes: Partial<SlotAudioVolumes>;
	files: SlotSoundFiles;
}

export interface SlotRewardsConfig {
	slotWinAmmoMultiplier: number;
	slotWinMessageTemplate: string;
}

export interface SlotCreditConfig {
	enabled: boolean;
	creditLimit: number;
	interestRate: number; // 0.1 = 10%
}

export interface SlotDebugConfig {
	stopLogs: boolean;
	frameLogs: boolean;
}

export type ReelData = ReelSymbol[];

export interface SlotSelectorsConfig {
	slotMachine?: string;
	actionBtn?: string;
	modeBtn?: string;
}

export interface SlotGameConfig {
	selectors: SlotSelectorsConfig;
	reelCount: number;
	symbolHeight: number;
	uiScale: number;
	symbolDuplicationFactor: number;
	reelsData: ReelData[];
	symbolProbabilities: Array<{ symbol: ReelSymbol; weight: number }>;
	initialReelPositions: number[];
	initialIsAutoMode: boolean;
	autoSpeed: number;
	manualSpeed: number;
	accelerationTime: number;
	minStopAnimTime: number;
	maxStopAnimTime: number;
	reverseRotation: boolean;
	stopEasing: "cubic" | "quad" | "sine" | "linear" | (string & {});
	stopBaseDurationMs: number;
	autoStopMinTime: number;
	autoStopMaxTime: number;
	minSequentialStopGapMs: number;
	stopTargets: Array<{
		reelIndex: number;
		symbol: ReelSymbol;
		position?: "top" | "middle" | "bottom";
	}>;
	targetActivationProbability: number;
	
	// 新しい簡単設定（v2）
	winProbability?: number; // 全体の当たり確率 0.0-1.0
	winTypeRatio?: {
		horizontal: number; // 水平ラインの割合
		diagonal: number;   // 斜めラインの割合
	};
	
	// 以下は自動計算される（直接設定も可能だが非推奨）
	winActivationProbability?: number; // 旧式：後方互換用
	winHorizontalProbability?: number; // 自動計算: winProbability * winTypeRatio.horizontal
	winDiagonalProbability?: number;   // 自動計算: winProbability * winTypeRatio.diagonal
	twinDiagonalProbability?: number;  // 自動計算: winProbability * winTypeRatio.diagonal
	
	autoStopTimeRandomness?: number;
	winSymbolWeights: Record<ReelSymbol, number>;
	winRowMode: "top" | "middle" | "bottom" | "random";
	winDiagonalMode: "down" | "up" | "random";
	debug: SlotDebugConfig;
	devPanelEnabled: boolean;
	initialBalance: number;
	minBet: number;
	maxBet: number;
	sounds: SlotSoundsConfig;
	credit: SlotCreditConfig;
	payoutTable: Record<ReelSymbol, number>;
	rewards?: SlotRewardsConfig;
	slotAudio?: {
		masterVolume?: number;
		volumes?: Partial<SlotAudioVolumes>;
	};
	persistenceSalt?: string;
}

export interface SlotSoundManagerPublic {
	setMasterVolume(volume: number): void;
	setPerVolume(kind: keyof SlotAudioVolumes | string, volume: number): void;
}

export interface SlotReelConfig {
	container: HTMLElement;
	symbols: ReelSymbol[];
	symbolHeight: number;
	index: number;
	element?: HTMLElement;
	spinning?: boolean;
	targetSymbol?: ReelSymbol;
	targetRow?: "top" | "middle" | "bottom";
	stopTime?: number;
	stopDuration?: number;
	stopStartY?: number;
	stopEndY?: number;
	stopEasing?: string;
	animId?: number;
	animationFrameId?: number | null;
	velocity?: number;
	animationMode?: "spin" | "stop";
	totalHeight?: number;
}

export interface SlotGameInstance {
	// minimal surface used by adapters and other games
	isSpinning: boolean;
	reels: unknown[];
	soundManager?: SlotSoundManagerPublic;
	startGame?: () => void;
	stopReel?: (index: number) => void;
	computeProbabilityReturnGreaterThanBet?: (bet: number) => number;
	balance?: number;
	creditConfig?: SlotCreditConfig;
	debt?: number;
}
