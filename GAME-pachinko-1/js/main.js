/**
 * ゲームのメインロジックを管理するファイル。
 * Matter.jsのエンジンのセットアップ、オブジェクトの生成（objects.jsへの委任）、
 * イベントハンドリング（ボールの追加、衝突判定）など、
 * ゲーム全体の流れを制御する「司令塔」の役割を担います。
 */
document.addEventListener('DOMContentLoaded', () => {
	// Matter.jsの主要モジュールを取得
	const { Engine, Render, Runner, World, Events, Body } = Matter;

	// --- 1. エンジンの初期化 ---
	const engine = Engine.create();
	// 過度な反復は負荷源になるため、適正値に調整（トンネリング耐性と負荷のバランス）
	engine.positionIterations = 10; // default ~6
	engine.velocityIterations = 8;  // default ~4
	engine.constraintIterations = 6; // default ~2
	// すり抜け緩和のためスロップをやや小さめに
	engine.timing.timeScale = 1;
	engine.world.gravity.y = engine.world.gravity.y; // no-op for clarity
	// Matter v0.19+ では pair/constraint 単位の slop が使われるが、Engine の default slop も尊重
	engine.enableSleeping = false;
	const world = engine.world;

	// --- 2. レンダラーの作成 (簡潔に) ---
	const cfg = GAME_CONFIG;
	const dims = cfg.dimensions || cfg;
	const width = dims.width || cfg.width || 650;
	const height = dims.height || cfg.height || 900;
	const renderOptions = cfg.render || cfg.renderOptions || {};
	const container = document.getElementById('game-container');
	if (!container) {
		console.error('Game container element (#game-container) not found.');
		return; // 以降の処理はコンテナがないと成立しないため早期終了
	}
	container.style.width = width + 'px';
	container.style.height = height + 'px';

	const render = Render.create({ element: container, engine, options: { width, height, pixelRatio: 1, ...renderOptions } });

	// --- 3. 物理演算と描画の開始（標準の Runner を使用） ---
	Render.run(render);
	const runner = Runner.create();
	Runner.run(runner, engine);

	// --- 4. オブジェクトの生成 ---
	// topPlate の初期調整をより簡潔に
	if (GAME_CONFIG.topPlate?.enabled) {
		GAME_CONFIG.topPlate.radius = GAME_CONFIG.topPlate.radius || Math.round(width * 0.6);
	}

	// create and add bounds (createBounds now returns an array)
	let currentBounds = createBounds();
	addBoundsToWorld(currentBounds, world);
	loadPegs('pegs-presets/pegs3.json', world);

	// --- 5. 回転役物の生成（JSONプリセット駆動） ---
	const windmillConfig = GAME_CONFIG.objects.windmill;
	const { xOffset: globalXOffset, yOffset: globalYOffset } = (typeof getOffsets === 'function') ? getOffsets() : { xOffset: 0, yOffset: 0 };

	// rotators 配列に { body, anglePerSecond } を保持し、afterUpdate で回す
	let rotators = [];
	(async () => {
		try {
			const res = await fetch('objects-presets/default.json');
			if (!res.ok) throw new Error(`Failed to load objects preset: ${res.status} ${res.statusText}`);
			const preset = await res.json();
			const items = Array.isArray(preset.rotators) ? preset.rotators : [];
			rotators = items.map(item => {
				if (item.type !== 'windmill') return null;
				const defaults = windmillConfig.defaults || {};
				const bladeColor = item.bladeColor ?? item.render?.fillStyle ?? windmillConfig.bladeColor ?? windmillConfig.render?.fillStyle;
				const centerColor = item.centerColor ?? item.centerFill ?? windmillConfig.centerColor ?? windmillConfig.centerFill;
				const blueprint = {
					x: (item.x || 0) + globalXOffset,
					y: (item.y || 0) + globalYOffset,
					render: item.render || {},
					bladeColor,
					centerColor,
					shape: Object.assign({ type: 'windmill' }, defaults, item.shape || {})
				};
				const body = createRotatingYakumono(blueprint);
				World.add(world, body);
				const rps = Number(item.rps ?? windmillConfig.rotationsPerSecond);
				const anglePerSecond = rps * 2 * Math.PI * (item.direction === -1 ? -1 : 1);
				return { body, anglePerSecond };
			}).filter(Boolean);
		} catch (err) {
			console.error('Failed to init rotators from preset:', err);
		}
	})();

	// フレーム更新ごとのイベント — 各役物の anglePerFrame を使って回転させる
	Events.on(engine, 'afterUpdate', () => {
		// engine.timing.delta is ms elapsed for the last tick; fall back to 16.666ms
		const deltaMs = (engine && engine.timing && engine.timing.delta) ? engine.timing.delta : 16.6667;
		const deltaSec = deltaMs / 1000;
		rotators.forEach(rotator => {
			const angle = (rotator.anglePerSecond || 0) * deltaSec;
			if (angle) Body.rotate(rotator.body, angle);
		});
	});

	// --- 6. イベントリスナーの設定 ---

	// helper: compute spawn start coords based on GAME_CONFIG and offsets
	function computeSpawnCoords() {
		const spawnCfg = (GAME_CONFIG.launch && GAME_CONFIG.launch.spawn) || {};
		const { xOffset: sxOff, yOffset: syOff } = (typeof getOffsets === 'function') ? getOffsets() : { xOffset: 0, yOffset: 0 };
		const startX = (typeof spawnCfg.x === 'number') ? (spawnCfg.x + sxOff) : (40 + sxOff);
		const startY = (typeof spawnCfg.y === 'number') ? (spawnCfg.y + syOff) : (GAME_CONFIG.height - (spawnCfg.yOffsetFromBottom || 40) + syOff);
		return { x: startX, y: startY };
	}

	// create launch pad element and keep reference
	let launchPad = document.getElementById('launch-pad');
	if (!launchPad) {
		launchPad = document.createElement('div');
		launchPad.id = 'launch-pad';
		container.appendChild(launchPad);
	}

	function applyPadConfig() {
		const padCfg = (GAME_CONFIG.launch && GAME_CONFIG.launch.pad) || {};
		launchPad.style.display = padCfg.visible === false ? 'none' : 'block';
		launchPad.style.width = (padCfg.width || 64) + 'px';
		launchPad.style.height = (padCfg.height || 14) + 'px';
		launchPad.style.borderRadius = (padCfg.borderRadius || 8) + 'px';
		launchPad.style.background = padCfg.background || 'linear-gradient(180deg,#444,#222)';
		launchPad.style.border = '3px solid ' + (padCfg.borderColor || '#fff');
		// indicator removed; no inner yellow dot
	}

	function updateLaunchPadPosition() {
		const p = computeSpawnCoords();
		const padCfg = (GAME_CONFIG.launch && GAME_CONFIG.launch.pad) || {};
		launchPad.style.left = p.x + 'px';
		const offsetY = padCfg.offsetY || 8;
		launchPad.style.top = (p.y + offsetY) + 'px'; // small offset so pad sits under ball
	}

	// apply initial pad config and position
	applyPadConfig();
	updateLaunchPadPosition();

	// update when window resizes or when topPlate recreated
	window.addEventListener('resize', updateLaunchPadPosition);

	// UI 要素を取得

	// topPlate UI elements
	const tpMode = document.getElementById('tp-mode');
	const tpRadius = document.getElementById('tp-radius');
	const tpRadiusVal = document.getElementById('tp-radius-val');
	const tpThickness = document.getElementById('tp-thickness');
	const tpThicknessVal = document.getElementById('tp-thickness-val');
	const tpSegments = document.getElementById('tp-segments');
	const tpSegVal = document.getElementById('tp-seg-val');
	const tpOffX = document.getElementById('tp-offx');
	const tpOffXVal = document.getElementById('tp-offx-val');
	const tpOffY = document.getElementById('tp-offy');
	const tpOffYVal = document.getElementById('tp-offy-val');

	const angleSlider = document.getElementById('angle-slider');
	const speedSlider = document.getElementById('speed-slider');
	const angleVal = document.getElementById('angle-val');
	const speedVal = document.getElementById('speed-val');

	// angle slider configuration from config.js
	if (GAME_CONFIG.launch) {
		angleSlider.min = GAME_CONFIG.launch.angleMin;
		angleSlider.max = GAME_CONFIG.launch.angleMax;
		angleSlider.value = GAME_CONFIG.launch.defaultAngle;
	}

	// initialize topPlate UI from config
	if (GAME_CONFIG.topPlate) {
		tpMode.value = GAME_CONFIG.topPlate.mode || 'dome';
		tpRadius.min = 50;
		tpRadius.max = Math.max(1000, GAME_CONFIG.width * 2);
		tpRadius.value = GAME_CONFIG.topPlate.radius || Math.round(GAME_CONFIG.width * 0.6);
		tpRadiusVal.textContent = tpRadius.value;
		tpThickness.value = GAME_CONFIG.topPlate.thickness || 20;
		tpThicknessVal.textContent = tpThickness.value;
		tpSegments.value = GAME_CONFIG.topPlate.segments || 24;
		(tpSegVal.textContent = tpSegments.value);
		tpOffX.value = GAME_CONFIG.topPlate.centerOffsetX || 0;
		tpOffXVal.textContent = tpOffX.value;
		tpOffY.value = GAME_CONFIG.topPlate.centerOffsetY || 0;
		tpOffYVal.textContent = tpOffY.value;
	}

	// UI 表示更新
	const launchArrow = document.getElementById('launch-arrow');
	const speedActual = document.createElement('span');
	speedActual.id = 'speed-actual';
	// attach after speedVal for visibility (we'll update textContent each frame)
	function updateArrow() {
		const launchArrow = document.getElementById('launch-arrow');
		if (!launchArrow) return; // arrow removed via CSS/HTML — no-op
		const angle = Number(angleSlider.value);
		const sliderValue = Number(speedSlider.value);
		// map slider 0..100 -> px/s using config scale and min/max
		const min = GAME_CONFIG.launch && GAME_CONFIG.launch.minSpeed ? GAME_CONFIG.launch.minSpeed : 5;
		const max = GAME_CONFIG.launch && GAME_CONFIG.launch.maxSpeed ? GAME_CONFIG.launch.maxSpeed : 400;
		const speed = min + (sliderValue / 100) * (max - min);
		speedActual.textContent = ` (${Math.round(speed)} px/s)`;
		angleVal.textContent = angle.toFixed(1);
		speedVal.textContent = sliderValue;
		// position arrow near bottom-left of container (use container-relative coords)
		const rect = container.getBoundingClientRect();
		launchArrow.style.left = '24px';
		launchArrow.style.top = (rect.height - 80) + 'px';
		launchArrow.style.transform = `rotate(${-angle}deg)`; // negative because CSS y-axis
	}
	angleSlider.addEventListener('input', updateArrow);
	speedSlider.addEventListener('input', updateArrow);

	// topPlate UI handlers: update GAME_CONFIG and recreate bounds (debounced)
	const recreateTopPlate = (() => {
		let timer = 0;
		return function () {
			clearTimeout(timer);
			timer = setTimeout(() => {
				if (!GAME_CONFIG.topPlate) GAME_CONFIG.topPlate = {};
				GAME_CONFIG.topPlate.mode = tpMode.value;
				GAME_CONFIG.topPlate.radius = Number(tpRadius.value);
				GAME_CONFIG.topPlate.thickness = Number(tpThickness.value);
				GAME_CONFIG.topPlate.segments = Number(tpSegments.value);
				GAME_CONFIG.topPlate.centerOffsetX = Number(tpOffX.value);
				GAME_CONFIG.topPlate.centerOffsetY = Number(tpOffY.value);
				// remove existing bounds
				if (currentBounds && currentBounds.length) {
					currentBounds.forEach(b => Matter.Composite.remove(world, b, true));
				}
				currentBounds = createBounds();
				addBoundsToWorld(currentBounds, world);
				applyPadConfig();
				updateLaunchPadPosition();
			}, 50);
		};
	})();

	// 汎用的なUI値更新ヘルパー
	function createSliderUpdater(slider, display, callback) {
		return () => {
			if (display) display.textContent = slider.value;
			if (callback) callback();
		};
	}

	// topPlate UI の設定を単純化
	const topPlateUpdaters = [
		[tpRadius, tpRadiusVal],
		[tpThickness, tpThicknessVal],
		[tpSegments, tpSegVal],
		[tpOffX, tpOffXVal],
		[tpOffY, tpOffYVal]
	];

	topPlateUpdaters.forEach(([slider, display]) => {
		if (slider && display) {
			slider.addEventListener('input', createSliderUpdater(slider, display, () => {
				recreateTopPlate();
				applyPadConfig();
				updateLaunchPadPosition();
			}));
		}
	});

	// mode select の処理
	if (tpMode) {
		tpMode.addEventListener('change', () => {
			recreateTopPlate();
			applyPadConfig();
			updateLaunchPadPosition();
		});
	}
	// insert speedActual after speedVal in DOM
	if (speedVal && speedVal.parentNode) {
		speedVal.parentNode.insertBefore(speedActual, speedVal.nextSibling);
	}
	// 初期ラベル表示
	updateArrow();

	document.getElementById('add-ball').addEventListener('click', () => {
		// 発射元：getOffsets を使用して統一された座標計算
		const start = computeSpawnCoords();

		// 着弾ターゲット：画面上部の釘エリアのランダムな点（中央寄り）
		const { yOffset } = getOffsets();
		const target = {
			x: GAME_CONFIG.width * (0.35 + Math.random() * 0.3),
			y: (GAME_CONFIG.height * 0.18 + Math.random() * (GAME_CONFIG.height * 0.08)) + yOffset
		};

		// UI で指定された角度(度)と速度を使用してシンプルな初速計算
		const angleDeg = Number(angleSlider.value);
		const sliderValue = Number(speedSlider.value);

		// 設定から速度レンジを取得
		const { minSpeed = 5, maxSpeed = 400, speedScale = 1 } = GAME_CONFIG.launch || {};
		const baseSpeed = minSpeed + (sliderValue / 100) * (maxSpeed - minSpeed);
		const speedPxPerSec = baseSpeed * speedScale;

		// 物理的に自然な初速ベクトル計算
		const angleRad = angleDeg * Math.PI / 180;
		const velocity = {
			x: Math.cos(angleRad) * speedPxPerSec,
			y: -Math.sin(angleRad) * speedPxPerSec // 上向きは負
		};

		// ボール作成とMatter.jsの物理エンジンに委ねる
		const ball = createBall(start.x, start.y);
		World.add(world, ball);
		Body.setVelocity(ball, velocity);

		// debug marker removed: no temporary visual marker at spawn
	});

	// 衝突開始イベント
	Events.on(engine, 'collisionStart', (event) => {
		const pairs = event.pairs;
		for (const pair of pairs) {
			const { bodyA, bodyB } = pair;

			// 材質に基づいた物理係数の動的適用
			if (bodyA.material && bodyB.material) {
				const interaction = getMaterialInteraction(bodyA.material, bodyB.material);
				pair.restitution = interaction.restitution;
				pair.friction = interaction.friction;
			}

			// 床とボールの衝突判定
			const ballLabel = GAME_CONFIG.objects.ball.label;
			const floorLabel = GAME_CONFIG.objects.floor.label;
			if (bodyA.label === ballLabel && bodyB.label === floorLabel) {
				World.remove(world, bodyA);
			} else if (bodyB.label === ballLabel && bodyA.label === floorLabel) {
				World.remove(world, bodyB);
			}
		}
	});


});