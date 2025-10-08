declare module './ui.js' {
	// Minimal ambient declaration to keep TS happy in this mixed JS/TS codebase.
	const defaultExport: any;
	export default defaultExport;
	export const performAiAttackAnim: any;
	export const performAiSplitAnim: any;
	export const cacheDom: any;
	export const openSplitModal: any;
	export const updateDisplay: any;
	export const updateMessage: any;
	export const clearActionHighlights: any;
	export const performAiSplitAnim: any;
	export const performAiAttackAnim: any;
	export const applyActionHighlights: any;
	export const clearActionHighlights: any;
	export const displayPlayerHints: any;
	export const fitUIToViewport: any;
	// allow namespace import
	export as namespace UI;
}

declare module './ui' {
	const defaultExport: any;
	export default defaultExport;
	export const performAiAttackAnim: any;
	export const performAiSplitAnim: any;
	export as namespace UI;
}
