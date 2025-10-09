// Local ambient declarations for Novel-games folder
// Move types that were previously kept in types/global.d.ts here
type GameManagerType = import("./ts/gameManager").GameManager;
type UIManagerType = import("./ts/ui").UIManager;
type SoundManagerType = import("./ts/soundManager").SoundManager;
type GameEventManagerType = typeof import("./ts/events").GameEventManager;
type ItemsMap = typeof import("./ts/items").ITEMS;
type ConfigType = typeof import("./ts/config").CONFIG;

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
