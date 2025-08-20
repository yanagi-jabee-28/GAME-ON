// physics.js
// 物理周りの更新ロジックを分離してテスト可能にするモジュール
(function () {
	'use strict';

	const Physics = {};

	// internal registries
	const _balls = new Set();

	// Register / unregister balls so PHYSICS can manage light-weight bookkeeping
	Physics.registerBall = function (body) { if (body) _balls.add(body); };
	Physics.unregisterBall = function (body) { if (body) _balls.delete(body); };
	Physics.getRegisteredBalls = function () { return Array.from(_balls); };

	// windmill rotation update
	Physics.updateWindmills = function (windmills, options) {
		options = options || {};
		const maxStep = (typeof options.maxAngularStep === 'number') ? options.maxAngularStep : 0.08;
		for (let i = 0; i < windmills.length; i++) {
			const w = windmills[i];
			let step = w.speed || 0;
			if (Math.abs(step) > maxStep) step = (step > 0) ? maxStep : -maxStep;
			// Apply a small incremental rotation instead of setting absolute angle.
			// Using rotate for small deltas is cheaper and reduces solver instability
			// when rotating static/compound bodies every frame.
			try { Matter.Body.rotate(w.body, step); } catch (e) { /* ignore */ }
		}
	};

	// Lightweight sweep helper: predict crossings for registered balls against targets
	// targets: array of bodies to test (with bounds)
	// callback(ball, target) is invoked when a crossing is detected (approx.)
	Physics.sweepAndDetect = function (targets, callback) {
		if (!Array.isArray(targets) || typeof callback !== 'function') return;
		const cfgGameHeight = (window.CONFIG && window.CONFIG.GAME_HEIGHT) ? window.CONFIG.GAME_HEIGHT : 700;
		const offscreenY = cfgGameHeight + 300;
		const toRemove = [];
		for (const ball of _balls) {
			if (ball.isHitting) continue;
			const prev = ball.lastPos || ball.position;
			const curr = ball.position;
			// only proceed when ball is moving downward enough to possibly cross targets
			if ((curr.y - prev.y) > 0.05) {
				for (let i = 0; i < targets.length; i++) {
					const target = targets[i];
					if (prev.y < target.bounds.min.y && curr.y >= target.bounds.min.y) {
						const tRatio = (target.bounds.min.y - prev.y) / ((curr.y - prev.y) || 1);
						const xCross = prev.x + (curr.x - prev.x) * tRatio;
						if (xCross >= target.bounds.min.x - 3 && xCross <= target.bounds.max.x + 3) {
							callback(ball, target);
							break;
						}
					}
				}
			}
			// mark for removal - defer actual Composite.remove to caller/periodic cleaner
			if (ball.position.y > offscreenY) {
				toRemove.push(ball);
				_balls.delete(ball);
			}
			// update lastPos in-place to reduce allocations
			if (!ball.lastPos) ball.lastPos = { x: curr.x, y: curr.y };
			else { ball.lastPos.x = curr.x; ball.lastPos.y = curr.y; }
		}
		// perform removals in a short loop outside of iteration to avoid iterator invalidation
		if (toRemove.length) {
			try {
				const world = (window.engine && window.engine.world) ? window.engine.world : null;
				for (let i = 0; i < toRemove.length; i++) {
					try { Matter.Composite.remove(world, toRemove[i]); } catch (e) { /* ignore individual failures */ }
				}
			} catch (e) { /* ignore */ }
		}
	};

	// export
	if (typeof window !== 'undefined') window.PHYSICS = Physics;
	if (typeof module !== 'undefined' && module.exports) module.exports = Physics;
})();

