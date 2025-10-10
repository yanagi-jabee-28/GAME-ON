// Local types for Number-BATTLE-3
// These replace references that previously relied on the root types/global.d.ts

type NB3_GameManager = import("./game").GameState;
type NB3_AI = import("./ai").AI;

declare global {
	interface Window {
		// limit global exposure to what's required by this folder
		gameManager?: NB3_GameManager;
		ai?: NB3_AI;
	}
}

export {};
