// Type definitions for UI module used by Number-BATTLE-3
// This file declares the module's public API as named exports and a default export
// so it can be imported both as an ES module (`import * as UI from './ui'`) and
// used as a global namespace (`UI.*`) when bundled as UMD.

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

declare const _default: {
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

// Allow using `UI` as a global namespace when the module is included as a UMD bundle
export as namespace UI;
