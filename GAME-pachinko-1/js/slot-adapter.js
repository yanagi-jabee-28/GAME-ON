// Simple adapter to embed GAME-SLOT-1 into the pachinko page and provide a programmatic API.

import { gameConfig } from "../../GAME-SLOT-1/config";

// Diagnostic: mark adapter load and expose quick helpers for debugging
try {
	console.log("[EmbeddedSlotAdapter] loaded");
	window.__EmbeddedSlotAdapterLoadedAt = Date.now();
	// simple helper to manually trigger a spin from console
	window.__EmbeddedSlotAdapterTrigger = () => {
		try {
			console.log("[EmbeddedSlotAdapter] manual trigger startSpin");
			return window.EmbeddedSlot &&
				typeof window.EmbeddedSlot.startSpin === "function"
				? window.EmbeddedSlot.startSpin()
				: null;
		} catch (e) {
			console.warn("[EmbeddedSlotAdapter] manual trigger error", e);
		}
	};
} catch (e) {
	/* no-op */
}
// Configuration: selector within GAME-SLOT-1 index.html for the slot container
const EMBED_CONTAINER_ID = "embedded-slot-container";
const EMBED_AREA_ID = "embedded-slot-area";

// Spin queue: when pachinko hits while slot is spinning, queue and spin after stop
let __pendingQueuedSpins = 0;
let __outstandingHits = 0; // ランプ点灯で表す「未消化のヒット数」（進行中スピン含む）
function __isSlotSpinning() {
	try {
		return !!(API && API._instance && API._instance.isSpinning);
	} catch (_) {
		return false;
	}
}
function __tryStartOrQueueSpin(reason) {
	try {
		if (__isSlotSpinning()) {
			__pendingQueuedSpins++;
			return "queued";
		}
		API.startSpin();
		return "started";
	} catch (_) {
		return "error";
	}
}

// Helper to copy the slot HTML from GAME-SLOT-1 index.html into the embed container.
function injectSlotHtml() {
	// Build minimal slot markup expected by script.js from GAME-SLOT-1
	const container = document.getElementById(EMBED_CONTAINER_ID);
	if (!container) return false;

	// If the slot markup already exists, skip
	if (container.querySelector(".slot-container")) {
		console.debug("EmbeddedSlot: slot markup already present, skipping inject");
		return true;
	}

	console.debug("EmbeddedSlot: injecting slot markup into", container);

	// Create a basic structure compatible with GAME-SLOT-1
	const slotDiv = document.createElement("div");
	slotDiv.className = "slot-container";
	slotDiv.id = "slot-machine";

	// manual controls and buttons that script.js expects
	const manualControls = document.createElement("div");
	manualControls.className = "manual-controls";
	manualControls.id = "manualControls";

	const stopBtn0 = document.createElement("button");
	stopBtn0.className = "stop-btn";
	stopBtn0.id = "stopBtn0";
	stopBtn0.textContent = "1";
	const stopBtn1 = document.createElement("button");
	stopBtn1.className = "stop-btn";
	stopBtn1.id = "stopBtn1";
	stopBtn1.textContent = "2";
	const stopBtn2 = document.createElement("button");
	stopBtn2.className = "stop-btn";
	stopBtn2.id = "stopBtn2";
	stopBtn2.textContent = "3";

	manualControls.appendChild(stopBtn0);
	manualControls.appendChild(stopBtn1);
	manualControls.appendChild(stopBtn2);

	const leverBtn = document.createElement("button");
	leverBtn.className = "lever";
	leverBtn.id = "slotLever";
	leverBtn.setAttribute("aria-label", "レバー");
	// hide visual lever optional
	leverBtn.style.display = "none";

	const actionBtn = document.createElement("button");
	actionBtn.id = "actionBtn";
	actionBtn.textContent = "▶ スタート";
	// show action button so testing is easy
	actionBtn.style.display = "";

	// Mode button (目押し/自動 切替) - some slot code expects this element
	const modeBtn = document.createElement("button");
	modeBtn.id = "modeBtn";
	modeBtn.className = "mode-btn";
	modeBtn.textContent = "モード";
	// keep it hidden by default (visual can be enabled by embedder)
	modeBtn.style.display = "none";

	// Insert into container
	container.appendChild(slotDiv);
	container.appendChild(manualControls);
	container.appendChild(leverBtn);
	container.appendChild(actionBtn);
	container.appendChild(modeBtn);

	console.debug("EmbeddedSlot: injected slot-machine and controls");

	return true;
}

