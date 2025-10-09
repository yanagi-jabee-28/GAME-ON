// Local ambient declarations for Novel-games folder
// Move types that were previously kept in types/global.d.ts here
type GameManagerType = import("./js/gameManager.js").GameManager;
type UIManagerType = import("./js/ui.js").UIManager;
type SoundManagerType = import("./js/soundManager.js").SoundManager;
type GameEventManagerType = typeof import("./js/events.js").GameEventManager;
type ItemsMap = typeof import("./js/items.js").ITEMS;
type ConfigType = typeof import("./js/config.js").CONFIG;

declare global {
	interface Window {
		gameManager?: GameManagerType;
		ui?: UIManagerType;
		soundManager?: SoundManagerType;
		GameEventManager?: GameEventManagerType;
		ITEMS?: ItemsMap;
		CONFIG?: ConfigType;
		initializeGame?: (protagonistName?: string) => void;
	}
}

export { };
