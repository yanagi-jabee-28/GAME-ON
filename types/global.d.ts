// Minimal ambient declarations to reduce checkJs / tsserver noise for legacy JS files
type GameManagerType = import("../Novel-games/js/gameManager.js").GameManager;
type UIManagerType = import("../Novel-games/js/ui.js").UIManager;
type SoundManagerType = import("../Novel-games/js/soundManager.js").SoundManager;
type GameEventManagerType = typeof import("../Novel-games/js/events.js").GameEventManager;
type ItemsMap = typeof import("../Novel-games/js/items.js").ITEMS;
type ConfigType = typeof import("../Novel-games/js/config.js").CONFIG;

// Global ambient type augmentations for the project (lightweight)
import "matter-js";

declare global {
	interface Navigator {
		deviceMemory?: number;
	}
	interface Window {
		activeSlotGame?: any;
		createSlotIn?: any;
		SlotGame?: any;
		webkitAudioContext?: typeof AudioContext;
		soundManager?: SoundManagerType;
		GameEventManager?: GameEventManagerType;
		ITEMS?: ItemsMap;
		CONFIG?: ConfigType;
		gameManager?: GameManagerType;
		ui?: UIManagerType;
		initializeGame?: (protagonistName?: string) => void;

		__engine_for_devtools__?: any;
		__render_for_devtools__?: any;
		__recordPhysicsPerf__?: any;
		__EmbeddedSlotAdapterLoadedAt?: any;
		__EmbeddedSlotAdapterTrigger?: any;
		__EmbeddedSlotLastError?: any;
		EmbeddedSlot?: any;
		SLOT_GAME_INSTANCE?: any;
		GAME_CONFIG?: any;
		getRotatorsSummary?: any;
		setRotatorsEnabledByKind?: any;
		setRotatorEnabledById?: any;
		setRotatorEnabledByIndex?: any;
		setAllRotatorsEnabled?: any;
		toggleRotatorEnabled?: any;

		counterId?: any;
		__pachi_init_logged__?: boolean;
	}

	var window: Window & typeof globalThis;
	const soundManager: SoundManagerType;
	const GameEventManager: GameEventManagerType;
	const ITEMS: ItemsMap;
	const CONFIG: ConfigType;
	const gameManager: GameManagerType;
	const ui: UIManagerType;
	function initializeGame(protagonistName?: string): void;

	var showToastMessage: any;

	interface Element {
		focus?(): void;
		click?(): void;
		closest?(selectors: string): Element | null;
		offsetParent?: Element | null;
		isContentEditable?: boolean;
	}

	interface HTMLElement extends Element {
		disabled?: boolean;
		value?: string | number | null;
	}

	interface HTMLInputElement extends HTMLElement {
		value: string;
		min?: string;
		max?: string;
		step?: string;
	}

	interface Event {
		detail?: any;
	}

	interface EventTarget {
		value?: string | number | null;
		closest?(selectors: string): Element | null;
	}

	interface HTMLInputElement extends HTMLElement {
		value: string;
		min?: string;
		max?: string;
		step?: string;
	}

	namespace Matter {
		interface Body {
			material?: any;
			oneWay?: any;
			sensorData?: any;
			// render may be extended in code with `layer` property
			render?: IBodyRenderOptions & { layer?: number };
		}
		interface IBodyRenderOptions {
			fillStyle?: string;
			strokeStyle?: string;
			lineWidth?: number;
			visible?: boolean;
			layer?: number;
		}
		interface IEngineTimingOptions {
			isFixed?: boolean;
		}
		interface IRendererOptions {
			pixelRatio?: number | string;
		}
		namespace Render {
			function bodies(render: any, bodies: any, context: any): void;
		}
	}
}

export { };
