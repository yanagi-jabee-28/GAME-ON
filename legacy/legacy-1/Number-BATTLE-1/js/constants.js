export const CPU_MODE_SEQUENCE = ['weakest', 'normal', 'hard', 'strong'];

export const CPU_MODE_LABELS = {
	weakest: '最弱',
	normal: '普通',
	hard: '強い',
	strong: '最強'
};

export function getCpuModeLabel(mode) {
	return CPU_MODE_LABELS[mode] || CPU_MODE_LABELS.normal;
}

export const CPU_THINK_TIME_PROFILE = {
	weakest: { min: 220, max: 420 },
	normal: { min: 280, max: 620 },
	hard: { min: 420, max: 920 },
	strong: { min: 800, max: 2200 }
};

export const DEFAULT_CPU_THINK_TIME = { min: 320, max: 780 };

export const PONDER_DEPTH_STEP = 2;
export const PONDER_MAX_DEPTH_OFFSET = 8;
export const PONDER_TIME_BUDGET_MS = 3600;

export const STORAGE_KEYS = {
	battleHistory: 'number-battle-history-v1'
};

export const BATTLE_HISTORY_VERSION = 1;
export const BATTLE_HISTORY_LIMIT = 200;
