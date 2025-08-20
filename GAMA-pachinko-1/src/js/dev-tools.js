// Development test helpers moved out of main.js
(function () {
	'use strict';

	// runBatchDrop and drop2500 expect the page to expose dropBall, updateStats, Composite, world, and related globals.
	function runBatchDrop(count, intervalMs, settleMs = 5000, options = {}) {
		if (!count || count <= 0) return Promise.resolve(null);
		// reset internal counters if main exposes a reset helper
		if (typeof window.resetCounters === 'function') window.resetCounters();
		else {
			if (typeof window.totalDrops !== 'undefined') { window.totalDrops = 0; }
			if (typeof window.orangeHits !== 'undefined') { window.orangeHits = 0; }
			if (typeof window.blueHits !== 'undefined') { window.blueHits = 0; }
			if (typeof window.missHits !== 'undefined') { window.missHits = 0; }
		}
		// reset suppressed count tracker if available
		if (typeof window.resetBatchSuppressedCount === 'function') window.resetBatchSuppressedCount();
		// reset drop call counter and push an initial sync
		window.__DROP_CALLS = 0;
		if (typeof window.updateStats === 'function') window.updateStats();

		let dropped = 0;
		return new Promise((resolve) => {
			// allowRespawn option: when true, do not suppress automatic respawns
			const allowRespawn = !!options.allowRespawn;
			window.__BATCH_NO_RESPAWN = !allowRespawn;
			// force respawn override for main.js to consult
			if (allowRespawn) window.__FORCE_RESPAWN = true;
			// determine base interval (use config DROP_INTERVAL_MS by default)
			const baseInterval = (typeof intervalMs === 'number' && intervalMs > 0) ? intervalMs : ((window.CONFIG && window.CONFIG.DROP_INTERVAL_MS) || 80);
			const sim = (window.__SIM_SPEED && window.__SIM_SPEED > 0) ? window.__SIM_SPEED : 1;
			const usedInterval = Math.max(1, Math.round(baseInterval / sim));
			const usedSettle = Math.max(0, Math.round(settleMs / sim));

			const iv = setInterval(() => {
				if (typeof window.dropBall === 'function') window.dropBall(options);
				dropped++;
				if (dropped >= count) {
					clearInterval(iv);
					setTimeout(() => {
						// ensure latest stats from main are propagated
						if (typeof window.updateStats === 'function') window.updateStats();
						const stats = {
							total: window.totalDrops || 0,
							orange: window.orangeHits || 0,
							blue: window.blueHits || 0,
							miss: window.missHits || 0,
							dropCalls: window.__DROP_CALLS || 0,
							suppressedRespawns: window.__BATCH_SUPPRESSED_COUNT || 0,
							hitCount: (window.orangeHits || 0) + (window.blueHits || 0),
							hitRate: ((window.orangeHits || 0) + (window.blueHits || 0)) / Math.max(1, (window.totalDrops || 0))
						};
						console.log('runBatchDrop result:', stats);
						const o = document.createElement('div');
						o.style.position = 'absolute'; o.style.left = '50%'; o.style.top = '12px'; o.style.transform = 'translateX(-50%)';
						o.style.padding = '8px 12px'; o.style.background = 'rgba(0,0,0,0.7)'; o.style.color = 'white'; o.style.borderRadius = '6px';
						o.style.zIndex = 9999; o.textContent = `Batch ${count} -> hit ${Math.round(stats.hitRate * 10000) / 100}% (${stats.hitCount}/${stats.total})`;
						document.body.appendChild(o);
						setTimeout(() => o.remove(), 4000);
						// restore default: allow respawn
						window.__BATCH_NO_RESPAWN = false;
						if (allowRespawn) window.__FORCE_RESPAWN = false;
						resolve(stats);
					}, usedSettle);
				}
			}, usedInterval);
		});
	}

	window.runBatchDrop = runBatchDrop;
	window.drop2500 = function () {
		window.CONFIG = window.CONFIG || {};
		window.CONFIG.BALLS_INTERACT = false;
		// Temporarily speed up simulation while running the batch
		const prevSim = (window.__SIM_SPEED || 1);
		if (typeof window.setSimSpeed === 'function') window.setSimSpeed(Math.max(2, prevSim * 6));
		// call runBatchDrop without explicit intervalMs so it uses config DROP_INTERVAL_MS
		return runBatchDrop(2500, undefined, 8000, { allowRespawn: true }).then((s) => {
			// restore sim speed
			if (typeof window.setSimSpeed === 'function') window.setSimSpeed(prevSim);
			return s;
		}).catch((e) => { if (typeof window.setSimSpeed === 'function') window.setSimSpeed(prevSim); throw e; });
	};

	// Simple convenience wrapper used from the console: window.dorop(n)
	// Calls runBatchDrop with reasonable defaults and returns the Promise.
	// Usage: window.dorop(100) or window.dorop(100, { intervalMs: 12, settleMs: 6000, allowRespawn: false })
	window.dorop = function (count, opts) {
		if (!count || count <= 0) return Promise.resolve(null);
		opts = opts || {};
		const intervalMs = typeof opts.intervalMs === 'number' ? opts.intervalMs : 10;
		const settleMs = typeof opts.settleMs === 'number' ? opts.settleMs : 5000;
		const allowRespawn = !!opts.allowRespawn;
		return runBatchDrop(count, intervalMs, settleMs, { allowRespawn });
	};

	// Short alias for convenience: window.drop(n) -> forwards to window.dorop
	// Keeps backwards/typo-friendly console usage working.
	window.drop = function (count, opts) {
		if (typeof window.dorop === 'function') return window.dorop(count, opts);
		// fallback: if dorop isn't present, try runBatchDrop directly
		if (typeof window.runBatchDrop === 'function') return window.runBatchDrop(count, (opts && opts.intervalMs) || 10, (opts && opts.settleMs) || 5000, { allowRespawn: !!(opts && opts.allowRespawn) });
		return Promise.resolve(null);
	};

	// Convenience alias to control simulation speed from console: window.simSpeed(factor)
	// Example: window.simSpeed(4) -> 4x faster; window.simSpeed(1) -> normal
	window.simSpeed = function (factor) {
		if (typeof window.setSimSpeed === 'function') return window.setSimSpeed(factor);
		// fallback: set a global and try to update engine.timing if present
		window.__SIM_SPEED = factor;
		try { if (window.engine && window.engine.timing) window.engine.timing.timeScale = factor; } catch (e) { }
		return factor;
	};

	// Shortcut to switch peg preset from the console: window.pegPreset('none'|'default')
	window.pegPreset = function (name) {
		if (typeof window.setPegPreset === 'function') return window.setPegPreset(name);
		window.PEG_PRESET = name || 'default';
		return window.PEG_PRESET;
	};

})();
