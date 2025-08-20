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
			try { Matter.Body.setAngle(w.body, w.body.angle + step); } catch (e) { /* ignore */ }
		}
	};

	// Lightweight sweep helper: predict crossings for registered balls against targets
	// targets: array of bodies to test (with bounds)
	// callback(ball, target) is invoked when a crossing is detected (approx.)
	Physics.sweepAndDetect = function (targets, callback) {
		if (!Array.isArray(targets) || typeof callback !== 'function') return;
		for (const ball of _balls) {
			if (ball.isHitting) continue;
			const prev = ball.lastPos || ball.position;
			const curr = ball.position;
			if ((curr.y - prev.y) > 0.05) {
				for (const target of targets) {
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
			// cleanup large offscreen balls concession
			if (ball.position.y > (window.CONFIG.GAME_HEIGHT || 700) + 300) {
				try { Matter.Composite.remove(window.engine ? window.engine.world : null, ball); } catch (e) { /* ignore */ }
				_balls.delete(ball);
			}
			ball.lastPos = { x: curr.x, y: curr.y };
		}
	};

	// export
	if (typeof window !== 'undefined') window.PHYSICS = Physics;
	if (typeof module !== 'undefined' && module.exports) module.exports = Physics;
})();

