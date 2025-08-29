// Simple adapter to embed GAME-SLOT-1 into the pachinko page and provide a programmatic API.
(function () {
	// Diagnostic: mark adapter load and expose quick helpers for debugging
	try {
		console.log('[EmbeddedSlotAdapter] loaded');
		window.__EmbeddedSlotAdapterLoadedAt = Date.now();
		// simple helper to manually trigger a spin from console
		window.__EmbeddedSlotAdapterTrigger = function () {
			try { console.log('[EmbeddedSlotAdapter] manual trigger startSpin'); return window.EmbeddedSlot && typeof window.EmbeddedSlot.startSpin === 'function' ? window.EmbeddedSlot.startSpin() : null; }
			catch (e) { console.warn('[EmbeddedSlotAdapter] manual trigger error', e); }
		};
	} catch (e) { /* no-op */ }
	// Configuration: selector within GAME-SLOT-1 index.html for the slot container
	const EMBED_CONTAINER_ID = 'embedded-slot-container';
	const EMBED_AREA_ID = 'embedded-slot-area';

	// Helper to copy the slot HTML from GAME-SLOT-1 index.html into the embed container.
	function injectSlotHtml() {
		// Build minimal slot markup expected by script.js from GAME-SLOT-1
		const container = document.getElementById(EMBED_CONTAINER_ID);
		if (!container) return false;

		// If the slot markup already exists, skip
		if (container.querySelector('.slot-container')) {
			console.debug('EmbeddedSlot: slot markup already present, skipping inject');
			return true;
		}

		console.debug('EmbeddedSlot: injecting slot markup into', container);

		// Create a basic structure compatible with GAME-SLOT-1
		const slotDiv = document.createElement('div');
		slotDiv.className = 'slot-container';
		slotDiv.id = 'slot-machine';

		// manual controls and buttons that script.js expects
		const manualControls = document.createElement('div');
		manualControls.className = 'manual-controls';
		manualControls.id = 'manualControls';

		const stopBtn0 = document.createElement('button');
		stopBtn0.className = 'stop-btn';
		stopBtn0.id = 'stopBtn0';
		stopBtn0.textContent = '1';
		const stopBtn1 = document.createElement('button');
		stopBtn1.className = 'stop-btn';
		stopBtn1.id = 'stopBtn1';
		stopBtn1.textContent = '2';
		const stopBtn2 = document.createElement('button');
		stopBtn2.className = 'stop-btn';
		stopBtn2.id = 'stopBtn2';
		stopBtn2.textContent = '3';

		manualControls.appendChild(stopBtn0);
		manualControls.appendChild(stopBtn1);
		manualControls.appendChild(stopBtn2);

		const leverBtn = document.createElement('button');
		leverBtn.className = 'lever';
		leverBtn.id = 'slotLever';
		leverBtn.setAttribute('aria-label', 'レバー');
		// hide visual lever optional
		leverBtn.style.display = 'none';

		const actionBtn = document.createElement('button');
		actionBtn.id = 'actionBtn';
		actionBtn.textContent = '▶ スタート';
		// show action button so testing is easy
		actionBtn.style.display = '';

		// Mode button (目押し/自動 切替) - some slot code expects this element
		const modeBtn = document.createElement('button');
		modeBtn.id = 'modeBtn';
		modeBtn.className = 'mode-btn';
		modeBtn.textContent = 'モード';
		// keep it hidden by default (visual can be enabled by embedder)
		modeBtn.style.display = 'none';

		// Insert into container
		container.appendChild(slotDiv);
		container.appendChild(manualControls);
		container.appendChild(leverBtn);
		container.appendChild(actionBtn);
		container.appendChild(modeBtn);

		console.debug('EmbeddedSlot: injected slot-machine and controls');

		return true;
	}

	// Public API
	const API = {
		init: function (opts) {
			opts = opts || {};
			const area = document.getElementById(EMBED_AREA_ID);
			if (!area) return false;
			// Show embedded area if requested
			if (opts.show !== false) area.style.display = '';
			injectSlotHtml();
			// If the slot script exposed instance (SLOT_GAME_INSTANCE), use it; otherwise try to wait until available.
			API._instance = window.SLOT_GAME_INSTANCE || null;
			if (!API._instance) {
				// attempt to find after a short delay
				setTimeout(() => { API._instance = window.SLOT_GAME_INSTANCE || null; }, 200);
			}
			// If still not instantiated, and createSlotIn exists, try to create immediately
			if (!API._instance && typeof window.createSlotIn === 'function') {
				console.debug('EmbeddedSlot: attempting createSlotIn fallback');
				try {
					const created = window.createSlotIn('#slot-machine');
					if (created) {
						API._instance = created;
						console.debug('EmbeddedSlot: createSlotIn succeeded', created);
					} else {
						console.debug('EmbeddedSlot: createSlotIn returned null');
					}
				} catch (e) { console.warn('EmbeddedSlot: createSlotIn error', e); }
			}
			// If the SlotGame class is available but its DOMContentLoaded handler didn't run
			// (e.g. scripts loaded after DOMContentLoaded), instantiate it here as a fallback.
			try {
				if (!API._instance && typeof window.SlotGame === 'function') {
					const slotEl = document.getElementById('slot-machine');
					const cfg = (typeof window.gameConfig === 'object' && window.gameConfig) ? window.gameConfig : {};
					try {
						if (slotEl) {
							// prefer embedder-friendly helper if available
							if (typeof window.createSlotIn === 'function') {
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
									window.__EmbeddedSlotLastError = instErr && (instErr.stack || instErr.message || String(instErr));
									console.warn('EmbeddedSlot: SlotGame instantiation failed:', instErr);
								}
							}
						} else {
							console.warn('EmbeddedSlot: fallback instantiation skipped because #slot-machine not found');
						}
					} catch (e) { /* no-op */ }
				}
			} catch (_) { /* no-op */ }
			return true;
		},
		startSpin: function () {
			if (!API._instance) {
				// attempt to initialize on-demand
				try {
					API.init({ show: true });
					API._instance = window.SLOT_GAME_INSTANCE || API._instance;
				} catch (e) {
					window.__EmbeddedSlotLastError = e && (e.stack || e.message || String(e));
					console.warn('EmbeddedSlot: lazy init failed in startSpin:', e);
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
							try { API._instance.startGame(); }
							catch (e) { window.__EmbeddedSlotLastError = e && (e.stack || e.message || String(e)); }
						} else if (attempts >= maxAttempts) {
							clearInterval(iv);
							console.warn('EmbeddedSlot: instance not available after polling attempts');
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
				console.error('Failed to start embedded slot:', e);
				return false;
			}
		},
		stopSpin: function () {
			if (!API._instance) return false;
			try {
				if (typeof API._instance.stopReel === 'function') {
					// best-effort: stop all reels immediately
					for (let i = 0; i < (API._instance.reels || []).length; i++) {
						try { API._instance.stopReel(i); } catch (e) { /* ignore */ }
					}
				}
				return true;
			} catch (e) { return false; }
		},
		getInstance: function () { return API._instance; },
		_instance: null
	};

	// expose on window
	window.EmbeddedSlot = API;

	// Diagnostic helper for runtime debugging
	API.diagnose = function () {
		try {
			console.groupCollapsed && console.groupCollapsed('EmbeddedSlot.diagnose');
			console.log('embedded container (#' + EMBED_CONTAINER_ID + '):', !!document.getElementById(EMBED_CONTAINER_ID));
			const slotEl = document.getElementById('slot-machine');
			console.log('#slot-machine element present:', !!slotEl, slotEl);
			console.log('window.SLOT_GAME_INSTANCE:', !!window.SLOT_GAME_INSTANCE, window.SLOT_GAME_INSTANCE);
			console.log('window.createSlotIn:', typeof window.createSlotIn === 'function');
			if (!slotEl) console.warn('no #slot-machine found inside embed container.');
			if (!window.SLOT_GAME_INSTANCE && typeof window.createSlotIn === 'function' && slotEl) {
				console.log('Attempting to instantiate via createSlotIn...');
				const inst = window.createSlotIn(slotEl, window.gameConfig || {});
				console.log('createSlotIn returned:', inst);
			}
			console.groupEnd && console.groupEnd();
		} catch (e) { console.warn('EmbeddedSlot.diagnose error', e); }
	};

	// Auto-init when pachinko page loads so the embedded slot is visible for testing
	if (typeof window !== 'undefined' && window.addEventListener) {
		window.addEventListener('DOMContentLoaded', () => {
			try {
				// show embedded area and init
				const area = document.getElementById('embedded-slot-area');
				if (area) area.style.display = '';
				API.init({ show: true });
				// make injected action button visible for quick manual testing
				const ab = document.getElementById('actionBtn');
				if (ab) ab.style.display = '';
			} catch (_) { /* no-op */ }
		});
	}

	// (disabled) no auto linkage with pachinko sensors

	// If script runs after DOMContentLoaded, attempt immediate init
	try {
		if (document.readyState === 'complete' || document.readyState === 'interactive') {
			const area = document.getElementById('embedded-slot-area');
			if (area) area.style.display = '';
			API.init({ show: true });
			const ab2 = document.getElementById('actionBtn');
			if (ab2) ab2.style.display = '';
		}
	} catch (e) { /* no-op */ }
})();