// Public API
const API = {
	init: (opts) => {
		opts = opts || {};
		const area = document.getElementById(EMBED_AREA_ID);
		if (!area) return false;
		// Show embedded area if requested
		if (opts.show !== false) area.style.display = "";
		injectSlotHtml();
		// If the slot script exposed instance (SLOT_GAME_INSTANCE), use it; otherwise try to wait until available.
		API._instance = window.SLOT_GAME_INSTANCE || null;
		if (!API._instance) {
			// attempt to find after a short delay
			setTimeout(() => {
				API._instance = window.SLOT_GAME_INSTANCE || null;
			}, 200);
		}
		// If still not instantiated, and createSlotIn exists, try to create immediately
		if (!API._instance && typeof window.createSlotIn === "function") {
			console.debug("EmbeddedSlot: attempting createSlotIn fallback");
			try {
				const created = window.createSlotIn("#slot-machine");
				if (created) {
					API._instance = created;
					console.debug("EmbeddedSlot: createSlotIn succeeded", created);
				} else {
					console.debug("EmbeddedSlot: createSlotIn returned null");
				}
			} catch (e) {
				console.warn("EmbeddedSlot: createSlotIn error", e);
			}
		}
		// If the SlotGame class is available but its DOMContentLoaded handler didn't run
		// (e.g. scripts loaded after DOMContentLoaded), instantiate it here as a fallback.
		try {
			if (!API._instance && typeof window.SlotGame === "function") {
				const slotEl = document.getElementById("slot-machine");
				const cfg = { ...gameConfig };

				try {
					if (slotEl) {
						// prefer embedder-friendly helper if available
						if (typeof window.createSlotIn === "function") {
							const created = window.createSlotIn(slotEl, cfg);
							if (created) {
								API._instance = created;
								window.SLOT_GAME_INSTANCE = created;
							}
						} else {
							try {
								window.SLOT_GAME_INSTANCE = new window.SlotGame(slotEl, cfg);
								API._instance = window.SLOT_GAME_INSTANCE;
							} catch (instErr) {
								window.__EmbeddedSlotLastError =
									instErr &&
									(instErr.stack || instErr.message || String(instErr));
								console.warn(
									"EmbeddedSlot: SlotGame instantiation failed:",
									instErr,
								);
							}
						}
					} else {
						console.warn(
							"EmbeddedSlot: fallback instantiation skipped because #slot-machine not found",
						);
					}
				} catch (e) {
					/* no-op */
				}
			}
		} catch (_) {
			/* no-op */
		}
		return true;
	},
	startSpin: () => {
		if (!API._instance) {
			// attempt to initialize on-demand
			try {
				API.init({ show: true });
				API._instance = window.SLOT_GAME_INSTANCE || API._instance;
			} catch (e) {
				window.__EmbeddedSlotLastError =
					e && (e.stack || e.message || String(e));
				console.warn("EmbeddedSlot: lazy init failed in startSpin:", e);
			}
			if (!API._instance) {
				// schedule a short polling to wait for instance creation (createSlotIn or DOMContentLoaded)
				let attempts = 0;
				const maxAttempts = 20; // ~20 * 150ms = 3s
				const iv = setInterval(() => {
					attempts++;
					API._instance = window.SLOT_GAME_INSTANCE || API._instance;
					if (API._instance) {
						clearInterval(iv);
						try {
							API._instance.startGame();
						} catch (e) {
							window.__EmbeddedSlotLastError =
								e && (e.stack || e.message || String(e));
						}
					} else if (attempts >= maxAttempts) {
						clearInterval(iv);
						console.warn(
							"EmbeddedSlot: instance not available after polling attempts",
						);
					}
				}, 150);
				// return true to indicate a start was scheduled
				return true;
			}
		}
		try {
			API._instance.startGame();
			return true;
		} catch (e) {
			window.__EmbeddedSlotLastError = e && (e.stack || e.message || String(e));
			console.error("Failed to start embedded slot:", e);
			return false;
		}
	},
	stopSpin: () => {
		if (!API._instance) return false;
		try {
			if (typeof API._instance.stopReel === "function") {
				// best-effort: stop all reels immediately
				for (let i = 0; i < (API._instance.reels || []).length; i++) {
					try {
						API._instance.stopReel(i);
					} catch (e) {
						/* ignore */
					}
				}
			}
			return true;
		} catch (e) {
			return false;
		}
	},
	getInstance: () => API._instance,
	_instance: null,
};

