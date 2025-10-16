// Local ambient declarations for GAME-SLOT-1
import type { SlotGameConfig, SlotGameInstance } from "./slot";

declare global {
	interface Window {
		activeSlotGame?: SlotGameInstance;
		createSlotIn?: (
			container: HTMLElement | string,
			cfg?: Partial<SlotGameConfig>,
		) => SlotGameInstance | null;
		SlotGame?: new (
			container: HTMLElement,
			cfg: SlotGameConfig,
		) => SlotGameInstance;
		SLOT_GAME_INSTANCE?: SlotGameInstance | null;
	}
}
