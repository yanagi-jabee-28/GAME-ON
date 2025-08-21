// physics.js
// 物理周りの更新ロジックを分離してテスト可能にするモジュール
(function () {
	'use strict';

	const Physics = {};

	// internal registries
	const _balls = new Set();
	// reuse array for removals to avoid per-frame allocation churn
	const _toRemove = [];

	// Register / unregister balls so PHYSICS can manage light-weight bookkeeping
	Physics.registerBall = function (body) { if (body) _balls.add(body); };
	Physics.unregisterBall = function (body) { if (body) _balls.delete(body); };
	Physics.getRegisteredBalls = function () { return Array.from(_balls); };

	// windmill rotation update
	Physics.updateWindmills = function (windmills, options) {
		options = options || {};
		const maxStep = (typeof options.maxAngularStep === 'number') ? options.maxAngularStep : 0.08;
		// scale angular step by delta time so rotation is frame-rate independent
		const delta = (typeof options.delta === 'number' && options.delta > 0) ? options.delta : 16.6667;
		const timeScale = Math.max(0.0001, delta / 16.6667);
		for (let i = 0; i < windmills.length; i++) {
			const w = windmills[i];
			let step = (w.speed || 0) * timeScale;
			if (Math.abs(step) > maxStep) step = (step > 0) ? maxStep : -maxStep;
			// Apply a small incremental rotation instead of setting absolute angle.
			// Using rotate for small deltas is cheaper and reduces solver instability
			// when rotating static/compound bodies every frame.
			try { Matter.Body.rotate(w.body, step); } catch (e) { /* ignore */ }
		}
	};

	// Apply air drag and terminal velocity to registered balls.
	// This function is intentionally allocation-light and operates directly on bodies.
	// options: { delta } in ms
	Physics.updateBalls = function (options) {
		options = options || {};
		const delta = (typeof options.delta === 'number' && options.delta > 0) ? options.delta : 16.6667;
		// dt in seconds
		const dt = delta / 1000;
		const cfg = (window.CONFIG || {});
		const dragK = (typeof cfg.AIR_DRAG === 'number') ? cfg.AIR_DRAG : 0;
		const terminal = (typeof cfg.TERMINAL_VELOCITY === 'number' && cfg.TERMINAL_VELOCITY > 0) ? cfg.TERMINAL_VELOCITY : 0;
		// Precompute multiplicative factor for velocity per-frame: v *= exp(-dragK * dt)
		const dragFactor = (dragK > 0) ? Math.exp(-dragK * dt) : 1;
		for (const b of _balls) {
			try {
				// skip bodies that are static or sleeping
				if (b.isStatic || b.isSleeping) continue;
				let vx = b.velocity.x, vy = b.velocity.y;
				// apply drag multiplicatively
				vx *= dragFactor; vy *= dragFactor;
				// enforce terminal velocity if set
				if (terminal > 0) {
					const speed = Math.hypot(vx, vy);
					if (speed > terminal) {
						const s = terminal / speed;
						vx *= s; vy *= s;
					}
				}
				// directly set velocity on body
				Matter.Body.setVelocity(b, { x: vx, y: vy });
			} catch (e) { /* ignore per-body failures */ }
		}
	};

	// Lightweight sweep helper: predict crossings for registered balls against targets
	// targets: array of bodies to test (with bounds)
	// callback(ball, target) is invoked when a crossing is detected (approx.)
	Physics.sweepAndDetect = function (targets, callback, options) {
		if (!Array.isArray(targets) || typeof callback !== 'function') return;
		options = options || {};
		const cfgGameHeight = (window.CONFIG && window.CONFIG.GAME_HEIGHT) ? window.CONFIG.GAME_HEIGHT : 700;
		const offscreenY = cfgGameHeight + 300;
		// reuse toRemove buffer
		_toRemove.length = 0;

		// micro-optimizations: cache frequently used locals
		const targetsLen = targets.length;
		if (targetsLen === 0) return;

		for (const ball of _balls) {
			if (ball.isHitting) continue;
			const prev = ball.lastPos || ball.position;
			const curr = ball.position;
			const dy = curr.y - prev.y;
			// only proceed when ball is moving downward enough to possibly cross targets
			if (dy > 0.05) {
				const dx = curr.x - prev.x;
				for (let i = 0; i < targetsLen; i++) {
					const target = targets[i];
					const tminY = target.bounds.min.y;
					if (prev.y < tminY && curr.y >= tminY) {
						const tRatio = (tminY - prev.y) / (dy || 1);
						const xCross = prev.x + dx * tRatio;
						if (xCross >= target.bounds.min.x - 3 && xCross <= target.bounds.max.x + 3) {
							callback(ball, target);
							break;
						}
					}
				}
			}
			// mark for removal - defer actual Composite.remove to caller/periodic cleaner
			if (curr.y > offscreenY) {
				_toRemove.push(ball);
				_balls.delete(ball);
			}
			// update lastPos in-place to reduce allocations
			if (!ball.lastPos) ball.lastPos = { x: curr.x, y: curr.y };
			else { ball.lastPos.x = curr.x; ball.lastPos.y = curr.y; }
		}
		// perform removals in a short loop outside of iteration to avoid iterator invalidation
		if (_toRemove.length) {
			try {
				const world = options.world || ((window.engine && window.engine.world) ? window.engine.world : null);
				for (let i = 0; i < _toRemove.length; i++) {
					try { if (world) Matter.Composite.remove(world, _toRemove[i]); } catch (e) { /* ignore individual failures */ }
				}
			} catch (e) { /* ignore */ }
		}
	};

	// export
	if (typeof window !== 'undefined') window.PHYSICS = Physics;
	if (typeof module !== 'undefined' && module.exports) module.exports = Physics;
})();