// expose on window
window.EmbeddedSlot = API;

// Diagnostic helper for runtime debugging
API.diagnose = () => {
	try {
		console.groupCollapsed && console.groupCollapsed("EmbeddedSlot.diagnose");
		console.log(
			"embedded container (#" + EMBED_CONTAINER_ID + "):",
			!!document.getElementById(EMBED_CONTAINER_ID),
		);
		const slotEl = document.getElementById("slot-machine");
		console.log("#slot-machine element present:", !!slotEl, slotEl);
		console.log(
			"window.SLOT_GAME_INSTANCE:",
			!!window.SLOT_GAME_INSTANCE,
			window.SLOT_GAME_INSTANCE,
		);
		console.log(
			"window.createSlotIn:",
			typeof window.createSlotIn === "function",
		);
		if (!slotEl) console.warn("no #slot-machine found inside embed container.");
		if (
			!window.SLOT_GAME_INSTANCE &&
			typeof window.createSlotIn === "function" &&
			slotEl
		) {
			console.log("Attempting to instantiate via createSlotIn...");
			const inst = window.createSlotIn(slotEl, { ...gameConfig });
			console.log("createSlotIn returned:", inst);
		}
		console.groupEnd && console.groupEnd();
	} catch (e) {
		console.warn("EmbeddedSlot.diagnose error", e);
	}
};

// Simple Win Lamps UI (visual counter of wins)
function ensureLampStyles() {
	if (document.getElementById("slot-win-lamp-style")) return;
	const style = document.createElement("style");
	style.id = "slot-win-lamp-style";
	style.textContent = `
			#winLampPanel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 6px}
			/* Match other UI message color (default text color used across the page) */
			#winLampPanel .label{font-weight:600;color:#222}
			#winLampPanel .count{font-variant-numeric:tabular-nums;color:#222}
			#winLampPanel .lamps{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
			#winLampPanel .lamp{width:14px;height:14px;border-radius:50%;border:1px solid #222;background:#111;box-shadow:none}
			#winLampPanel .lamp.on{background:#e53935;border-color:#8b0000;box-shadow:0 0 8px rgba(244,67,54,.9)}
			@media (prefers-color-scheme: dark){
				/* Slightly muted in dark mode but maintain sufficient contrast */
				#winLampPanel .label{color:#eee}
				#winLampPanel .count{color:#ddd}
			}
		`;
	document.head.appendChild(style);
}

