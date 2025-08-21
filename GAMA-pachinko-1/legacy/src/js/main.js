// Refactored main.js (simplified)
(function () {
	'use strict';

	// --- Matter.js Modules ---
	const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

	// --- Game Constants from CONFIG ---
	const C = window.CONFIG;
	const L = C.LAYOUT;
	const GAME_WIDTH = C.GAME_WIDTH ?? 450;
	const GAME_HEIGHT = C.GAME_HEIGHT ?? 700;
	const ENABLE_WALL_MISS = C.ENABLE_WALL_MISS ?? true;

	// --- Game State ---
	const gameState = {
		totalDrops: 0,
		orangeHits: 0, // startChucker
		blueHits: 0,   // tulip
		missHits: 0,
		// dropping uses simulation-time accumulator (dropAccum) when true
		dropping: false,
		dropAccum: 0,
		spaceDown: false,
	};

	// performance time used for simulation-scaled accumulators (drop timing)
	let __perfLast = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

	// --- UI Elements ---
	const dropButton = document.getElementById('drop-button');
	const messageBox = document.getElementById('message-box');
	let devPaletteEl = null;

	// --- Batch execution state (for dev-tools) ---
	window.__BATCH_NO_RESPAWN = window.__BATCH_NO_RESPAWN || false;
	window.__BATCH_SUPPRESSED_COUNT = window.__BATCH_SUPPRESSED_COUNT || 0;

	// --- Engine and World Setup ---
	const engine = Engine.create({
		gravity: { y: C.GRAVITY_Y ?? 0.6 },
		// Optimized physics iterations for better performance and stability
		positionIterations: C.PHYSICS?.positionIterations ?? 6,
		velocityIterations: C.PHYSICS?.velocityIterations ?? 8,
		constraintIterations: C.PHYSICS?.constraintIterations ?? 2,
		// Enable sleeping for performance optimization (static bodies at rest)
		enableSleeping: C.PHYSICS?.enableSleeping ?? true,
	});
	const world = engine.world;

	// Optimized render settings for better performance
	const render = Render.create({
		canvas: document.getElementById('pachinko-canvas'),
		engine: engine,
		options: {
			width: GAME_WIDTH,
			height: GAME_HEIGHT,
			wireframes: false,
			background: 'transparent',
			// Render optimization settings
			showAngleIndicator: false,
			showVelocity: false,
			showDebug: false,
			showPerformance: false,
		}
	});
	Render.run(render);

	// --- Overlay canvas for isolated UI/particles/overlays ---
	// We create a separate canvas stacked above the Matter render canvas so
	// any changes to globalAlpha or globalCompositeOperation cannot leak into
	// the main physics rendering context.
	let overlayCanvas = null;
	let overlayCtx = null;
	function ensureOverlayCanvas() {
		if (overlayCanvas && overlayCtx) return;
		try {
			const container = document.querySelector('.game-container') || document.body;
			overlayCanvas = document.createElement('canvas');
			overlayCanvas.id = 'pachinko-overlay-canvas';
			overlayCanvas.style.position = 'absolute';
			overlayCanvas.style.left = '0';
			overlayCanvas.style.top = '0';
			overlayCanvas.style.pointerEvents = 'none';
			overlayCanvas.style.zIndex = 9999;
			// match size
			const base = render.canvas;
			overlayCanvas.width = base.width;
			overlayCanvas.height = base.height;
			overlayCanvas.style.width = base.style.width || base.width + 'px';
			overlayCanvas.style.height = base.style.height || base.height + 'px';
			container.style.position = container.style.position || 'relative';
			container.appendChild(overlayCanvas);
			overlayCtx = overlayCanvas.getContext('2d');
			// Clear overlay each frame before render to avoid accumulation
			try { Events.on(render, 'beforeRender', () => { if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); }); } catch (e) { /* ignore */ }
			// keep overlay size in sync when window resizes
			window.addEventListener('resize', () => {
				try {
					const base = render.canvas;
					overlayCanvas.width = base.width;
					overlayCanvas.height = base.height;
					overlayCanvas.style.width = base.style.width || base.width + 'px';
					overlayCanvas.style.height = base.style.height || base.height + 'px';
				} catch (e) { /* ignore */ }
			});
		} catch (e) { overlayCanvas = null; overlayCtx = null; }
	}

	// Optimized runner with stable frame timing
	const targetFPS = 60;
	const runner = Runner.create({
		isFixed: true,
		delta: 1000 / targetFPS,
		// Enable better timing consistency
		correction: 1,
		deltaSampleSize: 60,
		counterTimestamp: 0,
		frameRequestId: null,
		deltaHistory: [],
		timePrev: null,
		timeScalePrev: 1,
		frameCounter: 0,
		deltaMin: 1000 / targetFPS,
		deltaMax: 1000 / (targetFPS * 0.5), // Allow up to half target FPS
	});
	Runner.run(runner, engine);

	// Debug accessors: allow console inspection without exporting mutable internals
	try {
		window.__getEngine = () => engine;
		window.__getGameState = () => gameState;
	} catch (e) { /* ignore in restrictive environments */ }

	// Debug instrumentation: log changes to canvas globalAlpha / compositeOperation when enabled
	try {
		if (C.DEBUG && C.DEBUG.LOG_CTX) {
			const proto = CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
			if (proto) {
				const gaDesc = Object.getOwnPropertyDescriptor(proto, 'globalAlpha');
				const gcoDesc = Object.getOwnPropertyDescriptor(proto, 'globalCompositeOperation');
				// per-context weak map to count events and reduce noisy cross-context blending
				const __dbg_ctx_state = new WeakMap();
				const GA_LOG_LIMIT = 50;
				const GCO_LOG_LIMIT = 50;
				const getCanvasId = (ctx) => {
					try {
						if (!ctx) return '(null-ctx)';
						if (ctx.canvas && ctx.canvas.id) return ctx.canvas.id;
						if (ctx.canvas) return ctx.canvas.tagName || '(canvas)';
					} catch (e) { /* ignore */ }
					return '(unknown-canvas)';
				};

				if (gaDesc && !gaDesc.__instrumented) {
					const origGASet = gaDesc.set;
					const origGAGet = gaDesc.get;
					Object.defineProperty(proto, 'globalAlpha', {
						configurable: true,
						enumerable: true,
						get: function () { return origGAGet ? origGAGet.call(this) : (this.__debug_globalAlpha || 1); },
						set: function (v) {
							try {
								let state = __dbg_ctx_state.get(this);
								if (!state) { state = { gaCount: 0, gcoCount: 0, firstGATraceShown: false, firstGCOTraceShown: false }; __dbg_ctx_state.set(this, state); }
								const curGA = origGAGet ? origGAGet.call(this) : this.__debug_globalAlpha;
								if (v === curGA) {
									if (origGASet) origGASet.call(this, v); else this.__debug_globalAlpha = v;
									return;
								}
								state.gaCount++;
								const canvasId = getCanvasId(this);
								if (state.gaCount <= GA_LOG_LIMIT) {
									console.warn('[DBG] canvas[' + canvasId + '].globalAlpha <-', v, '(count', state.gaCount, ')');
									if (!state.firstGATraceShown) { console.trace(); state.firstGATraceShown = true; }
								} else if (state.gaCount === GA_LOG_LIMIT + 1) {
									console.warn('[DBG] canvas[' + canvasId + '].globalAlpha logging capped at', GA_LOG_LIMIT);
								}
								if (origGASet) origGASet.call(this, v); else this.__debug_globalAlpha = v;
							} catch (e) { /* ignore instrumentation error */ }
						}
					});
					Object.getOwnPropertyDescriptor(proto, 'globalAlpha').__instrumented = true;
				}

				if (gcoDesc && !gcoDesc.__instrumented) {
					const origGCOSet = gcoDesc.set;
					const origGCOGet = gcoDesc.get;
					Object.defineProperty(proto, 'globalCompositeOperation', {
						configurable: true,
						enumerable: true,
						get: function () { return origGCOGet ? origGCOGet.call(this) : (this.__debug_globalCompositeOperation || 'source-over'); },
						set: function (v) {
							try {
								let state = __dbg_ctx_state.get(this);
								if (!state) { state = { gaCount: 0, gcoCount: 0, firstGATraceShown: false, firstGCOTraceShown: false }; __dbg_ctx_state.set(this, state); }
								const curGCO = origGCOGet ? origGCOGet.call(this) : this.__debug_globalCompositeOperation;
								if (v === curGCO) {
									if (origGCOSet) origGCOSet.call(this, v); else this.__debug_globalCompositeOperation = v;
									return;
								}
								state.gcoCount++;
								const canvasId = getCanvasId(this);
								if (state.gcoCount <= GCO_LOG_LIMIT) {
									console.warn('[DBG] canvas[' + canvasId + '].globalCompositeOperation <-', v, '(count', state.gcoCount, ')');
									if (!state.firstGCOTraceShown) { console.trace(); state.firstGCOTraceShown = true; }
								} else if (state.gcoCount === GCO_LOG_LIMIT + 1) {
									console.warn('[DBG] canvas[' + canvasId + '].globalCompositeOperation logging capped at', GCO_LOG_LIMIT);
								}
								if (origGCOSet) origGCOSet.call(this, v); else this.__debug_globalCompositeOperation = v;
							} catch (e) { /* ignore instrumentation error */ }
						}
					});
					Object.getOwnPropertyDescriptor(proto, 'globalCompositeOperation').__instrumented = true;
				}
			}
		}
	} catch (e) { /* ignore instrumentation errors */ }

	// Canvas state protection: ensure transparency and blending don't leak between frames
	try {
		Events.on(render, 'beforeRender', () => {
			try {
				const ctx = render.context;
				// Save state before rendering
				ctx.save();
				// Reset to default state
				ctx.globalAlpha = 1.0;
				ctx.globalCompositeOperation = 'source-over';
				ctx.fillStyle = '#000000';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 1;
				ctx.lineCap = 'butt';
				ctx.lineJoin = 'miter';
				ctx.miterLimit = 10;
				ctx.setTransform(1, 0, 0, 1, 0, 0);
			} catch (e) { /* ignore */ }
		});

		Events.on(render, 'afterRender', () => {
			try {
				const ctx = render.context;
				// Restore state after rendering
				ctx.restore();
				// Final safety reset
				ctx.globalAlpha = 1.0;
				ctx.globalCompositeOperation = 'source-over';
			} catch (e) { /* ignore */ }
		});
	} catch (e) { /* ignore */ }

	// Developer overlay: draw drop distribution graph if enabled in config
	(function setupDropGraphOverlay() {
		const dropCfg = (C.DROP || {});
		if (!dropCfg.showGraph) return;
		Events.on(render, 'afterRender', () => {
			ensureOverlayCanvas();
			const ctx = overlayCtx || render.context;
			const canvas = ctx.canvas || (render && render.canvas);
			const width = canvas ? canvas.width : GAME_WIDTH;
			const graphW = Math.min(width - 40, dropCfg.width || 200);
			const graphH = 60;
			const left = (width - graphW) / 2;
			const top = 8;
			try {
				ctx.save();
				ctx.globalAlpha = 0.95;
				ctx.clearRect(left - 2, top - 2, graphW + 4, graphH + 4);
				ctx.fillStyle = 'rgba(255,255,255,0.06)';
				ctx.fillRect(left, top, graphW, graphH);
				ctx.strokeStyle = 'rgba(255,255,255,0.14)';
				ctx.beginPath();
				ctx.moveTo(left, top + graphH - 1);
				ctx.lineTo(left + graphW, top + graphH - 1);
				ctx.stroke();
				const samples = 128;
				const halfW = graphW / 2;
				const std = (typeof dropCfg.std === 'number') ? dropCfg.std : Math.max(1, halfW / 2);
				const scale = 1 / (std * Math.sqrt(2 * Math.PI));
				const denom = 2 * std * std;
				let maxY = 0;
				const ys = new Array(samples);
				for (let i = 0; i < samples; i++) {
					const rel = (i / (samples - 1)) * 2 - 1;
					const x = rel * halfW;
					const pdf = scale * Math.exp(-(x * x) / denom);
					ys[i] = pdf;
					if (pdf > maxY) maxY = pdf;
				}
				ctx.beginPath();
				for (let i = 0; i < samples; i++) {
					const px = left + (i / (samples - 1)) * graphW;
					const py = top + graphH - (ys[i] / maxY) * (graphH - 8);
					if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
				}
				ctx.strokeStyle = 'rgba(46, 204, 113, 0.95)';
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.lineTo(left + graphW, top + graphH - 1);
				ctx.lineTo(left, top + graphH - 1);
				ctx.closePath();
				ctx.fillStyle = 'rgba(46,204,113,0.12)';
				ctx.fill();
				ctx.strokeStyle = 'rgba(255,255,255,0.25)';
				ctx.beginPath();
				ctx.moveTo(left + graphW / 2, top);
				ctx.lineTo(left + graphW / 2, top + graphH);
				ctx.stroke();
			} catch (e) {
				/* ignore drawing errors */
			} finally {
				try { ctx.restore(); } catch (e) { /* ignore */ }
			}
		});
	})();

	// --- Game Objects ---
	const pegs = [];
	const gates = [];
	const windmills = [];
	const balls = [];
	let _pegRainbowTimer = null;

	// --- Create Game Elements ---
	function createWalls() {
		const wallOptions = { isStatic: true, render: { visible: false } };
		Composite.add(world, [
			Bodies.rectangle(GAME_WIDTH, GAME_HEIGHT / 2, 20, GAME_HEIGHT, wallOptions),
			Bodies.rectangle(0, GAME_HEIGHT / 2, 20, GAME_HEIGHT, wallOptions)
		]);
		const guideWallOffset = C.GUIDE_WALL_OFFSET ?? 30;
		const guideAngle = C.GUIDE_WALL_ANGLE ?? 0.2;
		const wallLayout = L.walls;
		const centerX = GAME_WIDTH / 2;
		Composite.add(world, [
			Bodies.rectangle(centerX - guideWallOffset, wallLayout.guideY, wallLayout.guideWidth, wallLayout.guideHeight, { isStatic: true, angle: -guideAngle, render: { fillStyle: wallLayout.color }, label: 'wall' }),
			Bodies.rectangle(centerX + guideWallOffset, wallLayout.guideY, wallLayout.guideWidth, wallLayout.guideHeight, { isStatic: true, angle: guideAngle, render: { fillStyle: wallLayout.color }, label: 'wall' })
		]);
	}

	function createMissZones() {
		const floorZone = L.missZones.floor;
		const centerZone = L.missZones.center;
		const floorMissZone = Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT + floorZone.y_offset, GAME_WIDTH - 40, 6, {
			isStatic: true, isSensor: true, label: 'floorMissZone', render: { fillStyle: floorZone.color, strokeStyle: floorZone.stroke }
		});
		const centerMissZone = Bodies.rectangle(GAME_WIDTH / 2, centerZone.y, centerZone.width, centerZone.height, {
			isStatic: true, isSensor: true, label: 'missZone', render: { fillStyle: centerZone.color, strokeStyle: centerZone.stroke }
		});
		Composite.add(world, [floorMissZone, centerMissZone]);
	}

	function createWindmills() {
		const WM = C.WINDMILL;
		const layout = L.windmills;
		// interpret baseSpeed in config as rotations-per-second (rps)
		const baseRPS = WM.baseSpeed ?? 0.08;
		const centerX = GAME_WIDTH / 2;
		const createWindmill = (cx, cy, blades, radius, bladeW, bladeH, speed, color, hubColor) => {
			const hubRest = C.WINDMILL_RESTITUTION || 0.98;
			const parts = [Bodies.circle(cx, cy, 6, { isStatic: true, restitution: hubRest, render: { fillStyle: hubColor || WM.hubColor } })];
			for (let i = 0; i < blades; i++) {
				const angle = (i / blades) * Math.PI * 2;
				const bx = cx + Math.cos(angle) * (radius / 2);
				const by = cy + Math.sin(angle) * (radius / 2);
				const blade = Bodies.rectangle(bx, by, bladeH, bladeW, { isStatic: true, restitution: hubRest, render: { fillStyle: color || WM.color } });
				Body.setAngle(blade, angle);
				parts.push(blade);
			}
			const compound = Body.create({ parts, isStatic: true, label: 'windmill' });
			Composite.add(world, compound);
			// store baseRPS (signed) for this windmill; speed parameter here is rotations/sec
			windmills.push({ body: compound, baseRPS: speed });
		};
		if (Array.isArray(layout.items) && layout.items.length) {
			layout.items.forEach(it => {
				const cx = (typeof it.x === 'number') ? it.x : (centerX + (it.x_offset || 0));
				const cy = (typeof it.y === 'number') ? it.y : (it.y || layout.y);
				const blades = it.blades || WM.blades || 4;
				const radius = it.radius || WM.radius || 40;
				const bladeW = it.bladeW || WM.bladeW || 8;
				const bladeH = it.bladeH || WM.bladeH || 40;
				const dirSign = (it.cw ? 1 : -1);
				let speedRps = baseRPS * dirSign;
				if (typeof it.speed === 'number') {
					speedRps = it.speed;
				} else if (typeof it.speedMultiplier === 'number') {
					speedRps = baseRPS * it.speedMultiplier * dirSign;
				}
				createWindmill(cx, cy, blades, radius, bladeW, bladeH, speedRps, it.color || WM.color, it.hubColor || WM.hubColor);
			});
		} else {
			createWindmill(centerX - layout.offsetX, layout.y, WM.blades, WM.radius, WM.bladeW, WM.bladeH, baseRPS * (WM.leftCW ? 1 : -1), WM.color, WM.hubColor);
			createWindmill(centerX + layout.offsetX, layout.y, WM.blades, WM.radius, WM.bladeW, WM.bladeH, baseRPS * (WM.rightCW ? 1 : -1), WM.color, WM.hubColor);
			if (C.ENABLE_CENTER_WINDMILL) {
				createWindmill(centerX, layout.centerY, WM.blades, WM.radius, 6, WM.bladeH, baseRPS * (WM.centerCW ? 1 : -1), WM.color, WM.hubColor);
			}
		}
	}

	function createGates() {
		const layout = L.gates;
		const gateLength = C.GATE_LENGTH ?? layout.length ?? 60;
		const gateWidth = C.GATE_WIDTH ?? layout.width ?? 10;
		const gateHalf = gateLength / 2;
		let gateOpenBase, gateClosedBase;
		if (C.GATE_ANGLE_IN_DEGREES) {
			const openDeg = C.GATE_OPEN_ANGLE_DEG ?? 132;
			const closedDeg = C.GATE_CLOSED_ANGLE_DEG ?? 17.2;
			gateOpenBase = openDeg * Math.PI / 180;
			gateClosedBase = closedDeg * Math.PI / 180;
		} else {
			gateOpenBase = C.GATE_OPEN_ANGLE || 2.3;
			gateClosedBase = C.GATE_CLOSED_ANGLE || 0.3;
		}
		const createGate = (side) => {
			const pivot = { x: (GAME_WIDTH / 2) + (side === 'left' ? -layout.offsetX : layout.offsetX), y: layout.y };
			const closedAngle = (side === 'left' ? -1 : 1) * gateClosedBase;
			const openAngle = (side === 'left' ? -1 : 1) * gateOpenBase;
			const center = { x: pivot.x - Math.sin(closedAngle) * gateHalf, y: pivot.y + Math.cos(closedAngle) * gateHalf };
			const gateRest = C.GATE_RESTITUTION ?? 0.6;
			const gateBody = Bodies.rectangle(center.x, center.y, gateWidth, gateLength, { isStatic: true, label: 'gate', restitution: gateRest, render: { fillStyle: layout.color } });
			Body.setAngle(gateBody, closedAngle);
			Composite.add(world, gateBody);
			gates.push({ body: gateBody, pivot, length: gateLength, width: gateWidth, targetAngle: openAngle, closedAngle, openAngle });
		};
		createGate('left');
		createGate('right');
		function setGatesOpen(open) {
			gates.forEach(g => { g.targetAngle = open ? g.openAngle : g.closedAngle; });
		}
		function startGateCycle() {
			setGatesOpen(false);
			simTimeout(() => {
				setGatesOpen(true);
				simTimeout(() => {
					setGatesOpen(false);
					simTimeout(startGateCycle, C.GATE_CLOSED_MS);
				}, C.GATE_OPEN_MS);
			}, 120);
		}
		startGateCycle();
	}

	function createFeatures() {
		const centerX = GAME_WIDTH / 2;
		const layout = L.features;
		const chucker = layout.chucker;
		const tulip = layout.tulip;
		const startChucker = Bodies.rectangle(centerX, chucker.y, chucker.width, chucker.height, { isStatic: true, isSensor: true, label: 'startChucker', render: { fillStyle: chucker.color } });
		const tulipLeft = Bodies.rectangle(tulip.x, tulip.y, tulip.width, tulip.height, { isStatic: true, isSensor: true, label: 'tulip', render: { fillStyle: tulip.color } });
		const tulipRight = Bodies.rectangle(GAME_WIDTH - tulip.x, tulip.y, tulip.width, tulip.height, { isStatic: true, isSensor: true, label: 'tulip', render: { fillStyle: tulip.color } });
		Composite.add(world, [startChucker, tulipLeft, tulipRight]);
		const cf = layout.chuckerFence;
		const tf = layout.tulipFence;
		Composite.add(world, [
			Bodies.rectangle(centerX - cf.offsetX, cf.y, cf.thickness, cf.height, { isStatic: true, render: { fillStyle: layout.fenceColor } }),
			Bodies.rectangle(centerX + cf.offsetX, cf.y, cf.thickness, cf.height, { isStatic: true, render: { fillStyle: layout.fenceColor } }),
			Bodies.rectangle(tulip.x - tf.offsetX, tf.y, tf.thickness, tf.height, { isStatic: true, render: { fillStyle: layout.fenceColor } }),
			Bodies.rectangle(tulip.x + tf.offsetX, tf.y, tf.thickness, tf.height, { isStatic: true, render: { fillStyle: layout.fenceColor } }),
			Bodies.rectangle(GAME_WIDTH - tulip.x - tf.offsetX, tf.y, tf.thickness, tf.height, { isStatic: true, render: { fillStyle: layout.fenceColor } }),
			Bodies.rectangle(GAME_WIDTH - tulip.x + tf.offsetX, tf.y, tf.thickness, tf.height, { isStatic: true, render: { fillStyle: layout.fenceColor } })
		]);
	}

	function createGuards() {
		const guards = (L.features && L.features.guards) || [];
		for (const g of guards) {
			if (g.type === 'rect') {
				const rest = g.restitution ?? C.GUARD_RESTITUTION ?? 0.6;
				const body = Bodies.rectangle(g.x, g.y, g.w, g.h, { isStatic: true, restitution: rest, render: { fillStyle: g.color || '#7f8c8d' } });
				if (typeof g.angle === 'number') Body.setAngle(body, g.angle);
				Composite.add(world, body);
			}
		}
	}

	function loadPreset(name) {
		window._PRESET_CACHE = window._PRESET_CACHE || {};
		const key = (typeof name === 'string') ? name.replace(/\.json$/i, '') : name;
		if (!key || key === 'default' || key === 'none') return Promise.resolve(null);
		if (window._PRESET_CACHE[key]) return Promise.resolve(window._PRESET_CACHE[key]);
		const fname = key.toLowerCase().endsWith('.json') ? key : (key + '.json');
		const url = 'src/pegs-presets/' + fname;
		return fetch(url).then(r => {
			if (!r.ok) throw new Error('preset fetch failed');
			return r.json();
		}).then(list => {
			if (!Array.isArray(list)) throw new Error('invalid preset format');
			window._PRESET_CACHE[key] = list;
			return list;
		});
	}

	function loadPresetAndBuild(name) {
		return loadPreset(name).then(list => {
			window.PEG_PRESET = name || 'default';
			buildPegs(Array.isArray(list) ? list : window.PEG_PRESET);
		}).catch(e => {
			console.warn('Could not load preset', name, e);
			window.PEG_PRESET = 'default';
			buildPegs('default');
		});
	}

	function buildPegs(preset) {
		if (pegs.length) Composite.remove(world, pegs);
		pegs.length = 0;
		preset = preset || window.PEG_PRESET || 'default';
		if (Array.isArray(preset)) {
			const preserve = C.PRESETS?.preserveExact ?? false;
			const layout = L.pegs;
			const pegRest = C.PEG_RESTITUTION ?? 0.6;
			const pegOptions = { isStatic: true, label: 'peg', restitution: pegRest, friction: 0.05, render: { fillStyle: layout.color } };
			if (preserve) {
				for (const p of preset) {
					if (typeof p.x === 'number' && typeof p.y === 'number') {
						const r = p.r || C.PEG_RADIUS;
						pegs.push(Bodies.circle(Math.round(p.x), Math.round(p.y), r, pegOptions));
					}
				}
			} else {
				const requiredSurface = (C.BALL_RADIUS * 2) + C.PEG_CLEARANCE;
				const centerX = GAME_WIDTH / 2;
				const exclusionZones = (layout.exclusionZones || []).map(z => {
					if (z.type === 'circle') return { ...z, x: centerX + (z.x_offset || 0) };
					if (z.type === 'rect' && z.x_right) return { ...z, x: GAME_WIDTH - z.x_right };
					return z;
				});
				const isExcluded = (x, y) => exclusionZones.some(z =>
					(z.type === 'circle' && ((x - z.x) ** 2 + (y - z.y) ** 2) < z.r ** 2) ||
					(z.type === 'rect' && (x > z.x - z.w / 2 && x < z.x + z.w / 2 && y > z.y - z.h / 2 && y < z.y + z.h / 2))
				);
				const okToAdd = (x, y, r) => {
					if (x < layout.x_margin || x > GAME_WIDTH - layout.x_margin || y < layout.y_margin_top || y > layout.y_margin_bottom || isExcluded(x, y)) return false;
					for (const b of pegs) {
						const dx = b.position.x - x;
						const dy = b.position.y - y;
						if (Math.hypot(dx, dy) < (b.circleRadius || C.PEG_RADIUS) + r + requiredSurface) return false;
					}
					return true;
				};
				for (const p of preset) {
					if (typeof p.x === 'number' && typeof p.y === 'number') {
						const r = p.r || C.PEG_RADIUS;
						if (okToAdd(p.x, p.y, r)) {
							pegs.push(Bodies.circle(Math.round(p.x), Math.round(p.y), r, pegOptions));
						}
					}
				}
			}
			if (pegs.length) Composite.add(world, pegs);
			return;
		}
		if (preset === 'none') return;
		if (typeof preset === 'string' && preset !== 'default') {
			const key = preset.replace(/\.json$/i, '');
			window._PRESET_CACHE = window._PRESET_CACHE || {};
			if (window._PRESET_CACHE[key]) {
				buildPegs(window._PRESET_CACHE[key]);
			} else {
				console.info('Preset not cached, falling back to default:', preset);
				buildPegs('default');
			}
			return;
		}
		const layout = L.pegs;
		const pegRest2 = C.PEG_RESTITUTION ?? 0.6;
		const pegOptions = { isStatic: true, label: 'peg', restitution: pegRest2, friction: 0.05, render: { fillStyle: layout.color } };
		const requiredSurface = (C.BALL_RADIUS * 2) + C.PEG_CLEARANCE;
		const centerX = GAME_WIDTH / 2;
		const exclusionZones = (layout.exclusionZones || []).map(z => {
			if (z.type === 'circle') return { ...z, x: centerX + (z.x_offset || 0) };
			if (z.type === 'rect' && z.x_right) return { ...z, x: GAME_WIDTH - z.x_right };
			return z;
		});
		const isExcluded = (x, y) => exclusionZones.some(z =>
			(z.type === 'circle' && ((x - z.x) ** 2 + (y - z.y) ** 2) < z.r ** 2) ||
			(z.type === 'rect' && (x > z.x - z.w / 2 && x < z.x + z.w / 2 && y > z.y - z.h / 2 && y < z.y + z.h / 2))
		);
		const addPeg = (x, y, r = C.PEG_RADIUS) => {
			if (x < layout.x_margin || x > GAME_WIDTH - layout.x_margin || y < layout.y_margin_top || y > layout.y_margin_bottom || isExcluded(x, y)) return;
			for (const b of pegs) {
				if (Math.hypot(b.position.x - x, b.position.y - y) < (b.circleRadius || C.PEG_RADIUS) + r + requiredSurface) return;
			}
			pegs.push(Bodies.circle(x, y, r, pegOptions));
		};
		const xStep = C.PEG_SPACING;
		for (let y = layout.y_start, rowIdx = 0; y <= layout.y_end; y += layout.y_step, rowIdx++) {
			const rowShift = (rowIdx % 2 === 0) ? 0 : xStep / 2;
			const maxOffset = Math.floor((centerX - 36) / xStep) * xStep;
			for (let off = 0; off <= maxOffset; off += xStep) {
				if (off === 0) {
					if (rowIdx % 2 === 0) addPeg(centerX, y);
					else { addPeg(centerX - xStep / 2, y); addPeg(centerX + xStep / 2, y); }
				} else {
					addPeg(centerX - off - rowShift, y);
					addPeg(centerX + off + rowShift, y);
				}
			}
		}
		if (pegs.length) Composite.add(world, pegs);
	}

	// --- Game Logic ---
	function dropBall(options = {}) {
		const dropCfg = C.DROP || {};
		const halfWidth = (dropCfg.width ?? 200) / 2;
		const std = dropCfg.std ?? Math.max(1, halfWidth / 2);
		const sampleNormal = () => {
			let u = 0, v = 0;
			while (u === 0) u = Math.random();
			while (v === 0) v = Math.random();
			return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
		};
		let offsetX;
		if (dropCfg.useNormal) {
			offsetX = sampleNormal() * std;
			offsetX = Math.max(-halfWidth, Math.min(halfWidth, offsetX));
		} else {
			offsetX = (Math.random() - 0.5) * (halfWidth * 2);
		}
		const randomX = GAME_WIDTH / 2 + offsetX;
		const colors = L.ballColors;
		const color = options.isNavy ? colors.fromNavy : (options.fromBlue ? colors.fromBlue : colors.default);
		const ballCollision = C.BALLS_INTERACT ? {} : { collisionFilter: { group: -C.BALL_GROUP_ID } };
		const ballRest = C.BALL_RESTITUTION ?? 0.85;
		const ball = Bodies.circle(randomX, -20, C.BALL_RADIUS, {
			label: 'ball',
			restitution: ballRest,
			friction: 0.05,
			frictionAir: C.BALL_AIR_FRICTION ?? 0.02,
			render: { fillStyle: color },
			...ballCollision
		});
		if (options.fromBlue) ball.isFromBlue = true;
		if (options.isNavy) ball.isNavy = true;
		if (options.fromBlue || options.isNavy) ball.isImmuneToMiss = true;
		Composite.add(world, ball);
		balls.push(ball);
		gameState.totalDrops++;
		updateStats();
	}

	function handleHit(ball, type) {
		if (!ball || ball.isHitting) return;
		let sfxKey, newBallOptions;
		const isMiss = type === 'miss' || type === 'wall' || type === 'floorMiss';
		if (isMiss) {
			if (type !== 'floorMiss' && ball.isImmuneToMiss) return;
			gameState.missHits++;
			sfxKey = 'miss';
			// spawn lightweight miss particles using DEBRIS config
			try {
				const dcfg = C.DEBRIS || {};
				// prefer the ball's visual color when available (ball.render.fillStyle), otherwise use configured MISS_COLOR
				const color = (ball && ball.render && ball.render.fillStyle) ? ball.render.fillStyle : (dcfg.MISS_COLOR || '#ff0000ff');
				spawnMissParticles(ball.position.x, ball.position.y, color);
			} catch (e) { /* ignore */ }
		} else if (type === 'startChucker') {
			gameState.orangeHits++;
			sfxKey = 'chucker';
			newBallOptions = { fromBlue: true, isNavy: true };
			try { spawnHitParticles(ball.position.x, ball.position.y, L.features.chucker.color); } catch (e) { /* ignore */ }
		} else if (type === 'tulip') {
			gameState.blueHits++;
			sfxKey = 'tulip';
			newBallOptions = { fromBlue: true, isNavy: ball.isNavy };
			try { spawnHitParticles(ball.position.x, ball.position.y, L.features.tulip.color); } catch (e) { /* ignore */ }
		} else {
			return;
		}
		ball.isHitting = true;
		updateStats();
		playSound(sfxKey);
		try {
			Composite.remove(world, ball);
			const i = balls.indexOf(ball);
			if (i !== -1) balls.splice(i, 1);
		} catch (e) { /* ignore */ }
		if (newBallOptions) {
			if (!window.__BATCH_NO_RESPAWN || window.__FORCE_RESPAWN) {
				simTimeout(() => dropBall(newBallOptions), 200);
			} else {
				window.__BATCH_SUPPRESSED_COUNT++;
			}
		}
	}

	// --- Event Handlers ---
	function setupEventListeners() {
		// attach input and physics listeners
		const start = (e) => { e && e.preventDefault(); if (gameState.dropping) return; gameState.dropping = true; gameState.dropAccum = 0; };
		const stop = (e) => { e && e.preventDefault(); gameState.dropping = false; gameState.dropAccum = 0; };
		dropButton.addEventListener('mousedown', start);
		dropButton.addEventListener('mouseup', stop);
		dropButton.addEventListener('mouseleave', stop);
		dropButton.addEventListener('touchstart', start);
		dropButton.addEventListener('touchend', stop);
		window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !gameState.spaceDown) { gameState.spaceDown = true; start(e); } });
		window.addEventListener('keyup', (e) => { if (e.code === 'Space') { gameState.spaceDown = false; stop(e); } });
		Events.on(engine, 'beforeUpdate', updatePhysics);
		Events.on(engine, 'collisionStart', handleCollisions);
		let _pruneFrame = 0;
		Events.on(engine, 'afterUpdate', () => {
			// Prune off-screen balls (every other frame to reduce overhead)
			_pruneFrame = (_pruneFrame + 1) & 1;
			if (_pruneFrame !== 0) return;
			for (let i = balls.length - 1; i >= 0; i--) {
				const b = balls[i];
				if (!b || !b.position) continue;
				if (b.position.y > GAME_HEIGHT + 300) {
					try { Composite.remove(world, b); } catch (e) { /* ignore */ }
					balls.splice(i, 1);
				}
			}
		});
	}

	// --- Lightweight particle system (miss & hit) ---
	// Shared container and single afterRender renderer for minimal overhead
	// particle pool to avoid allocations
	window._missParticles = window._missParticles || [];
	const _particlePool = window._particlePool || [];
	let _particleRendererInstalled = false;
	// budgeted update: how many particles to integrate per frame at most
	const PARTICLE_UPDATES_PER_FRAME = (C.DEBRIS && C.DEBRIS.UPDATES_PER_FRAME) || 80;
	function ensureParticleRendererInstalled() {
		if (_particleRendererInstalled) return;
		_particleRendererInstalled = true;
		Events.on(render, 'afterRender', () => {
			const list = window._missParticles;
			if (!list || !list.length) return;
			ensureOverlayCanvas();
			const ctx = overlayCtx || render.context;
			const dt = engine.timing.lastDelta || 16.6667; // ms
			const dtS = dt / 1000;
			const grav = (C.GRAVITY_Y ?? 1) * 0.001; // small gravity factor for particles
			try {
				// Use overlay context; we control save/restore here so main ctx is safe
				ctx.save();
				ctx.globalCompositeOperation = 'source-over';
				let updated = 0;
				for (let i = list.length - 1; i >= 0; i--) {
					const p = list[i];
					if (updated < PARTICLE_UPDATES_PER_FRAME) {
						p.vy += grav * dt; // integrate gravity
						p.x += p.vx * dtS;
						p.y += p.vy * dtS;
						p.life -= dt;
						updated++;
					} else {
						p.life -= dt * 0.5;
					}
					if (p.life <= 0 || p.y > GAME_HEIGHT + 400) {
						const rem = list.splice(i, 1)[0];
						if (_particlePool.length < (C.DEBRIS?.MAX ?? 200)) {
							_particlePool.push(rem);
						}
						continue;
					}
					const alpha = Math.max(0, Math.min(1, p.life / (p.lifeMax || 400)));
					if (alpha > 0.01) {
						ctx.globalAlpha = alpha;
						ctx.fillStyle = p.color;
						ctx.beginPath();
						ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
						ctx.fill();
					}
				}
			} catch (e) {
				/* ignore drawing errors */
			} finally {
				try {
					ctx.restore();
					if (ctx !== render.context) {
						// Ensure main context stays untouched
						// No-op
					}
				} catch (e) { /* ignore */ }
			}
		});
	}

	function spawnMissParticles(x, y, color) {
		const dcfg = C.DEBRIS || {};
		const MAX = dcfg.MAX_PARTICLES ?? 100;
		const MIN = dcfg.COUNT_MIN ?? 5;
		const MAXC = dcfg.COUNT_MAX ?? 10;
		const count = Math.min(MAX, Math.max(MIN, Math.round(MIN + Math.random() * (MAXC - MIN))));
		const spread = dcfg.SPREAD ?? 20;
		const sMin = dcfg.SPEED_MIN ?? 1;
		const sMax = dcfg.SPEED_MAX ?? 3;
		const lifeMin = dcfg.LIFE_MIN ?? 300;
		const lifeMax = dcfg.LIFE_MAX ?? 700;
		ensureParticleRendererInstalled();
		for (let i = 0; i < count; i++) {
			if (window._missParticles.length >= MAX) break;
			const a = (Math.random() * Math.PI) + Math.PI / 4; // biased upward
			const s = sMin + Math.random() * (sMax - sMin);
			let p;
			if (_particlePool.length) p = _particlePool.pop(); else p = {};
			p.x = x + (Math.random() - 0.5) * spread;
			p.y = y + (Math.random() - 0.5) * spread;
			p.vx = Math.cos(a) * s * (0.6 + Math.random() * 0.8);
			p.vy = Math.sin(a) * s * (0.4 + Math.random() * 0.8) - 1.0;
			p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
			p.lifeMax = lifeMax;
			p.r = 1 + Math.random() * 2;
			p.color = color || (dcfg.MISS_COLOR || '#ff0000');
			window._missParticles.push(p);
		}
	}

	function spawnHitParticles(x, y, color) {
		const dcfg = C.DEBRIS || {};
		const MAX = dcfg.MAX_PARTICLES ?? 100;
		const MIN = dcfg.COUNT_MIN ?? 6;
		const MAXC = dcfg.COUNT_MAX ?? 12;
		const count = Math.min(MAX, Math.max(MIN, Math.round(MIN + Math.random() * (MAXC - MIN))));
		const spread = (dcfg.SPREAD ?? 20) * 0.8;
		const sMin = (dcfg.SPEED_MIN ?? 1) * 0.8;
		const sMax = (dcfg.SPEED_MAX ?? 3) * 1.2;
		const lifeMin = dcfg.LIFE_MIN ?? 300;
		const lifeMax = dcfg.LIFE_MAX ?? 700;
		ensureParticleRendererInstalled();
		for (let i = 0; i < count; i++) {
			if (window._missParticles.length >= MAX) break;
			const a = (Math.random() * Math.PI) + Math.PI / 6; // upward bias
			const s = sMin + Math.random() * (sMax - sMin);
			let p;
			if (_particlePool.length) p = _particlePool.pop(); else p = {};
			p.x = x + (Math.random() - 0.5) * spread;
			p.y = y + (Math.random() - 0.5) * spread;
			p.vx = Math.cos(a) * s * (0.6 + Math.random() * 0.6);
			p.vy = Math.sin(a) * s * (0.5 + Math.random() * 0.8) - 1.2;
			p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
			p.lifeMax = lifeMax;
			p.r = 1.5 + Math.random() * 2.5;
			p.color = color || '#ffffff';
			window._missParticles.push(p);
		}
	}

	// expose spawners for console/debug
	try { window.spawnMissParticles = spawnMissParticles; } catch (e) { /* ignore */ }
	try { window.spawnHitParticles = spawnHitParticles; } catch (e) { /* ignore */ }

	// debug helper to spawn hit particles from console: debugSpawnHit(x,y,color)
	window.debugSpawnHit = (x = GAME_WIDTH / 2, y = GAME_HEIGHT / 2, color = (L.features && L.features.chucker && L.features.chucker.color) || '#ffd700') => {
		try { window.spawnHitParticles(x, y, color); } catch (e) { /* ignore */ }
	};

	function updatePhysics() {
		// advance simulation-time (ms) based on engine.timing.lastDelta scaled by timeScale
		const lastDelta = (engine && engine.timing && engine.timing.lastDelta) ? engine.timing.lastDelta : (1000 / 60);
		const ts = (engine && engine.timing && typeof engine.timing.timeScale === 'number') ? engine.timing.timeScale : (window.__CURRENT_SIM_SPEED || 1);
		window.__simNow = (window.__simNow || 0) + (lastDelta * ts);

		// run simulation-timers that are due (optimized batch processing)
		if (Array.isArray(window.__simTimers) && window.__simTimers.length) {
			const now = window.__simNow;
			const remaining = [];
			for (let i = 0; i < window.__simTimers.length; i++) {
				const t = window.__simTimers[i];
				if (t.target <= now) {
					try { t.fn(); } catch (e) { /* ignore timer errors */ }
				} else {
					remaining.push(t);
				}
			}
			window.__simTimers = remaining;
		}

		// Cache frequently used values for better performance
		const dt = lastDelta;
		const dtS = dt / 1000;
		const simTS = ts;

		// simulation-time based auto-drop accumulator
		if (gameState.dropping) {
			// use wall-clock delta scaled by simulation speed to avoid relying on engine.lastDelta
			const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
			let perfDt = now - __perfLast;
			if (perfDt < 0) perfDt = 0;
			__perfLast = now;
			gameState.dropAccum += perfDt * simTS;
			const interval = Math.max(1, (C.DROP_INTERVAL_MS || 100));
			while (gameState.dropAccum >= interval) {
				gameState.dropAccum -= interval;
				dropBall();
			}
		} else {
			// keep perf clock in sync when not dropping to avoid large jumps when resumed
			__perfLast = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
		}

		// Update windmills: optimized batch processing
		if (windmills.length > 0) {
			const twoPi = Math.PI * 2;
			for (let i = 0; i < windmills.length; i++) {
				const w = windmills[i];
				const rps = (typeof w.baseRPS === 'number') ? w.baseRPS : 0;
				if (rps !== 0) { // Skip static windmills
					const radPerSec = rps * twoPi;
					const angleDelta = radPerSec * simTS * dtS;
					try { Body.rotate(w.body, angleDelta); } catch (e) { /* ignore rotate errors */ }
					w.omega = radPerSec * simTS;
				} else {
					w.omega = 0;
				}
			}
		}

		// Update gates: optimized smooth interpolation
		if (gates.length > 0) {
			const gateRate = (C.GATE_LERP_PER_SEC || 8);
			const lerpBase = gateRate * dtS * simTS;
			for (let i = 0; i < gates.length; i++) {
				const g = gates[i];
				const d = g.targetAngle - g.body.angle;
				if (Math.abs(d) > 0.0005) {
					const lerpFactor = Math.min(1, lerpBase);
					const newAng = g.body.angle + d * lerpFactor;
					const half = g.length / 2;
					const sinAng = Math.sin(newAng);
					const cosAng = Math.cos(newAng);
					const cx = g.pivot.x - sinAng * half;
					const cy = g.pivot.y + cosAng * half;
					const prevAng = g.body.angle;
					Body.setPosition(g.body, { x: cx, y: cy });
					Body.setAngle(g.body, newAng);
					const dAng = newAng - prevAng;
					g.omega = dtS > 0 ? (dAng / dtS) : 0;
				} else {
					g.omega = 0; // Gate is at target, no rotation
				}
			}
		}
	}


	function handleCollisions(event) {
		for (const pair of event.pairs) {
			const ball = (pair.bodyA.label === 'ball') ? pair.bodyA : (pair.bodyB.label === 'ball' ? pair.bodyB : null);
			if (!ball || ball.isHitting) continue;
			const other = (ball === pair.bodyA) ? pair.bodyB : pair.bodyA;

			// Minimal generic velocity-vs-velocity nudge for moving static surfaces
			if (other.label === 'windmill' || other.label === 'gate') {
				try {
					// contact normal approximation: from other to ball
					const dx = ball.position.x - other.position.x;
					const dy = ball.position.y - other.position.y;
					let len = Math.hypot(dx, dy) || 1;
					let nx = dx / len, ny = dy / len;
					// surface point tangential velocity from angular velocity
					const omega = (other.label === 'windmill') ? (findAngularVelocity(windmills, other) || 0) : (findAngularVelocity(gates, other) || 0);
					// tangential direction is perpendicular to radius vector
					const tx = -ny, ty = nx;
					const vSurf = { x: tx * omega * 30, y: ty * omega * 30 }; // scale by lever arm (~30px)
					const vrx = (ball.velocity.x - vSurf.x);
					const vry = (ball.velocity.y - vSurf.y);
					const vn = vrx * nx + vry * ny;
					if (vn < 0) {
						const e = Math.max(0, Math.min(1, ball.restitution * (other.restitution || 0.8)));
						const j = -(1 + e) * vn * (ball.mass);
						const ix = nx * j;
						const iy = ny * j;
						Body.setVelocity(ball, { x: ball.velocity.x + ix / ball.mass, y: ball.velocity.y + iy / ball.mass });
					}
				} catch (e) { /* ignore */ }
			}

			switch (other.label) {
				case 'wall': if (ENABLE_WALL_MISS) handleHit(ball, 'wall'); break;
				case 'missZone': handleHit(ball, 'miss'); break;
				case 'floorMissZone': handleHit(ball, 'floorMiss'); break;
				case 'startChucker': handleHit(ball, 'startChucker'); break;
				case 'tulip': handleHit(ball, 'tulip'); break;
				case 'windmill': playSound('windmill'); break;
				case 'peg': playSound('debris'); break;
			}
		}
	}

	function findAngularVelocity(list, body) {
		for (let i = 0; i < list.length; i++) {
			if (list[i].body === body) return list[i].omega || 0;
		}
		return 0;
	}

	// --- UI & Stats ---
	function updateStats() {
		syncWindowCounters();
		if (devPaletteEl) {
			const { totalDrops, orangeHits, blueHits, missHits } = gameState;
			const totalHits = (orangeHits || 0) + (blueHits || 0);
			const drops = totalDrops || 0;
			const hitPct = drops ? Math.round((totalHits / drops) * 100) : 0;
			const orangePct = drops ? Math.round((orangeHits / drops) * 100) : 0;
			const bluePct = drops ? Math.round((blueHits / drops) * 100) : 0;
			devPaletteEl.querySelector('.dp-total').textContent = drops;
			devPaletteEl.querySelector('.dp-hit-total').textContent = totalHits;
			devPaletteEl.querySelector('.dp-hit-pct').textContent = hitPct + '%';
			devPaletteEl.querySelector('.dp-orange').textContent = orangeHits;
			devPaletteEl.querySelector('.dp-orange-pct').textContent = orangePct + '%';
			devPaletteEl.querySelector('.dp-blue').textContent = blueHits;
			devPaletteEl.querySelector('.dp-blue-pct').textContent = bluePct + '%';
			devPaletteEl.querySelector('.dp-miss').textContent = missHits;
		}
	}

	function showMessage(text, duration = 2000) {
		messageBox.textContent = text;
		messageBox.style.visibility = 'visible';
		simTimeout(() => { messageBox.style.visibility = 'hidden'; }, duration);
	}

	// --- Audio ---
	function playSound(key) {
		try { if (C.SFX && C.SFX[key]) AudioBus.sfxSimple(C.SFX[key]); } catch (e) { /* ignore */ }
	}

	// --- Simulation Time Scaling ---
	window.__SIM_SPEED = window.__SIM_SPEED || 1;
	// Simulation-time scheduler: timers fire when simulation time (simNow) advances in updatePhysics
	window.__simNow = window.__simNow || 0; // ms of simulation time
	window.__simTimers = window.__simTimers || [];
	function simTimeout(fn, ms) {
		if (typeof fn !== 'function') return null;
		const m = Math.max(0, Number(ms) || 0);
		if (m <= 0) { try { fn(); } catch (e) { /* ignore */ } return null; }
		const timer = { target: window.__simNow + m, fn };
		window.__simTimers.push(timer);
		return timer;
	}
	window.simTimeout = simTimeout;

	// Store the target speed separately from current speed to handle pause/resume correctly
	window.__TARGET_SIM_SPEED = window.__TARGET_SIM_SPEED || 1;
	window.__CURRENT_SIM_SPEED = window.__CURRENT_SIM_SPEED || 1;

	window.setSimSpeed = (factor) => {
		const f = (typeof factor === 'number' && factor >= 0) ? factor : 1;
		window.__TARGET_SIM_SPEED = f; // Remember the intended speed
		window.__CURRENT_SIM_SPEED = f; // Current active speed
		window.__SIM_SPEED = f; // Legacy compatibility
		engine.timing.timeScale = f;

		// windmill runtime is driven from stored baseRPS in updatePhysics; no per-windmill scaling needed here
		// pause or resume the Runner so physics and simulation-time advance stop/start coherently
		try {
			window.__runnerPaused = window.__runnerPaused || false;
			if (typeof runner !== 'undefined' && runner) {
				if (f === 0 && !window.__runnerPaused) {
					try { Runner.stop(runner); } catch (e) { /* ignore */ }
					window.__runnerPaused = true;
				} else if (f > 0 && window.__runnerPaused) {
					try { Runner.run(runner, engine); } catch (e) { /* ignore */ }
					window.__runnerPaused = false;
				}
			}
		} catch (e) { /* ignore */ }

		// Update dev palette UI to reflect current speed
		if (devPaletteEl) {
			const slider = devPaletteEl.querySelector('.dp-speed');
			const val = devPaletteEl.querySelector('.dp-speed-val');
			if (slider && val) {
				slider.value = f.toString();
				val.textContent = f.toFixed(1) + 'x';
			}
		}
	};

	window.pauseSimulation = () => {
		// Store current target speed before pausing
		const currentTarget = window.__TARGET_SIM_SPEED || 1;
		window.setSimSpeed(0);
		window.__TARGET_SIM_SPEED = currentTarget; // Restore target speed for resume
	};

	window.resumeSimulation = () => {
		const targetSpeed = window.__TARGET_SIM_SPEED || 1;
		window.setSimSpeed(targetSpeed);
	};

	// --- Dev/Editor API ---
	function setupEditorAPI() {
		window.EDITOR = {
			getPegs: () => pegs.map(b => ({ x: b.position.x, y: b.position.y, r: b.circleRadius || C.PEG_RADIUS })),
			clearPegs: () => { if (pegs.length) Composite.remove(world, pegs); pegs.length = 0; },
			addPeg: (x, y, r) => {
				const peg = Bodies.circle(Math.round(x), Math.round(y), r || C.PEG_RADIUS, { isStatic: true, label: 'peg', restitution: 0.8, friction: 0.05, render: { fillStyle: L.pegs.color } });
				pegs.push(peg);
				Composite.add(world, peg);
				return peg;
			},
			removePegAt: (x, y, threshold = 12) => {
				const found = window.EDITOR.findPegUnder(x, y, threshold);
				return found ? window.EDITOR.removePeg(found) : false;
			},
			removePegAtClient: (clientX, clientY, threshold = 12) => {
				try {
					const canvas = render.canvas;
					const r = canvas.getBoundingClientRect();
					const scaleX = canvas.width / r.width;
					const scaleY = canvas.height / r.height;
					const x = (clientX - r.left) * scaleX;
					const y = (clientY - r.top) * scaleY;
					const found = window.EDITOR.findPegUnder(x, y, threshold);
					return found ? window.EDITOR.removePeg(found) : false;
				} catch (e) { return false; }
			},
			findPegUnder: (x, y, threshold = 12) => {
				let bestPeg = null, bestDist = Infinity;
				for (const peg of pegs) {
					const d = Math.hypot(peg.position.x - x, peg.position.y - y);
					if (d < bestDist) { bestDist = d; bestPeg = peg; }
				}
				return (bestDist <= threshold) ? bestPeg : null;
			},
			removePeg: (body) => {
				const index = pegs.indexOf(body);
				if (index > -1) {
					Composite.remove(world, body);
					pegs.splice(index, 1);
					return true;
				}
				return false;
			},
			exportPegs: () => {
				const list = window.EDITOR.getPegs().map(p => {
					const out = { x: Math.round(p.x), y: Math.round(p.y) };
					if (p.r && p.r !== C.PEG_RADIUS) out.r = p.r;
					return out;
				});
				list.sort((a, b) => (a.y !== b.y) ? a.y - b.y : a.x - b.x);
				return JSON.stringify(list, null, '	');
			},
			importPegs: (json) => {
				try {
					const list = (typeof json === 'string') ? JSON.parse(json) : json;
					if (!Array.isArray(list)) return false;
					window.EDITOR.clearPegs();
					list.forEach(p => window.EDITOR.addPeg(p.x, p.y, p.r));
					return true;
				} catch (e) { return false; }
			}
		};
		window.setPegPreset = (name) => {
			window.PEG_PRESET = name || 'default';
			loadPresetAndBuild(window.PEG_PRESET);
		};
	}

	function createDevPalette() {
		if (devPaletteEl) return devPaletteEl;
		const el = document.createElement('div');
		el.className = 'dev-palette';
		el.style.cssText = 'position:fixed; right:18px; bottom:18px; background:rgba(0,0,0,0.7); color:#fff; padding:10px 12px; border-radius:8px; font-size:13px; z-index:10000;';
		el.innerHTML = '<div style="font-weight:600;margin-bottom:6px;">開発者パレット</div>' +
			'<div>投入: <span class="dp-total">0</span></div>' +
			'<div>当たり(合計): <span class="dp-hit-total">0</span> <span class="dp-hit-pct" style="margin-left:8px;font-size:11px;opacity:0.9">0%</span></div>' +
			'<div>オレンジ: <span class="dp-orange">0</span> <span class="dp-orange-pct" style="margin-left:8px;font-size:11px;opacity:0.9">0%</span></div>' +
			'<div>青: <span class="dp-blue">0</span> <span class="dp-blue-pct" style="margin-left:8px;font-size:11px;opacity:0.9">0%</span></div>' +
			'<div>ハズレ: <span class="dp-miss">0</span></div>' +
			'<div style="margin-top:8px; font-size:11px; opacity:0.8;">Editor independent</div>' +
			// simulation controls
			'<div style="margin-top:8px; font-size:12px;">' +
			'速度: <input type="range" class="dp-speed" min="0.1" max="2" step="0.1" value="1" style="vertical-align:middle; width:120px;"> <span class="dp-speed-val">1.0x</span>' +
			'</div>' +
			'<div style="margin-top:6px;"><button class="dp-pause">一時停止</button> <button class="dp-resume">再開</button> <button class="dp-slow">0.5x</button> <button class="dp-fast">2x</button></div>' +
			// stopwatch display (starts when dropping, stops when released)
			'<div style="margin-top:8px; font-size:12px;">ストップウォッチ: <span class="dp-stopwatch">0.0s</span></div>';
		document.body.appendChild(el);
		devPaletteEl = el;

		// wire up sim controls
		try {
			const slider = el.querySelector('.dp-speed');
			const val = el.querySelector('.dp-speed-val');
			const btnPause = el.querySelector('.dp-pause');
			const btnResume = el.querySelector('.dp-resume');
			const btnSlow = el.querySelector('.dp-slow');
			const btnFast = el.querySelector('.dp-fast');
			if (slider && val) {
				slider.addEventListener('input', (ev) => {
					const f = parseFloat(ev.target.value) || 1;
					val.textContent = f.toFixed(1) + 'x';
					window.setSimSpeed(f);
				});
			}
			if (btnPause) btnPause.addEventListener('click', () => { window.pauseSimulation(); });
			if (btnResume) btnResume.addEventListener('click', () => { window.resumeSimulation(); });
			if (btnSlow) btnSlow.addEventListener('click', () => { window.setSimSpeed(0.5); });
			if (btnFast) btnFast.addEventListener('click', () => { window.setSimSpeed(2); });
		} catch (e) { /* ignore wiring errors */ }

		// --- Stopwatch (sync with gameState.dropping) ---
		try {
			const swEl = el.querySelector('.dp-stopwatch');
			let swAccum = 0; // ms accumulated when stopped
			let swStart = null; // performance.now when running
			let swRunning = false;
			function formatMs(ms) {
				if (ms < 1000) return (ms / 1000).toFixed(2) + 's';
				const s = Math.floor(ms / 1000);
				const rem = Math.floor((ms % 1000) / 10);
				return s + '.' + (rem < 10 ? '0' + rem : rem) + 's';
			}

			function swUpdate(now) {
				try {
					const gs = (window.__getGameState && window.__getGameState()) || {};
					if (gs.dropping && !swRunning) {
						// start
						swStart = performance.now();
						swRunning = true;
					}
					if (!gs.dropping && swRunning) {
						// stop and accumulate
						swAccum += (performance.now() - (swStart || performance.now()));
						swStart = null;
						swRunning = false;
					}
					let disp = swAccum;
					if (swRunning && swStart) disp += (performance.now() - swStart);
					if (swEl) swEl.textContent = formatMs(disp);
				} catch (e) { /* ignore */ }
				el.__swRAF = requestAnimationFrame(swUpdate);
			}
			// start RAF loop
			el.__swRAF = requestAnimationFrame(swUpdate);
			// expose simple controls for debugging
			el.__sw_reset = () => { swAccum = 0; swStart = null; swRunning = false; if (swEl) swEl.textContent = formatMs(0); };
		} catch (e) { /* ignore stopwatch errors */ }
		return el;
	}

	window.toggleDevPalette = (on) => {
		if (typeof on === 'boolean') {
			if (on) createDevPalette(); else if (devPaletteEl) { devPaletteEl.remove(); devPaletteEl = null; }
		} else {
			if (devPaletteEl) { devPaletteEl.remove(); devPaletteEl = null; } else createDevPalette();
		}
		return !!devPaletteEl;
	};

	function syncWindowCounters() {
		window.totalDrops = gameState.totalDrops;
		window.orangeHits = gameState.orangeHits;
		window.blueHits = gameState.blueHits;
		window.missHits = gameState.missHits;
		window.__BATCH_SUPPRESSED_COUNT = window.__BATCH_SUPPRESSED_COUNT || 0;
	}

	// --- Initialization ---
	function init() {
		createWalls();
		createMissZones();
		createWindmills();
		createGates();
		createFeatures();
		createGuards();
		// force startup preset to configured default (DEFAULT_PEG_PRESET). This ensures pegs3 is used on load.
		window.PEG_PRESET = (C && C.DEFAULT_PEG_PRESET) ? C.DEFAULT_PEG_PRESET : 'pegs3';
		loadPresetAndBuild(window.PEG_PRESET);
		setupEventListeners();
		if (C.EDITOR_ENABLED) setupEditorAPI();
		if (C.DEV_PALETTE_ENABLED === undefined ? true : C.DEV_PALETTE_ENABLED) createDevPalette();
		updateStats();

		// --- Rainbow Pegs Feature ---
		window.startPegRainbow = (ms = 120) => {
			if (_pegRainbowTimer) return false; // already running
			window._pegRainbowState = window._pegRainbowState || { hue: 0 };
			_pegRainbowTimer = setInterval(() => {
				window._pegRainbowState.hue = (window._pegRainbowState.hue + 6) % 360;
				const hueBase = window._pegRainbowState.hue;
				for (let i = 0; i < pegs.length; i++) {
					const p = pegs[i];
					const localHue = (hueBase + (i * (360 / Math.max(1, pegs.length)))) % 360;
					p.render.fillStyle = `hsl(${Math.round(localHue)},75%,60%)`;
				}
			}, ms);
			return true;
		};
		window.stopPegRainbow = () => {
			if (!_pegRainbowTimer) return false;
			clearInterval(_pegRainbowTimer);
			_pegRainbowTimer = null;
			// restore base color
			const pegColor = (L.pegs && L.pegs.color) || '#bdc3c7';
			for (const p of pegs) {
				p.render.fillStyle = pegColor;
			}
			return true;
		};
		window.setPegRainbowEnabled = (on, ms) => {
			const rainbowMs = (typeof ms === 'number') ? ms : ((C.DEBUG && C.DEBUG.PEG_RAINBOW_MS) || 120);
			let enabled = on;
			if (typeof enabled !== 'boolean') {
				enabled = !_pegRainbowTimer;
			}
			if (enabled) {
				window.startPegRainbow(rainbowMs);
			} else {
				window.stopPegRainbow();
			}
			return enabled;
		};

		// --- Global Helpers ---
		window.updateStats = updateStats;
		window.__DROP_CALLS = 0;
		const originalDropBall = dropBall;
		window.dropBall = (opts) => { window.__DROP_CALLS++; originalDropBall(opts); };
		window.resetBatchSuppressedCount = () => { window.__BATCH_SUPPRESSED_COUNT = 0; };
		window.resetCounters = () => {
			Object.assign(gameState, { totalDrops: 0, orangeHits: 0, blueHits: 0, missHits: 0 });
			window.__BATCH_SUPPRESSED_COUNT = 0;
			updateStats();
		};

		// --- Startup ---
		if (C.DEBUG && C.DEBUG.PEG_RAINBOW_ENABLED) {
			try { window.setPegRainbowEnabled(true); } catch (e) { /* ignore */ }
		}
	}

	init();
})();
