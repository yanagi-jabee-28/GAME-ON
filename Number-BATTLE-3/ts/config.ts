// Feature toggle configuration for Number-BATTLE-3
// Flip these flags to enable/disable optional UI and behaviors quickly.

// Centralized, mutable configuration object.
// Use `CONFIG` at runtime so code can override values (for example from URL query params).
export const CONFIG = {
	// Show hint controls (toggle + mode select) and allow hint rendering
	SHOW_HINT_CONTROLS: true,

	// Show CPU strength select; when false, strength will use DEFAULT_CPU_STRENGTH unless FORCE is set
	SHOW_CPU_STRENGTH_SELECT: true,

	// Show manual AI control toggle; when false, AI is always automatic and debug manual handlers are disabled
	SHOW_AI_MANUAL_TOGGLE: true,

	// Default CPU strength when select is hidden or missing: 'hard' | 'normal' | 'weak' | 'weakest'
	DEFAULT_CPU_STRENGTH: "hard",

	// Force a specific strength regardless of UI or default (null to disable)
	FORCE_CPU_STRENGTH: null, // e.g., 'hard' to force strongest

	// Hint display controls
	// SHOW_HINTS_BY_DEFAULT: when true the hint area will be shown (independent of SHOW_HINT_CONTROLS which only controls the UI controls)
	SHOW_HINTS_BY_DEFAULT: true,

	// DEFAULT_HINT_MODE: 'full' or 'simple' - controls which hint verbosity is selected initially
	DEFAULT_HINT_MODE: "full",
};

// Apply URL query overrides. Example params:
//  ?showHints=false&showCpuStrength=false&showAiManual=true&defaultStrength=normal&forceStrength=hard
function parseBool(v) {
	if (v === "true") return true;
	if (v === "false") return false;
	return null;
}

function applyUrlOverrides() {
	try {
		const params = new URLSearchParams(window.location.search);
		if (params.has("showHints")) {
			const b = parseBool(params.get("showHints"));
			if (b !== null) CONFIG.SHOW_HINT_CONTROLS = b;
		}
		if (params.has("showCpuStrength")) {
			const b = parseBool(params.get("showCpuStrength"));
			if (b !== null) CONFIG.SHOW_CPU_STRENGTH_SELECT = b;
		}
		if (params.has("showAiManual")) {
			const b = parseBool(params.get("showAiManual"));
			if (b !== null) CONFIG.SHOW_AI_MANUAL_TOGGLE = b;
		}
		if (params.has("defaultStrength")) {
			CONFIG.DEFAULT_CPU_STRENGTH =
				params.get("defaultStrength") || CONFIG.DEFAULT_CPU_STRENGTH;
		}

		// Hint overrides: hints=1|0|true|false and hintMode=full|simple
		if (params.has("hints")) {
			const val = params.get("hints");
			const b = parseBool(val === "1" ? "true" : val === "0" ? "false" : val);
			if (b !== null) CONFIG.SHOW_HINTS_BY_DEFAULT = b;
		}
		if (params.has("hintMode")) {
			const mode = params.get("hintMode");
			if (mode === "full" || mode === "simple") CONFIG.DEFAULT_HINT_MODE = mode;
		}

		// Accept CPU strength via several param names for convenience: CPU_STRENGTH, cpuStrength, cpu_strength
		if (
			params.has("CPU_STRENGTH") ||
			params.has("cpuStrength") ||
			params.has("cpu_strength")
		) {
			const sval =
				params.get("CPU_STRENGTH") ||
				params.get("cpuStrength") ||
				params.get("cpu_strength");
			if (sval) CONFIG.DEFAULT_CPU_STRENGTH = sval;
		}
		if (params.has("forceStrength")) {
			const v = params.get("forceStrength");
			CONFIG.FORCE_CPU_STRENGTH =
				v === "null" ? null : v || CONFIG.FORCE_CPU_STRENGTH;
		}
	} catch (e) {
		// ignore in non-browser contexts
	}
}

applyUrlOverrides();

// Debug: log the effective CONFIG and current URL so we can verify overrides in the browser console
try {
	console.info("CONFIG (after URL overrides):", CONFIG);
	console.info(
		"location.search:",
		typeof window !== "undefined" ? window.location.search : null,
	);
} catch (e) {
	/* ignore when not running in browser */
}

export default CONFIG;