function ensureLampPanel() {
	ensureLampStyles();
	const area = document.getElementById("embedded-slot-area");
	const sliderInfo = document.querySelector(".slider-info");
	const mount = area || document.body;
	let panel = document.getElementById("winLampPanel");
	if (!panel) {
		panel = document.createElement("div");
		panel.id = "winLampPanel";
		const label = document.createElement("span");
		label.className = "label";
		label.textContent = "当たり:";
		// Ensure visible color even if page styles are overriding generic .label rules
		label.style.color = "#222";
		label.style.fontWeight = "600";
		const count = document.createElement("span");
		count.id = "winLampCount";
		count.className = "count";
		count.textContent = "0/6";
		count.style.color = "#222";
		count.style.fontVariantNumeric = "tabular-nums";
		const lamps = document.createElement("div");
		lamps.id = "winLampList";
		lamps.className = "lamps";
		panel.appendChild(label);
		panel.appendChild(count);
		panel.appendChild(lamps);
		// Prefer placing just above the slider block
		if (sliderInfo && sliderInfo.parentNode) {
			sliderInfo.parentNode.insertBefore(panel, sliderInfo);
		} else if (area && area.firstChild) {
			// fallback: top of embedded area
			mount.insertBefore(panel, area.firstChild);
		} else {
			// final fallback: body end
			mount.appendChild(panel);
		}
		// initialize 6 black lamps if empty
		for (let i = 0; i < 6; i++) {
			const s = document.createElement("span");
			s.className = "lamp";
			lamps.appendChild(s);
		}
	}
	// If panel exists but is not positioned above the slider, move it
	else if (sliderInfo && sliderInfo.parentNode) {
		try {
			if (
				panel.nextElementSibling !== sliderInfo ||
				panel.parentNode !== sliderInfo.parentNode
			) {
				sliderInfo.parentNode.insertBefore(panel, sliderInfo);
			}
		} catch (_) {}
	}
	return panel;
}

function lightNextLamp() {
	const panel = ensureLampPanel();
	const list = document.getElementById("winLampList");
	if (!list) return;
	const lamps = Array.from(list.querySelectorAll(".lamp"));
	if (!lamps.length) return;
	const next = lamps.find((l) => !l.classList.contains("on"));
	if (next) {
		next.classList.add("on");
		const lit = lamps.filter((l) => l.classList.contains("on")).length;
		const cntEl = document.getElementById("winLampCount");
		if (cntEl) cntEl.textContent = `${lit}/6`;
	}
}

function turnOffOldestLamp() {
	const list = document.getElementById("winLampList");
	if (!list) return;
	const lamps = Array.from(list.querySelectorAll(".lamp"));
	const oldestOn = lamps.find((l) => l.classList.contains("on"));
	if (oldestOn) {
		oldestOn.classList.remove("on");
		const lit = lamps.filter((l) => l.classList.contains("on")).length;
		const cntEl = document.getElementById("winLampCount");
		if (cntEl) cntEl.textContent = `${lit}/6`;
	}
}

// Always left-justify: first N lamps are red, the rest black
function updateLampDisplay(desiredCount) {
	ensureLampPanel();
	const list = document.getElementById("winLampList");
	if (!list) return;
	const lamps = Array.from(list.querySelectorAll(".lamp"));
	const n = Math.max(0, Math.min(desiredCount | 0, lamps.length));
	lamps.forEach((lamp, idx) => {
		if (idx < n) lamp.classList.add("on");
		else lamp.classList.remove("on");
	});
	const cntEl = document.getElementById("winLampCount");
	if (cntEl) cntEl.textContent = `${n}/${lamps.length}`;
}

// listen pachinko hit events (sensor passes) -> light lamp and spin (queue if needed)
try {
	window.addEventListener("pachi:hit", () => {
		try {
			__outstandingHits++;
			updateLampDisplay(__outstandingHits);
		} catch (_) {}
		__tryStartOrQueueSpin("pachi:hit");
	});
} catch (_) {}

// when slot fully stops, consume one queued spin if any
try {
	window.addEventListener("slot:stopped", () => {
		try {
			// 完了したスピン分、最古のランプを1つ消灯（未消化ヒット数を減算）
			if (__outstandingHits > 0) {
				__outstandingHits--;
				updateLampDisplay(__outstandingHits);
			}
			// まだ保留があれば次を開始
			if (__pendingQueuedSpins > 0) {
				__pendingQueuedSpins--;
				API.startSpin();
			}
		} catch (_) {}
	});
} catch (_) {}

