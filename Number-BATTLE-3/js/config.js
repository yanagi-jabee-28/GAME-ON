// Feature toggle configuration for Number-BATTLE-3
// Flip these flags to enable/disable optional UI and behaviors quickly.

// Show hint controls (toggle + mode select) and allow hint rendering
export const SHOW_HINT_CONTROLS = true;

// Show CPU strength select; when false, strength will use DEFAULT_CPU_STRENGTH unless FORCE is set
export const SHOW_CPU_STRENGTH_SELECT = true;

// Show manual AI control toggle; when false, AI is always automatic and debug manual handlers are disabled
export const SHOW_AI_MANUAL_TOGGLE = true;

// Default CPU strength when select is hidden or missing: 'hard' | 'normal' | 'weak' | 'weakest'
export const DEFAULT_CPU_STRENGTH = 'hard';

// Force a specific strength regardless of UI or default (null to disable)
export const FORCE_CPU_STRENGTH = null; // e.g., 'hard' to force strongest
