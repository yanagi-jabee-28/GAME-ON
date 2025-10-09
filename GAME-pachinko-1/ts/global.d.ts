// Local ambient declarations for GAME-pachinko-1 (embedded slot / toast / game config)
declare global {
	interface Window {
		__EmbeddedSlotAdapterLoadedAt?: number;
		__EmbeddedSlotAdapterTrigger?: (() => any) | undefined;
		__EmbeddedSlotLastError?: any;
		EmbeddedSlot?: any;
		SLOT_GAME_INSTANCE?: any;
		GAME_CONFIG?: any;
		getRotatorsSummary?: () => any;
		setRotatorsEnabledByKind?: (kind: string, enabled: boolean) => void;
		setRotatorEnabledById?: (id: string, enabled: boolean) => void;
		setRotatorEnabledByIndex?: (index: number, enabled: boolean) => void;
		setAllRotatorsEnabled?: (enabled: boolean) => void;
		toggleRotatorEnabled?: (id: string) => void;
	}

	// global helper used by this folder
	function showToastMessage(msg: any, durationMs?: number): void;
}

export { };
