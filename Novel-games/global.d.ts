// Local ambient declarations for Novel-games folder
// Move types that were previously kept in types/global.d.ts here
type GameManagerType = import("./ts/gameManager").GameManager;
type UIManagerType = import("./ts/ui").UIManager;
type SoundManagerType = import("./ts/soundManager").SoundManager;
type GameEventManagerType = typeof import("./ts/events").GameEventManager;

declare const gameManager: GameManagerType;
declare const ui: UIManagerType;
declare const soundManager: SoundManagerType;
declare const GameEventManager: GameEventManagerType;
declare const initializeGame: (protagonistName?: string) => void;

declare global {
	interface Window {
		gameManager: GameManagerType;
		ui: UIManagerType;
		soundManager: SoundManagerType;
		GameEventManager: GameEventManagerType;
		initializeGame: (protagonistName?: string) => void;
		ITEMS: Record<string, unknown>;
		CONFIG: Record<string, unknown>;
	}
}

export {};
