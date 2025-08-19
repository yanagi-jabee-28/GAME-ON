// Development test helpers moved out of main.js
(function () {
	'use strict';

	// runBatchDrop and drop2500 expect the page to expose dropBall, updateStats, Composite, world, and related globals.
	function runBatchDrop(count, intervalMs = 10, settleMs = 5000, options = {}) {
		if (!count || count <= 0) return Promise.resolve(null);
    		// reset counters if present
		if (typeof window.totalDrops !== 'undefined') { window.totalDrops = 0; }
		if (typeof window.orangeHits !== 'undefined') { window.orangeHits = 0; }
		if (typeof window.blueHits !== 'undefined') { window.blueHits = 0; }
		if (typeof window.missHits !== 'undefined') { window.missHits = 0; }
		// reset suppressed count tracker if available
		if (typeof window.resetBatchSuppressedCount === 'function') window.resetBatchSuppressedCount();
		if (typeof window.updateStats === 'function') window.updateStats();

		let dropped = 0;
		return new Promise((resolve) => {
			// allowRespawn option: when true, do not suppress automatic respawns
			const allowRespawn = !!options.allowRespawn;
			window.__BATCH_NO_RESPAWN = !allowRespawn;
			const iv = setInterval(() => {
				if (typeof window.dropBall === 'function') window.dropBall(options);
				dropped++;
				if (dropped >= count) {
					clearInterval(iv);
					setTimeout(() => {
						const stats = {
							total: window.totalDrops || 0,
							orange: window.orangeHits || 0,
							blue: window.blueHits || 0,
							miss: window.missHits || 0,
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
						resolve(stats);
					}, settleMs);
				}
			}, intervalMs);
		});
	}

	window.runBatchDrop = runBatchDrop;
	window.drop2500 = function () {
		window.CONFIG = window.CONFIG || {};
		window.CONFIG.BALLS_INTERACT = false;
		return runBatchDrop(2500, 8, 8000);
	};

})();
