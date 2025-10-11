// Local ambient declarations for GAME-pachinko-1 (embedded slot / toast / game config)
import type { SlotGameConfig, SlotGameInstance } from "../../types/slot";

declare global {
	interface Window {
		__EmbeddedSlotAdapterLoadedAt?: number;
		__EmbeddedSlotAdapterTrigger?: (() => unknown) | undefined;
		__EmbeddedSlotLastError?: unknown;
		EmbeddedSlot?:
			| {
					init: (opts?: { show?: boolean }) => boolean;
					startSpin: () => boolean;
					stopSpin: () => boolean;
					getInstance: () => SlotGameInstance | null;
					diagnose?: () => void;
					_instance?: SlotGameInstance | null;
			  }
			| undefined;
		SLOT_GAME_INSTANCE?: SlotGameInstance | null;
		GAME_CONFIG?: SlotGameConfig;
		getRotatorsSummary?: () => unknown;
		setRotatorsSummary?: () => unknown;
		setRotatorsEnabledByKind?: (kind: string, enabled: boolean) => void;
		setRotatorEnabledById?: (id: string, enabled: boolean) => void;
		setRotatorEnabledByIndex?: (index: number, enabled: boolean) => void;
		setAllRotatorsEnabled?: (enabled: boolean) => void;
		toggleRotatorEnabled?: (id: string) => void;
		// パチンコゲーム固有のデバッグ・パフォーマンス計測用プロパティ
		__pachi_stylesheetTimeout?: boolean;
		__pachi_stylesLoaded?: boolean;
		__pachi_sizedReady?: boolean;
		__pachi_init_logged__?: boolean;
		__engine_for_devtools__?: unknown;
		__render_for_devtools__?: unknown;
		__recordPhysicsPerf__?: (frameMs: number) => void;
		// Toast message timers
		__toast_hideTimer?: ReturnType<typeof setTimeout>;
		__toast_fadeTimer?: ReturnType<typeof setTimeout>;
	}

	interface Document {
		fonts?: {
			ready: Promise<unknown>;
		};
	}

	interface Navigator {
		deviceMemory?: number;
	}

	// global helper used by this folder
	function showToastMessage(msg: string, durationMs?: number): void;
}