// Override slot's own win overlay with config-based message and adjusted amount
try {
	window.addEventListener("slot:win", (ev) => {
		try {
			const amount = Number(ev?.detail?.amount) || 0;
			const mult = Number(
				(window.GAME_CONFIG &&
					GAME_CONFIG.rewards &&
					GAME_CONFIG.rewards.slotWinAmmoMultiplier) ||
					0,
			);
			const adjusted =
				amount > 0 && mult > 0 && Number.isFinite(mult)
					? Math.floor(amount * mult)
					: amount;
			const templ =
				(window.GAME_CONFIG &&
					GAME_CONFIG.rewards &&
					GAME_CONFIG.rewards.slotWinMessageTemplate) ||
				"";
			const msg = templ
				? String(templ)
						.replaceAll("{amount}", String(amount))
						.replaceAll("{mult}", String(mult))
						.replaceAll("{adjusted}", String(adjusted))
				: "";
			const wm = document.getElementById("winMessage");
			if (wm) {
				const amtEl = wm.querySelector(".amount");
				if (amtEl) amtEl.textContent = `¥${(adjusted || 0).toLocaleString()}`;
				const subEl = wm.querySelector(".sub");
				if (subEl && msg) subEl.textContent = msg;
			}
		} catch (_) {
			/* no-op */
		}
	});
} catch (_) {
	/* no-op */
}

// Auto-init when pachinko page loads so the embedded slot is visible for testing
if (typeof window !== "undefined" && window.addEventListener) {
	window.addEventListener("DOMContentLoaded", () => {
		try {
			// show embedded area and init
			const area = document.getElementById("embedded-slot-area");
			if (area) area.style.display = "";
			API.init({ show: true });
			// make injected action button visible for quick manual testing
			const ab = document.getElementById("actionBtn");
			if (ab) ab.style.display = "";
			// prepare lamps
			ensureLampPanel();
		} catch (_) {
			/* no-op */
		}
	});
}

// (disabled) no auto linkage with pachinko sensors

// If script runs after DOMContentLoaded, attempt immediate init
try {
	if (
		document.readyState === "complete" ||
		document.readyState === "interactive"
	) {
		const area = document.getElementById("embedded-slot-area");
		if (area) area.style.display = "";
		API.init({ show: true });
		const ab2 = document.getElementById("actionBtn");
		if (ab2) ab2.style.display = "";
		ensureLampPanel();
	}
} catch (e) {
	/* no-op */
}

// --- NEW: Pachinko Volume Control Integration ---
/**
 * Reads volume settings from GAME_CONFIG and applies them to the slot's sound manager.
 */
function applyPachinkoVolumeSettings() {
	const pachiCfg = window.GAME_CONFIG;
	const slotAudioCfg = pachiCfg && pachiCfg.slotAudio;
	const slotInstance = window.SLOT_GAME_INSTANCE;
	const soundManager = slotInstance && slotInstance.soundManager;

	if (!slotAudioCfg || !soundManager) {
		console.debug(
			"[SlotAdapter] Volume settings or sound manager not ready, skipping.",
		);
		return;
	}

	console.log("[SlotAdapter] Applying volume settings from Pachinko config...");

	// Apply master volume
	if (
		typeof slotAudioCfg.masterVolume === "number" &&
		typeof soundManager.setMasterVolume === "function"
	) {
		soundManager.setMasterVolume(slotAudioCfg.masterVolume);
	}

	// Apply individual volumes
	if (slotAudioCfg.volumes) {
		for (const kind in slotAudioCfg.volumes) {
			const volume = slotAudioCfg.volumes[kind];
			if (
				typeof volume === "number" &&
				typeof soundManager.setPerVolume === "function"
			) {
				soundManager.setPerVolume(kind, volume);
			}
		}
	}
}

// Apply settings after the slot game has had a chance to initialize.
window.addEventListener("DOMContentLoaded", () => {
	// A short delay ensures the slot instance and its sound manager are ready.
	setTimeout(applyPachinkoVolumeSettings, 500);
});
