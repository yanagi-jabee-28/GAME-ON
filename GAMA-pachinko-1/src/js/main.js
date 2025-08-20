// Refactored main game script for the Pachinko simulator
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
		missHits: 0,   // missZone
		dropInterval: null,
		spaceDown: false,
	};

	// --- UI Elements ---
	const dropButton = document.getElementById('drop-button');
	const messageBox = document.getElementById('message-box');
	const statsEl = createStatsElement();

	// --- Batch execution state (for dev-tools) ---
	window.__BATCH_NO_RESPAWN = window.__BATCH_NO_RESPAWN || false;
	window.__BATCH_SUPPRESSED_COUNT = window.__BATCH_SUPPRESSED_COUNT || 0;

	// --- Engine and World Setup ---
	const engine = Engine.create({
		gravity: { y: C.GRAVITY_Y ?? 0.6 }
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

	// --- Game Objects ---
	const pegs = [];
	const gates = [];
	const windmills = [];

	// --- Create Game Elements ---

	function createWalls() {
		const wallOptions = { isStatic: true, render: { visible: false } };
		Composite.add(world, [
			Bodies.rectangle(GAME_WIDTH, GAME_HEIGHT / 2, 20, GAME_HEIGHT, wallOptions), // Right
			Bodies.rectangle(0, GAME_HEIGHT / 2, 20, GAME_HEIGHT, wallOptions)      // Left
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

		const createWindmill = (cx, cy, speed) => {
			const compound = Body.create({
				parts: [
					Bodies.circle(cx, cy, 6, { isStatic: true, restitution: 0.8, render: { fillStyle: WM.hubColor } }),
					...Array.from({ length: WM.blades }, (_, i) => {
						const angle = (i / WM.blades) * Math.PI * 2;
						const bx = cx + Math.cos(angle) * (WM.radius / 2);
						const by = cy + Math.sin(angle) * (WM.radius / 2);
						const blade = Bodies.rectangle(bx, by, WM.bladeH, WM.bladeW, { isStatic: true, restitution: 0.8, render: { fillStyle: WM.color } });
						Body.setAngle(blade, angle);
						return blade;
					})
				],
				isStatic: true,
				label: 'windmill'
			});
			Composite.add(world, compound);
			windmills.push({ body: compound, speed });
		};

		createWindmill(centerX - layout.offsetX, layout.y, baseSpeed * (WM.leftCW ? 1 : -1));
		createWindmill(centerX + layout.offsetX, layout.y, baseSpeed * (WM.rightCW ? 1 : -1));
		if (C.ENABLE_CENTER_WINDMILL) {
			createWindmill(centerX, layout.centerY, baseSpeed * (WM.centerCW ? 1 : -1));
		}
	}

	function createGates() {
		const layout = L.gates;
		const gateHalf = layout.length / 2;
		// Gate angles: use degree-based config when enabled via GATE_ANGLE_IN_DEGREES,
		// otherwise fall back to legacy radian values.
		if (C.GATE_ANGLE_IN_DEGREES) {
			const openDeg = (typeof C.GATE_OPEN_ANGLE_DEG === 'number') ? C.GATE_OPEN_ANGLE_DEG : (C.GATE_OPEN_ANGLE ? (C.GATE_OPEN_ANGLE * 180 / Math.PI) : 132);
			const closedDeg = (typeof C.GATE_CLOSED_ANGLE_DEG === 'number') ? C.GATE_CLOSED_ANGLE_DEG : (C.GATE_CLOSED_ANGLE ? (C.GATE_CLOSED_ANGLE * 180 / Math.PI) : 17.2);
			var gateOpenBase = openDeg * Math.PI / 180;
			var gateClosedBase = closedDeg * Math.PI / 180;
		} else {
			var gateOpenBase = (C.GATE_OPEN_ANGLE || 2.3);
			var gateClosedBase = (C.GATE_CLOSED_ANGLE || 0.3);
		}

		const createGate = (side) => {
			const pivot = { x: (GAME_WIDTH / 2) + (side === 'left' ? -layout.offsetX : layout.offsetX), y: layout.y };
			const closedAngle = (side === 'left' ? -1 : 1) * gateClosedBase;
			const openAngle = (side === 'left' ? -1 : 1) * gateOpenBase;
			const center = { x: pivot.x - Math.sin(closedAngle) * gateHalf, y: pivot.y + Math.cos(closedAngle) * gateHalf };
			const gateBody = Bodies.rectangle(center.x, center.y, layout.width, layout.length, { isStatic: true, label: 'gate', render: { fillStyle: layout.color } });
			Body.setAngle(gateBody, closedAngle);
			Composite.add(world, gateBody);
			gates.push({ body: gateBody, pivot, length: layout.length, targetAngle: openAngle, closedAngle, openAngle });
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

		// Fences
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

	// --- Peg Generation ---
	function buildPegs(preset) {
		if (pegs.length) Composite.remove(world, pegs);
		pegs.length = 0;
		preset = preset || window.PEG_PRESET || 'default';
		if (preset === 'none') return;

		const layout = L.pegs;
		const pegOptions = { isStatic: true, label: 'peg', restitution: 0.8, friction: 0.05, render: { fillStyle: layout.color } };
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
				const dx = b.position.x - x;
				const dy = b.position.y - y;
				const centerDist = Math.hypot(dx, dy);
				const minCenter = (b.circleRadius || C.PEG_RADIUS) + r + requiredSurface;
				if (centerDist < minCenter) return;
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
		const randomX = GAME_WIDTH / 2 + (Math.random() - 0.5) * 100;
		const colors = L.ballColors;
		const color = options.isNavy ? colors.fromNavy : (options.fromBlue ? colors.fromBlue : colors.default);
		const ballCollision = C.BALLS_INTERACT ? {} : { collisionFilter: { group: -C.BALL_GROUP_ID } };

		const ball = Bodies.circle(randomX, -20, C.BALL_RADIUS, {
			label: 'ball', restitution: 0.9, friction: 0.05,
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

	function createDebris(x, y, color) {
		const debris = Array.from({ length: 8 }, () => {
			const angle = Math.random() * Math.PI * 2;
			const speed = 3 + Math.random() * 4;
			const particle = Bodies.circle(x, y, 1 + Math.random() * 2, {
				label: 'debris', friction: 0.05, restitution: 0.4,
				render: { fillStyle: color }, collisionFilter: { group: -1 }
			});
			Body.setVelocity(particle, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 2 });
			return particle;
		});
		Composite.add(world, debris);
		playSound('debris');
		simTimeout(() => Composite.remove(world, debris), 200);
	}

	function handleHit(ball, type) {
		if (!ball || ball.isHitting) return;

		let sfxKey, debrisColor, newBallOptions;
		const isMiss = type === 'miss' || type === 'wall' || type === 'floorMiss';

		if (isMiss) {
			if (type !== 'floorMiss' && ball.isImmuneToMiss) return;
			gameState.missHits++;
			sfxKey = 'miss';
			debrisColor = ball.render.fillStyle;
		} else if (type === 'startChucker') {
			gameState.orangeHits++;
			sfxKey = 'chucker';
			debrisColor = L.features.chucker.color;
			newBallOptions = { fromBlue: true, isNavy: true };
		} else if (type === 'tulip') {
			gameState.blueHits++;
			sfxKey = 'tulip';
			debrisColor = L.features.tulip.color;
			newBallOptions = { fromBlue: true, isNavy: ball.isNavy };
		} else {
			return; // Unknown type
		}

		ball.isHitting = true;
		updateStats();
		createDebris(ball.position.x, ball.position.y, debrisColor);
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

		window.addEventListener('keydown', (e) => {
			if (e.code === 'Space' && !gameState.spaceDown) {
				gameState.spaceDown = true;
				start(e);
			}
		});
		window.addEventListener('keyup', (e) => {
			if (e.code === 'Space') {
				gameState.spaceDown = false;
				stop(e);
			}
		});

		Events.on(engine, 'beforeUpdate', updatePhysics);
		Events.on(engine, 'collisionStart', handleCollisions);
		Events.on(engine, 'afterUpdate', sweepAndPrune);
	}

	function updatePhysics() {
		windmills.forEach(w => Body.setAngle(w.body, w.body.angle + w.speed));
		gates.forEach(g => {
			const d = g.targetAngle - g.body.angle;
			if (Math.abs(d) > 0.001) {
				const newAng = g.body.angle + d * 0.25;
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
			if (!ball) continue;
			const other = (ball === pair.bodyA) ? pair.bodyB : pair.bodyA;

			switch (other.label) {
				case 'windmill':
					const force = 0.2, upBias = -0.04;
					const dx = ball.position.x - other.position.x, dy = ball.position.y - other.position.y;
					const len = Math.hypot(dx, dy) || 1;
					Body.applyForce(ball, ball.position, { x: (dx / len) * force, y: (dy / len) * force + upBias });
					break;
				case 'wall':
					if (ENABLE_WALL_MISS) handleHit(ball, 'wall');
					break;
				case 'missZone':
					handleHit(ball, 'miss');
					break;
				case 'floorMissZone':
					handleHit(ball, 'floorMiss');
					break;
			}
		}
	}

	function sweepAndPrune() {
		const targets = Composite.allBodies(world).filter(b => b.label === 'startChucker' || b.label === 'tulip');
		const balls = Composite.allBodies(world).filter(b => b.label === 'ball');

		for (const ball of balls) {
			if (ball.isHitting) continue;
			const prev = ball.lastPos || ball.position;
			const curr = ball.position;

			if ((curr.y - prev.y) > 0.05) {
				for (const target of targets) {
					if (prev.y < target.bounds.min.y && curr.y >= target.bounds.min.y) {
						const tRatio = (target.bounds.min.y - prev.y) / ((curr.y - prev.y) || 1);
						const xCross = prev.x + (curr.x - prev.x) * tRatio;
						if (xCross >= target.bounds.min.x - 3 && xCross <= target.bounds.max.x + 3) {
							handleHit(ball, target.label);
							break;
						}
					}
				}
			}

			if (ball.position.y > GAME_HEIGHT + 300) {
				try { Composite.remove(world, ball); } catch (e) { /* ignore */ }
			}
			ball.lastPos = { x: curr.x, y: curr.y };
		}
	}

	// --- UI & Stats ---
	function createStatsElement() {
		const el = document.createElement('div');
		el.style.cssText = 'pointer-events:none; position:absolute; bottom:20px; right:20px; padding:6px 10px; background:rgba(0,0,0,0.6); color:white; border-radius:6px; font-size:14px;';
		document.querySelector('.game-container').appendChild(el);
		return el;
	}

	function updateStats() {
		const { totalDrops, orangeHits, blueHits, missHits } = gameState;
		const orangeRatio = totalDrops ? Math.round((orangeHits / totalDrops) * 1000) / 10 : 0;
		const blueRatio = totalDrops ? Math.round((blueHits / totalDrops) * 1000) / 10 : 0;
		statsEl.textContent = `投入:${totalDrops}  オレンジ:${orangeHits}(${orangeRatio}%)  青:${blueHits}(${blueRatio}%)  ハズレ:${missHits}`;
		syncWindowCounters();
	}

	function showMessage(text, duration = 2000) {
		messageBox.textContent = text;
		messageBox.style.visibility = 'visible';
		simTimeout(() => { messageBox.style.visibility = 'hidden'; }, duration);
	}

	// --- Audio ---
	function playSound(key) {
		try {
			if (C.SFX && C.SFX[key]) AudioBus.sfxSimple(C.SFX[key]);
		} catch (e) { /* ignore */ }
	}

	// --- Simulation Time Scaling ---
	window.__SIM_SPEED = window.__SIM_SPEED || 1;
	const simTimeout = (fn, ms) => setTimeout(fn, Math.max(0, ms / (window.__SIM_SPEED || 1)));
	window.setSimSpeed = (factor) => { window.__SIM_SPEED = (factor > 0) ? factor : 1; };

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
			setPegColor: (body, color) => { if (body) body.render.fillStyle = color; },
			exportPegs: () => JSON.stringify(window.EDITOR.getPegs()),
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
		window.setPegPreset = (name) => { window.PEG_PRESET = name || 'default'; buildPegs(window.PEG_PRESET); };
	}

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
		buildPegs(window.PEG_PRESET || 'default');
		setupEventListeners();
		setupEditorAPI();
		updateStats();

		// Expose helpers for dev-tools
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
	}

	init();

})();