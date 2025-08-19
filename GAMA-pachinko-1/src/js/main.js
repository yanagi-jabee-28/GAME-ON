// Extracted from index.html: main game script for the Pachinko simulator
// Keeps behavior identical to the previous inline script.
(function () {
	'use strict';

	// --- Matter.js モジュールの準備 ---
	const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

	// --- ゲーム設定 ---
	const GAME_WIDTH = 450;
	const GAME_HEIGHT = 700;
	const ENABLE_WALL_MISS = true; // 壁に当たった時にハズレにするかどうか
	let dropInterval = null;

	// --- UI要素の取得 ---
	const dropButton = document.getElementById('drop-button');
	const messageBox = document.getElementById('message-box');

	// 投下数 / 役物ヒット数カウンタ
	let totalDrops = 0;
	let orangeHits = 0; // startChucker
	let blueHits = 0;   // tulip
	let missHits = 0;   // ハズレ（missZone）

	// 比率表示要素を作る
	const statsEl = document.createElement('div');
	statsEl.style.pointerEvents = 'none';
	statsEl.style.position = 'absolute';
	statsEl.style.bottom = '20px';
	statsEl.style.right = '20px';
	statsEl.style.padding = '6px 10px';
	statsEl.style.background = 'rgba(0,0,0,0.6)';
	statsEl.style.color = 'white';
	statsEl.style.borderRadius = '6px';
	statsEl.style.fontSize = '14px';
	statsEl.textContent = '投入:0  当たり:0  比率:0%';
	document.querySelector('.game-container').appendChild(statsEl);

	// --- Matter.js エンジンの初期化 ---
	const engine = Engine.create({
		gravity: { y: (window.CONFIG && window.CONFIG.GRAVITY_Y) ?? 0.6 }
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

	// --- 壁の作成（床なし） ---
	const wallOptions = { isStatic: true, render: { visible: false } };
	Composite.add(world, [
		Bodies.rectangle(GAME_WIDTH, GAME_HEIGHT / 2, 20, GAME_HEIGHT, wallOptions), // 右
		Bodies.rectangle(0, GAME_HEIGHT / 2, 20, GAME_HEIGHT, wallOptions)      // 左
	]);

	// 左右の壁を左右対称に再配置（中央基準）
	const guideWallOffset = (window.CONFIG && window.CONFIG.GUIDE_WALL_OFFSET) || 30;
	const guideAngle = (window.CONFIG && window.CONFIG.GUIDE_WALL_ANGLE) || 0.2;
	const centerX0 = GAME_WIDTH / 2; // 純粋な中央基準
	Composite.add(world, [
		Bodies.rectangle(centerX0 - guideWallOffset, 450, 10, 500, { isStatic: true, angle: -guideAngle, render: { fillStyle: '#95a5a6' }, label: 'wall' }),
		Bodies.rectangle(centerX0 + guideWallOffset, 450, 10, 500, { isStatic: true, angle: guideAngle, render: { fillStyle: '#95a5a6' }, label: 'wall' })
	]);

	// --- 釘の森を生成 (中央揃えに調整) ---
	const pegs = [];
	// 配置済み位置の記録（Body を作る前に重なりを避けるために使う）
	const selectedPositions = [];
	const pegOptions = {
		isStatic: true, label: 'peg', restitution: 0.8, friction: 0.05,
		render: { fillStyle: '#bdc3c7' }
	};

	const spacing = (window.CONFIG && window.CONFIG.PEG_SPACING) || 35;

	// チューリップ上部の矩形除外（釘が重なりやすい場所を広めに取り除く）
	var exclusionRects = [
		{ x: 120, y: 410, w: 90, h: 60 }, // 左チューリップ上
		{ x: GAME_WIDTH - 120, y: 410, w: 90, h: 60 } // 右チューリップ上
	];
	// 画面内上部に追加の釘行（CONFIG.TOP_ROW_YS）
	{
		const topRows = (window.CONFIG && window.CONFIG.TOP_ROW_YS) || [20, 50];
		const minDist = 12;
		topRows.forEach((topY, idx) => {
			const cols = (idx % 2 === 0) ? 9 : 8; // 交互に列数を変えて中央揃え
			const rowWidth = (cols - 1) * spacing;
			const xOffset = (GAME_WIDTH - rowWidth) / 2;
			for (let col = 0; col < cols; col++) {
				const x = xOffset + col * spacing; // ジッタ無し
				let tooClose = false;
				for (let rect of exclusionRects) {
					if (Math.abs(x - rect.x) < rect.w / 2 && Math.abs(topY - rect.y) < rect.h / 2) { tooClose = true; break; }
				}
				for (let pos of selectedPositions) {
					const dx = pos.x - x;
					const dy = pos.y - topY;
					if (dx * dx + dy * dy < minDist * minDist) { tooClose = true; break; }
				}
				if (!tooClose) { selectedPositions.push({ x, y: topY }); pegs.push(Bodies.circle(x, topY, 4, pegOptions)); }
			}
		});
	}

	const rows = (window.CONFIG && window.CONFIG.PEG_ROWS) || 18;

	// スタックしやすい領域（風車・へそ・チューリップ周辺）は釘を減らす / ジッタを入れる
	const cx = GAME_WIDTH / 2;
	const exclusionZones = [
		{ x: cx, y: 320, r: 70 }, // 中央風車周辺
		{ x: cx - 80, y: 320, r: 50 }, // 左風車
		{ x: cx + 80, y: 320, r: 50 }, // 右風車
		{ x: cx, y: 580, r: 60 }, // startChucker 上
		{ x: 120, y: 450, r: 48 }, // tulip left
		{ x: GAME_WIDTH - 120, y: 450, r: 48 } // tulip right
	];
	for (let row = 0; row < rows; row++) {
		const y = 80 + row * 30;

		const isEven = (row % 2 === 0);
		const cols = isEven ? 8 : 9;
		const rowWidth = (cols - 1) * spacing;
		const xOffset = (GAME_WIDTH - rowWidth) / 2; // 中央揃え

		const minDist = 12;
		for (let col = 0; col < cols; col++) {
			const x = xOffset + col * spacing;

			// チューリップ上部の矩形除外チェック
			let skip = false;
			for (let rect of exclusionRects) {
				if (Math.abs(x - rect.x) < rect.w / 2 && Math.abs(y - rect.y) < rect.h / 2) { skip = true; break; }
			}
			if (skip) continue;
			// 除外ゾーン
			for (let z of exclusionZones) {
				const dx = x - z.x;
				const dy = y - z.y;
				if (dx * dx + dy * dy < z.r * z.r) { skip = true; break; }
			}
			if (skip) continue;

			// selectedPositions で衝突チェック
			let tooClose = false;
			for (let pos of selectedPositions) {
				const dx = pos.x - x;
				const dy = pos.y - y;
				if (dx * dx + dy * dy < minDist * minDist) { tooClose = true; break; }
			}
			if (!tooClose) { selectedPositions.push({ x, y }); pegs.push(Bodies.circle(x, y, 4, pegOptions)); }
		}
	}
	Composite.add(world, pegs);

	// 役物周りの追加ペグ
	const extraPegs = [];
	const centerX = GAME_WIDTH / 2;
	const barrierY = 540; // startChucker の少し上
	const barrierSpacing = 30;
	for (let i = -1; i <= 1; i++) {
		if (i === 0) continue; // 真ん中は開ける
		extraPegs.push(Bodies.circle(centerX + i * barrierSpacing, barrierY, 5, pegOptions));
	}
	for (let i = -2; i <= 2; i++) {
		if (i % 2 === 0) continue; // 間隔を空ける
		extraPegs.push(Bodies.circle(centerX + i * (barrierSpacing / 1.5), barrierY + 10, 5, pegOptions));
	}

	// チューリップ周りの左右に小さなガード
	const tulipY = 430; // tulip の少し上
	const tulipLeftX = 120;
	const tulipRightX = GAME_WIDTH - 120;
	const tulipGuardOffset = 18;
	extraPegs.push(Bodies.circle(tulipLeftX - tulipGuardOffset, tulipY, 5, pegOptions));
	extraPegs.push(Bodies.circle(tulipLeftX + tulipGuardOffset, tulipY, 5, pegOptions));
	extraPegs.push(Bodies.circle(tulipRightX - tulipGuardOffset, tulipY, 5, pegOptions));
	extraPegs.push(Bodies.circle(tulipRightX + tulipGuardOffset, tulipY, 5, pegOptions));
	const tulipUpperY = tulipY - 20;
	extraPegs.push(Bodies.circle(tulipLeftX - 40, tulipUpperY, 5, pegOptions));
	extraPegs.push(Bodies.circle(tulipLeftX + 40, tulipUpperY, 5, pegOptions));
	extraPegs.push(Bodies.circle(tulipRightX - 40, tulipUpperY, 5, pegOptions));
	extraPegs.push(Bodies.circle(tulipRightX + 40, tulipUpperY, 5, pegOptions));
	extraPegs.push(Bodies.circle(tulipLeftX - 70, tulipY - 8, 5, pegOptions));
	extraPegs.push(Bodies.circle(tulipRightX + 70, tulipY - 8, 5, pegOptions));

	const filteredExtraPegs = extraPegs.filter(p => {
		const px = p.position.x;
		const py = p.position.y;
		const leftX = tulipLeftX;
		if (px > leftX + 8 && px < leftX + 54 && py > tulipY - 10 && py < tulipY + 30) return false;
		const rightX = tulipRightX;
		if (px > rightX - 54 && px < rightX - 8 && py > tulipY - 10 && py < tulipY + 30) return false;
		return true;
	});
	Composite.add(world, filteredExtraPegs);

	// チューリップ上部のガイド釘を追加（オレンジの startChucker 上のガイドに似せる）
	// これにより青玉がチューリップ入口に入りやすく誘導される。
	(function addTulipGuides() {
		const guideRadius = 4;
		const guideYOffset = 12; // チューリップ上方からのオフセット
		const guideSpacing = 14;
		const guides = [];
		// 左チューリップ上部ガイド
		guides.push(Bodies.circle(tulipLeftX - guideSpacing, tulipY - guideYOffset, guideRadius, pegOptions));
		guides.push(Bodies.circle(tulipLeftX + guideSpacing, tulipY - guideYOffset, guideRadius, pegOptions));
		// 右チューリップ上部ガイド
		guides.push(Bodies.circle(tulipRightX - guideSpacing, tulipY - guideYOffset, guideRadius, pegOptions));
		guides.push(Bodies.circle(tulipRightX + guideSpacing, tulipY - guideYOffset, guideRadius, pegOptions));
		Composite.add(world, guides);
	})();

	// --- 左右の回転ゲート（ピンボール風） ---
	const gates = [];
	const gateY = 520; // 役物上部
	const gateOffsetX = 44;
	const gateLength = 60;
	const gateHalf = gateLength / 2;
	// left pivot
	const leftPivot = { x: (GAME_WIDTH / 2) - gateOffsetX, y: gateY };
	const leftCenter = { x: leftPivot.x + Math.sin(-1.0) * gateHalf, y: leftPivot.y - Math.cos(-1.0) * gateHalf };
	const leftGate = Bodies.rectangle(leftCenter.x, leftCenter.y, 10, gateLength, { isStatic: true, label: 'gate', render: { fillStyle: '#c0392b' } });
	Body.setAngle(leftGate, -1.0);
	// right pivot
	const rightPivot = { x: (GAME_WIDTH / 2) + gateOffsetX, y: gateY };
	const rightCenter = { x: rightPivot.x + Math.sin(1.0) * gateHalf, y: rightPivot.y - Math.cos(1.0) * gateHalf };
	const rightGate = Bodies.rectangle(rightCenter.x, rightCenter.y, 10, gateLength, { isStatic: true, label: 'gate', render: { fillStyle: '#c0392b' } });
	Body.setAngle(rightGate, 1.0);
	Composite.add(world, [leftGate, rightGate]);
	// openAngle は斜め上、closedAngle は水平寄り
	const OPEN_ANGLE = (window.CONFIG && window.CONFIG.GATE_OPEN_ANGLE) || 2.3;
	const CLOSED_ANGLE = (window.CONFIG && window.CONFIG.GATE_CLOSED_ANGLE) || 0.3;
	// 起動時は「閉」で配置
	const leftCenter2 = { x: leftPivot.x + Math.sin(-CLOSED_ANGLE) * gateHalf, y: leftPivot.y - Math.cos(-CLOSED_ANGLE) * gateHalf };
	Body.setPosition(leftGate, leftCenter2);
	Body.setAngle(leftGate, -CLOSED_ANGLE);
	const rightCenter2 = { x: rightPivot.x + Math.sin(CLOSED_ANGLE) * gateHalf, y: rightPivot.y - Math.cos(CLOSED_ANGLE) * gateHalf };
	Body.setPosition(rightGate, rightCenter2);
	Body.setAngle(rightGate, CLOSED_ANGLE);
	gates.push({ body: leftGate, pivot: leftPivot, length: gateLength, targetAngle: -OPEN_ANGLE, closedAngle: -CLOSED_ANGLE, openAngle: -OPEN_ANGLE });
	gates.push({ body: rightGate, pivot: rightPivot, length: gateLength, targetAngle: OPEN_ANGLE, closedAngle: CLOSED_ANGLE, openAngle: OPEN_ANGLE });

	// ゲートサイクル
	const GATE_OPEN_MS = (window.CONFIG && window.CONFIG.GATE_OPEN_MS) || 800;   // 短く開く
	const GATE_CLOSED_MS = (window.CONFIG && window.CONFIG.GATE_CLOSED_MS) || 300; // 閉
	function setGatesOpen(open) {
		gates.forEach(g => { g.targetAngle = open ? g.openAngle : g.closedAngle; });
	}
	function startGateCycle() {
		setGatesOpen(false);
		setTimeout(() => {
			setGatesOpen(true);
			setTimeout(() => {
				setGatesOpen(false);
				setTimeout(startGateCycle, GATE_CLOSED_MS);
			}, GATE_OPEN_MS);
		}, 120);
	}
	startGateCycle();

	// --- 外れゾーン（センサー）を画面下部に配置 ---
	// 筐体の下に床を置かず、下方向へ落ちた玉はここで検出して消す挙動にする
	const missZoneWidth = GAME_WIDTH - 40; // 壁を避けつつ十分な幅
	const missZoneHeight = 6;
	const missZoneY = GAME_HEIGHT - 20;
	// 床用の外れゾーン（免疫を無視して全玉を粉砕する）
	const missZone = Bodies.rectangle(GAME_WIDTH / 2, missZoneY, missZoneWidth, missZoneHeight, {
		isStatic: true, isSensor: true, label: 'floorMissZone', render: { fillStyle: 'rgba(192,57,43,0.12)', strokeStyle: 'rgba(192,57,43,0.25)' }
	});
	// 元々あった中央の外れゾーンも復活させる（互いに同じラベルにして扱いを統一する）
	const centerMissZone = Bodies.rectangle(GAME_WIDTH / 2, 200, 40, 5, {
		isStatic: true, isSensor: true, label: 'missZone', render: { fillStyle: 'rgba(192,57,43,0.35)', strokeStyle: 'rgba(192,57,43,0.7)' }
	});
	Composite.add(world, [missZone, centerMissZone]);

	// --- 風車（回転障害） ---
	const windmills = [];
	function createWindmill(cx, cy, blades = 4, radius = 70, bladeW = 8, bladeH = 60, speed = 0.06, color = '#f39c12') {
		const parts = [];
		const hub = Bodies.circle(cx, cy, 6, { isStatic: true, restitution: 0.8, render: { fillStyle: '#7f8c8d' } });
		parts.push(hub);
		for (let i = 0; i < blades; i++) {
			const angle = (i / blades) * Math.PI * 2;
			const bx = cx + Math.cos(angle) * (radius / 2);
			const by = cy + Math.sin(angle) * (radius / 2);
			const blade = Bodies.rectangle(bx, by, bladeH, bladeW, { isStatic: true, restitution: 0.8, render: { fillStyle: color } });
			Body.setAngle(blade, angle);
			parts.push(blade);
		}
		const compound = Body.create({ parts: parts, isStatic: true, label: 'windmill' });
		Composite.add(world, compound);
		windmills.push({ body: compound, speed });
	}

	const centerXWind = GAME_WIDTH / 2;
	const WM = (window.CONFIG && window.CONFIG.WINDMILL) || {};
	const ENABLE_CENTER_WINDMILL = (window.CONFIG && window.CONFIG.ENABLE_CENTER_WINDMILL) || false;
	const baseSpeed = (WM.baseSpeed) || 0.08;
	const leftSpeed = baseSpeed * (WM.leftCW ? 1 : -1);
	const rightSpeed = baseSpeed * (WM.rightCW ? 1 : -1);
	const centerSpeed = baseSpeed * (WM.centerCW ? 1 : -1);
	createWindmill(centerXWind - 80, 320, WM.blades || 4, WM.radius || 40, WM.bladeW || 8, WM.bladeH || 40, leftSpeed, WM.color || '#f39c12');
	createWindmill(centerXWind + 80, 320, WM.blades || 4, WM.radius || 40, WM.bladeW || 8, WM.bladeH || 40, rightSpeed, WM.color || '#f39c12');
	if (ENABLE_CENTER_WINDMILL) {
		createWindmill(centerXWind, 470, WM.blades || 4, WM.radius || 40, 6, WM.bladeH || 40, centerSpeed, WM.color || '#f39c12');
		if (windmills.length) windmills[windmills.length - 1].isCenter = true;
	}

	// 回転を毎フレーム適用
	Events.on(engine, 'beforeUpdate', () => {
		windmills.forEach(w => {
			Body.setAngle(w.body, w.body.angle + w.speed);
		});

		// 回転ゲートの角度補間
		if (typeof gates !== 'undefined') {
			gates.forEach(g => {
				const ang = g.body.angle;
				const d = g.targetAngle - ang;
				if (Math.abs(d) > 0.001) {
					const newAng = ang + d * 0.25;
					const half = g.length / 2;
					const cx = g.pivot.x - Math.sin(newAng) * half;
					const cy = g.pivot.y + Math.cos(newAng) * half;
					Body.setPosition(g.body, { x: cx, y: cy });
					Body.setAngle(g.body, newAng);
				}
			});
		}
	});

	// --- 役物（やくもの）の作成 ---
	const startChucker = Bodies.rectangle(GAME_WIDTH / 2, 580, 36, 10, {
		isStatic: true, isSensor: true, label: 'startChucker', render: { fillStyle: '#e67e22' }
	});
	const tulipLeft = Bodies.rectangle(120, 450, 32, 10, {
		isStatic: true, isSensor: true, label: 'tulip', render: { fillStyle: '#3498db' }
	});
	const tulipRight = Bodies.rectangle(GAME_WIDTH - 120, 450, 32, 10, {
		isStatic: true, isSensor: true, label: 'tulip', render: { fillStyle: '#3498db' }
	});
	Composite.add(world, [startChucker, tulipLeft, tulipRight]);

	// 役物左右のフェンス
	const fenceHeight = 40;
	const fenceThickness = 6;
	const fenceOffsetX = 26;
	const leftFence = Bodies.rectangle((GAME_WIDTH / 2) - fenceOffsetX, 560, fenceThickness, fenceHeight, { isStatic: true, render: { fillStyle: '#7f8c8d' } });
	const rightFence = Bodies.rectangle((GAME_WIDTH / 2) + fenceOffsetX, 560, fenceThickness, fenceHeight, { isStatic: true, render: { fillStyle: '#7f8c8d' } });
	const tulipFenceY = 450;
	const tulipFenceOffset = 22;
	const tulipLeftFenceL = Bodies.rectangle(tulipLeft.position.x - tulipFenceOffset, tulipFenceY, fenceThickness, 36, { isStatic: true, render: { fillStyle: '#7f8c8d' } });
	const tulipLeftFenceR = Bodies.rectangle(tulipLeft.position.x + tulipFenceOffset, tulipFenceY, fenceThickness, 36, { isStatic: true, render: { fillStyle: '#7f8c8d' } });
	const tulipRightFenceL = Bodies.rectangle(tulipRight.position.x - tulipFenceOffset, tulipFenceY, fenceThickness, 36, { isStatic: true, render: { fillStyle: '#7f8c8d' } });
	const tulipRightFenceR = Bodies.rectangle(tulipRight.position.x + tulipFenceOffset, tulipFenceY, fenceThickness, 36, { isStatic: true, render: { fillStyle: '#7f8c8d' } });
	Composite.add(world, [leftFence, rightFence, tulipLeftFenceL, tulipLeftFenceR, tulipRightFenceL, tulipRightFenceR]);

	// --- ゲームロジック ---
	function createDebris(x, y, color) {
		const debrisCount = 8;
		const debris = [];
		for (let i = 0; i < debrisCount; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 3 + Math.random() * 4;
			const particle = Bodies.circle(x, y, 1 + Math.random() * 2, {
				label: 'debris',
				friction: 0.05,
				restitution: 0.4,
				render: { fillStyle: color },
				collisionFilter: { group: -1 }
			});
			Body.setVelocity(particle, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 2 });
			debris.push(particle);
		}
		Composite.add(world, debris);
		try { if (window.AudioBus) { AudioBus.sfxSimple({ freq: 200, type: 'triangle', gain: 0.15, dur: 0.04 }); } } catch (e) { }
		setTimeout(() => { Composite.remove(world, debris); }, 200);
	}

	function startDropping() {
		if (dropInterval) return;
		dropInterval = setInterval(dropBall, (window.CONFIG && window.CONFIG.DROP_INTERVAL_MS) || 80);
	}
	function stopDropping() {
		clearInterval(dropInterval);
		dropInterval = null;
	}

	function dropBall(options = {}) {
		const randomX = GAME_WIDTH / 2 + (Math.random() - 0.5) * 100;
		const color = options.isNavy ? '#ffd700' : (options.fromBlue ? '#3498db' : '#ecf0f1');
		const ball = Bodies.circle(randomX, -20, (window.CONFIG && window.CONFIG.BALL_RADIUS) || 5, {
			label: 'ball', restitution: 0.9, friction: 0.05,
			render: { fillStyle: color }
		});
		if (options.fromBlue) {
			ball.isFromBlue = true;
			ball.isImmuneToMiss = true;
		}
		if (options.isNavy) {
			ball.isNavy = true;
			ball.isImmuneToMiss = true;
			ball.isFromBlue = true; // 紺碧も青扱い
		}
		Composite.add(world, ball);
		totalDrops++;
		updateStats();
	}

	dropButton.addEventListener('mousedown', startDropping);
	dropButton.addEventListener('mouseup', stopDropping);
	dropButton.addEventListener('mouseleave', stopDropping);
	dropButton.addEventListener('touchstart', (e) => { e.preventDefault(); startDropping(); });
	dropButton.addEventListener('touchend', (e) => { e.preventDefault(); stopDropping(); });

	let spaceDown = false;
	window.addEventListener('keydown', (e) => {
		if (e.code === 'Space') {
			e.preventDefault();
			if (!spaceDown) { spaceDown = true; startDropping(); }
		}
	});
	window.addEventListener('keyup', (e) => {
		if (e.code === 'Space') {
			e.preventDefault();
			spaceDown = false; stopDropping();
		}
	});

	function isTopHit(ball, target) {
		if (!ball || !target) return false;
		if (!ball.velocity || ball.velocity.y <= 0.2) return false; // 下向きか
		if (!(ball.position.y < target.position.y - 6)) return false; // ある程度上から
		return true;
	}

	Events.on(engine, 'collisionStart', (event) => {
		event.pairs.forEach(pair => {
			const { bodyA, bodyB } = pair;
			let ball, other;
			if (bodyA.label === 'ball') { ball = bodyA; other = bodyB; }
			else if (bodyB.label === 'ball') { ball = bodyB; other = bodyA; }
			else return;

			switch (other.label) {
				case 'windmill': {
					const dx = ball.position.x - other.position.x;
					const dy = ball.position.y - other.position.y;
					const len = Math.sqrt(dx * dx + dy * dy) || 1;
					const forceScale = 0.2;
					const upBias = -0.04;
					Body.applyForce(ball, ball.position, { x: (dx / len) * forceScale, y: (dy / len) * forceScale + upBias });
					break;
				}
				case 'startChucker': {
					if (isTopHit(ball, other)) {
						orangeHits++;
						updateStats();
						createDebris(ball.position.x, ball.position.y, '#e67e22');
						try { Composite.remove(world, ball); } catch (e) { }
						try { if (window.AudioBus && window.CONFIG) { AudioBus.sfxSimple(window.CONFIG.SFX.chucker); } } catch (e) { }
						setTimeout(() => { dropBall({ fromBlue: true, isNavy: true }); }, 200);
					}
					break;
				}
				case 'tulip': {
					if (isTopHit(ball, other)) {
						createDebris(ball.position.x, ball.position.y, '#3498db');
						try { Composite.remove(world, ball); } catch (e) { }
						blueHits++;
						updateStats();
						try { if (window.AudioBus && window.CONFIG) { AudioBus.sfxSimple(window.CONFIG.SFX.tulip); } } catch (e) { }
						const opts = { fromBlue: true };
						if (ball.isNavy) { opts.isNavy = true; }
						setTimeout(() => { dropBall(opts); }, 200);
					}
					break;
				}
				case 'wall': {
					if (!ENABLE_WALL_MISS || ball.isImmuneToMiss) break;
					createDebris(ball.position.x, ball.position.y, ball.render.fillStyle);
					try { if (window.AudioBus && window.CONFIG) { AudioBus.sfxSimple(window.CONFIG.SFX.miss); } } catch (e) { }
					try { Composite.remove(world, ball); } catch (e) { }
					missHits++;
					updateStats();
					break;
				}
				// 中央などのセンサーは免疫を考慮する既存の挙動
				case 'missZone': {
					if (ball.isImmuneToMiss) break;
					createDebris(ball.position.x, ball.position.y, ball.render.fillStyle);
					try { if (window.AudioBus && window.CONFIG) { AudioBus.sfxSimple(window.CONFIG.SFX.miss); } } catch (e) { }
					try { Composite.remove(world, ball); } catch (e) { }
					missHits++;
					updateStats();
					break;
				}
				// 床（floorMissZone）は免疫を無視して必ず粉砕する
				case 'floorMissZone': {
					createDebris(ball.position.x, ball.position.y, ball.render.fillStyle);
					try { if (window.AudioBus && window.CONFIG) { AudioBus.sfxSimple(window.CONFIG.SFX.miss); } } catch (e) { }
					try { Composite.remove(world, ball); } catch (e) { }
					missHits++;
					updateStats();
					break;
				}
			}
		});
	});

	function updateStats() {
		const orangeRatio = totalDrops === 0 ? 0 : Math.round((orangeHits / totalDrops) * 1000) / 10;
		const blueRatio = totalDrops === 0 ? 0 : Math.round((blueHits / totalDrops) * 1000) / 10;
		statsEl.textContent = `投入:${totalDrops}  オレンジ:${orangeHits}(${orangeRatio}%)  青:${blueHits}(${blueRatio}%)  ハズレ:${missHits}`;
	}

	// スイープ判定 + 画面外回収 + 前位置記録
	Events.on(engine, 'afterUpdate', () => {
		const targets = [
			{ body: startChucker, type: 'startChucker' },
			{ body: tulipLeft, type: 'tulip' },
			{ body: tulipRight, type: 'tulip' }
		];
		const bodies = Composite.allBodies(world);
		for (const b of bodies) {
			if (b.label !== 'ball') continue;
			if (b.isHitting) continue;
			const prev = b.lastPos || b.position;
			const curr = b.position;
			if ((curr.y - prev.y) <= 0.05) { b.lastPos = { x: curr.x, y: curr.y }; continue; }

			for (const t of targets) {
				const tb = t.body; if (!tb) continue;
				const topY = tb.bounds.min.y;
				if (prev.y < topY && curr.y >= topY) {
					const dy = (curr.y - prev.y) || 1e-6;
					const tRatio = (topY - prev.y) / dy;
					const xCross = prev.x + (curr.x - prev.x) * tRatio;
					const margin = 3;
					const minX = tb.bounds.min.x - margin;
					const maxX = tb.bounds.max.x + margin;
					if (xCross >= minX && xCross <= maxX) {
						b.isHitting = true;
						if (t.type === 'startChucker') {
							orangeHits++; updateStats();
							createDebris(b.position.x, b.position.y, '#e67e22');
							try { Composite.remove(world, b); } catch (e) { }
							setTimeout(() => { dropBall({ fromBlue: true, isNavy: true }); }, 200);
						} else {
							blueHits++; updateStats();
							createDebris(b.position.x, b.position.y, '#3498db');
							const opts = { fromBlue: true };
							if (b.isNavy) opts.isNavy = true;
							try { Composite.remove(world, b); } catch (e) { }
							setTimeout(() => { dropBall(opts); }, 200);
						}
						break;
					}
				}
			}
			// ボールが非常に遠くに行った（何らかの異常）場合は保険で回収
			if (b.position.y > GAME_HEIGHT + 300) { try { Composite.remove(world, b); } catch (e) { } }
			b.lastPos = { x: curr.x, y: curr.y };
		}
	});

	function handleHit(ball, color) {
		if (!ball || ball.isHitting) return;
		ball.isHitting = true;
		ball.render.fillStyle = color;
		setTimeout(() => { Composite.remove(world, ball); }, 100);
	}

	function handleTulipHit(ball) {
		if (!ball || ball.isHitting) return;
		ball.isHitting = true;
		ball.isFromBlue = true;
		ball.render.fillStyle = '#3498db';
		try { Composite.remove(world, ball); } catch (e) { }
		setTimeout(() => { dropBall({ fromBlue: true }); }, 200);
	}

	function showMessage(text, duration = 2000) {
		messageBox.textContent = text;
		messageBox.style.visibility = 'visible';
		setTimeout(() => { messageBox.style.visibility = 'hidden'; }, duration);
	}
})();
