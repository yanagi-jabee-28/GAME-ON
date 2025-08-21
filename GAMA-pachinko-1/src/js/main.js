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
		dropInterval: null,
		spaceDown: false,
	};

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
	});
	const world = engine.world;
	const render = Render.create({
		canvas: document.getElementById('pachinko-canvas'),
		engine: engine,
		options: {
			width: GAME_WIDTH,
			height: GAME_HEIGHT,
			wireframes: false,
			background: 'transparent'
		}
	});
	Render.run(render);
	const runner = Runner.create();
	Runner.run(runner, engine);

	// Developer overlay: draw drop distribution graph if enabled in config
	(function setupDropGraphOverlay() {
		const dropCfg = (C.DROP || {});
		if (!dropCfg.showGraph) return;
		Events.on(render, 'afterRender', () => {
			const ctx = render.context;
			const canvas = ctx.canvas;
			const width = canvas.width;
			const graphW = Math.min(width - 40, dropCfg.width || 200);
			const graphH = 60;
			const left = (width - graphW) / 2;
			const top = 8;
			ctx.save();
			ctx.globalAlpha = 0.95;
			ctx.fillStyle = 'rgba(0,0,0,0)';
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
			ctx.restore();
		});
	})();

	// --- Game Objects ---
	const pegs = [];
	const gates = [];
	const windmills = [];
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
		const baseSpeed = WM.baseSpeed ?? 0.08;
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
			windmills.push({ body: compound, speed });
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
				let speed = baseSpeed * dirSign;
				if (typeof it.speed === 'number') {
					speed = it.speed;
				} else if (typeof it.speedMultiplier === 'number') {
					speed = baseSpeed * it.speedMultiplier * dirSign;
				}
				createWindmill(cx, cy, blades, radius, bladeW, bladeH, speed, it.color || WM.color, it.hubColor || WM.hubColor);
			});
		} else {
			createWindmill(centerX - layout.offsetX, layout.y, WM.blades, WM.radius, WM.bladeW, WM.bladeH, baseSpeed * (WM.leftCW ? 1 : -1), WM.color, WM.hubColor);
			createWindmill(centerX + layout.offsetX, layout.y, WM.blades, WM.radius, WM.bladeW, WM.bladeH, baseSpeed * (WM.rightCW ? 1 : -1), WM.color, WM.hubColor);
			if (C.ENABLE_CENTER_WINDMILL) {
				createWindmill(centerX, layout.centerY, WM.blades, WM.radius, 6, WM.bladeH, baseSpeed * (WM.centerCW ? 1 : -1), WM.color, WM.hubColor);
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
		} else if (type === 'startChucker') {
			gameState.orangeHits++;
			sfxKey = 'chucker';
			newBallOptions = { fromBlue: true, isNavy: true };
		} else if (type === 'tulip') {
			gameState.blueHits++;
			sfxKey = 'tulip';
			newBallOptions = { fromBlue: true, isNavy: ball.isNavy };
		} else {
			return;
		}
		ball.isHitting = true;
		updateStats();
		playSound(sfxKey);
		try { Composite.remove(world, ball); } catch (e) { /* ignore */ }
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
		const start = (e) => { e.preventDefault(); if (gameState.dropInterval) return; gameState.dropInterval = setInterval(dropBall, C.DROP_INTERVAL_MS); };
		const stop = (e) => { e.preventDefault(); clearInterval(gameState.dropInterval); gameState.dropInterval = null; };
		dropButton.addEventListener('mousedown', start);
		dropButton.addEventListener('mouseup', stop);
		dropButton.addEventListener('mouseleave', stop);
		dropButton.addEventListener('touchstart', start);
		dropButton.addEventListener('touchend', stop);
		window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !gameState.spaceDown) { gameState.spaceDown = true; start(e); } });
		window.addEventListener('keyup', (e) => { if (e.code === 'Space') { gameState.spaceDown = false; stop(e); } });
		Events.on(engine, 'beforeUpdate', updatePhysics);
		Events.on(engine, 'collisionStart', handleCollisions);
		Events.on(engine, 'afterUpdate', () => {
			// Prune off-screen balls
			const balls = Composite.allBodies(world).filter(b => b.label === 'ball');
			for (const ball of balls) {
				if (ball.position.y > GAME_HEIGHT + 300) {
					try { Composite.remove(world, ball); } catch (e) { /* ignore */ }
				}
			}
		});
	}

	function updatePhysics() {
		windmills.forEach(w => Body.rotate(w.body, w.speed));
		gates.forEach(g => {
			const d = g.targetAngle - g.body.angle;
			if (Math.abs(d) > 0.01) {
				const newAng = g.body.angle + d * 0.2;
				const half = g.length / 2;
				const cx = g.pivot.x - Math.sin(newAng) * half;
				const cy = g.pivot.y + Math.cos(newAng) * half;
				Body.setPosition(g.body, { x: cx, y: cy });
				Body.setAngle(g.body, newAng);
			}
		});
	}

	function handleCollisions(event) {
		for (const pair of event.pairs) {
			const ball = (pair.bodyA.label === 'ball') ? pair.bodyA : (pair.bodyB.label === 'ball' ? pair.bodyB : null);
			if (!ball || ball.isHitting) continue;
			const other = (ball === pair.bodyA) ? pair.bodyB : pair.bodyA;
			switch (other.label) {
				case 'wall': if (ENABLE_WALL_MISS) handleHit(ball, 'wall'); break;
				case 'missZone': handleHit(ball, 'miss'); break;
				case 'floorMissZone': handleHit(ball, 'floorMiss'); break;
				case 'startChucker': handleHit(ball, 'startChucker'); break;
				case 'tulip': handleHit(ball, 'tulip'); break;
				case 'windmill': playSound('windmill'); break;
				case 'peg': playSound('debris'); break; // Simple sound on peg hit
			}
		}
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
	const simTimeout = (fn, ms) => setTimeout(fn, Math.max(0, ms / (window.__SIM_SPEED || 1)));
	window.setSimSpeed = (factor) => {
		const f = (factor > 0) ? factor : 1;
		window.__SIM_SPEED = f;
		engine.timing.timeScale = f;
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
			'<div style="margin-top:8px; font-size:11px; opacity:0.8;">Editor independent</div>';
		document.body.appendChild(el);
		devPaletteEl = el;
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
		window.PEG_PRESET = window.PEG_PRESET || 'pegs2';
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
