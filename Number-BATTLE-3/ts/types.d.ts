// Local types for Number-BATTLE-3
// These replace references that previously relied on the root types/global.d.ts

type NB3_GameManager = import("./game").GameState;
type NB3_AI = import("./ai").AI;

// --- Window-scoped globals for this folder ---
declare global {
	interface Window {
		// limit global exposure to what's required by this folder
		gameManager?: NB3_GameManager;
		ai?: NB3_AI;
	}

	// When the UI module is bundled as a UMD global, a `UI` global may be present.
	// Provide a typed alias to the module's exports for convenience.
	const UI: typeof import("./ui");
}

// --- Ambient module declaration for './ui' ---
// This replaces the separate `ui.d.ts` file so TypeScript consumers of `import './ui'`
// or `import UI from './ui'` continue to have proper types even after deleting
// the standalone declaration file.
declare module "./ui" {
	export function performAiAttackAnim(...args: unknown[]): unknown;
	export function performAiSplitAnim(...args: unknown[]): unknown;
	export function cacheDom(...args: unknown[]): unknown;
	export function openSplitModal(...args: unknown[]): unknown;
	export function updateDisplay(...args: unknown[]): unknown;
	export function updateMessage(...args: unknown[]): unknown;
	export function clearActionHighlights(...args: unknown[]): unknown;
	export function applyActionHighlights(...args: unknown[]): unknown;
	export function displayPlayerHints(...args: unknown[]): unknown;
	export function fitUIToViewport(...args: unknown[]): unknown;

	const _default: {
		performAiAttackAnim: typeof performAiAttackAnim;
		performAiSplitAnim: typeof performAiSplitAnim;
		cacheDom: typeof cacheDom;
		openSplitModal: typeof openSplitModal;
		updateDisplay: typeof updateDisplay;
		updateMessage: typeof updateMessage;
		clearActionHighlights: typeof clearActionHighlights;
		applyActionHighlights: typeof applyActionHighlights;
		displayPlayerHints: typeof displayPlayerHints;
		fitUIToViewport: typeof fitUIToViewport;
	};

	export default _default;

	// Allow UMD consumers to access the module as the global `UI` namespace when
	// the script is included directly in a page.
	export as namespace UI;
}

export {};
