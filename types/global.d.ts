// Global ambient type augmentations for the project (lightweight)
import 'matter-js';

declare global {
	interface Window {
		__engine_for_devtools__?: any;
		__render_for_devtools__?: any;
		__recordPhysicsPerf__?: any;
		__engine_for_devtools__?: any;
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
	}
}

export { };
