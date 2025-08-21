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
	const world = engine.world;

	// --- 2. レンダラーの作成 ---
	// ゲームコンテナに config の幅高さを反映（CSS 側の固定をやめて config に一本化）
	const container = document.getElementById('game-container');
	container.style.width = GAME_CONFIG.width + 'px';
	container.style.height = GAME_CONFIG.height + 'px';

	const render = Render.create({
		element: container,
		engine: engine,
		options: {
			width: GAME_CONFIG.width,
			height: GAME_CONFIG.height,
			...GAME_CONFIG.renderOptions
		}
	});

	// --- 3. 物理演算と描画の開始 ---
	Render.run(render);
	const runner = Runner.create();
	Runner.run(runner, engine);

	// --- 4. オブジェクトの生成 ---
	createBounds(world);
	loadPegs('pegs-presets/pegs3.json', world);

	// --- 5. 回転役物の生成（複数対応） ---
	// windmillConfig の設定を元に、配置座標を複数用意して複数の回転役物を生成します。
	const windmillConfig = GAME_CONFIG.objects.windmill;

	// ここで複数配置したい座標を列挙します。必要に応じて座標を編集してください。
	// 各要素はオプションで `rps` (rotations per second) と `direction` (1 または -1) を含められます。
	// 例: { x: 135, y: 430, rps: 0.5, direction: -1 }
	const rotatorPositions = [
		{ x: 138, y: 314, rps: 1, direction: -1 },
		{ x: 313, y: 314, rps: 1, direction: 1 }
	];

	// rotators 配列に { body, anglePerFrame } を保持して、afterUpdate で個別に回転させます。
	// anglePerFrame は各役物の rps と direction を元に計算します。
	const rotators = rotatorPositions.map(pos => {
		const xOffset = ((GAME_CONFIG.width || 0) - (GAME_CONFIG.baseWidth || GAME_CONFIG.width || 0)) / 2;
		const defaults = windmillConfig.defaults || {};
		const blueprint = {
			x: pos.x + xOffset,
			y: pos.y,
			render: windmillConfig.render,
			// optional: 個別の中心色を指定できる
			centerFill: pos.centerFill,
			shape: Object.assign({ type: 'windmill' }, defaults, pos.shape || {})
		};

		const body = createRotatingYakumono(blueprint);
		World.add(world, body);

		// 個別設定があれば優先、無ければ共通設定を使用
		const rps = (typeof pos.rps === 'number') ? pos.rps : windmillConfig.rotationsPerSecond;
		const direction = (pos.direction === -1) ? -1 : 1; // -1 で反時計回り
		const anglePerFrameForThis = (rps * 2 * Math.PI / 60) * direction;

		return { body, anglePerFrame: anglePerFrameForThis };
	});

	// フレーム更新ごとのイベント — 各役物の anglePerFrame を使って回転させる
	Events.on(engine, 'afterUpdate', () => {
		rotators.forEach(rotator => {
			Body.rotate(rotator.body, rotator.anglePerFrame);
		});
	});

	// --- 6. イベントリスナーの設定 ---
	// --- ボール投射（放物線） ---
	// 画面左下外から放物線で投射し、画面上部の釘エリアに着弾させる。
	function computeLaunchVelocity(start, target, g, time) {
		// g: 正の値（下向き）
		const dx = target.x - start.x;
		const dy = target.y - start.y; // 下方向が正
		const vx = dx / time;
		const vy = (dy - 0.5 * g * time * time) / time;
		return { x: vx, y: vy };
	}

	// UI 要素を取得
	const angleSlider = document.getElementById('angle-slider');
	const speedSlider = document.getElementById('speed-slider');
	const angleVal = document.getElementById('angle-val');
	const speedVal = document.getElementById('speed-val');

	// UI 表示更新
	const launchArrow = document.getElementById('launch-arrow');
	function updateArrow() {
		const angle = Number(angleSlider.value);
		const speed = Number(speedSlider.value);
		angleVal.textContent = angle;
		speedVal.textContent = speed;
		// position arrow near bottom-left of container (use container-relative coords)
		const rect = container.getBoundingClientRect();
		// left/top relative to the container element
		const containerLeft = 0; // since arrow is absolutely positioned inside container
		const containerTop = 0;
		launchArrow.style.left = (24 + containerLeft) + 'px';
		launchArrow.style.top = (rect.height - 80 + containerTop) + 'px';
		launchArrow.style.transform = `rotate(${-angle}deg)`; // negative because CSS y-axis
	}
	angleSlider.addEventListener('input', updateArrow);
	speedSlider.addEventListener('input', updateArrow);
	// 初期ラベル表示
	updateArrow();

	document.getElementById('add-ball').addEventListener('click', () => {
		// 発射元：config の spawn 設定を使って決定
		const spawnCfg = (GAME_CONFIG.launch && GAME_CONFIG.launch.spawn) || {};
		const xOffset = ((GAME_CONFIG.width || 0) - (GAME_CONFIG.baseWidth || GAME_CONFIG.width || 0)) / 2;
		const startX = (typeof spawnCfg.x === 'number') ? (spawnCfg.x + xOffset) : (40 + xOffset);
		const startY = (typeof spawnCfg.y === 'number') ? spawnCfg.y : (GAME_CONFIG.height - (spawnCfg.yOffsetFromBottom || 40));
		const start = { x: startX, y: startY };
		// 着弾ターゲット：画面上部の釘エリアのランダムな点（中央寄り）
		const target = {
			x: GAME_CONFIG.width * (0.35 + Math.random() * 0.3),
			y: GAME_CONFIG.height * 0.18 + Math.random() * (GAME_CONFIG.height * 0.08)
		};

		// UI で指定された角度(度)と速度(px/s)
		const angleDeg = Number(angleSlider.value);
		const rawSpeed = Number(speedSlider.value);
		// apply global scale so UI values can be tuned to human-friendly numbers
		const speedPxPerSec = rawSpeed * (GAME_CONFIG.launch && GAME_CONFIG.launch.speedScale ? GAME_CONFIG.launch.speedScale : 1);
		const angleRad = angleDeg * Math.PI / 180;

		// シンプルに角度と速度から初速を決定（物理はMatter.jsに任せる）
		const vx = Math.cos(angleRad) * speedPxPerSec;
		const vy = -Math.sin(angleRad) * speedPxPerSec; // 上向きは負

		console.log('[spawn] creating ball at', start, 'rawSpeed', rawSpeed, 'scaledSpeed', speedPxPerSec, 'velocity', { x: vx, y: vy }, 'angle', angleDeg);

		// ボールを作成してワールドに追加、初速をセット
		const ball = createBall(start.x, start.y);
		World.add(world, ball);
		Body.setVelocity(ball, { x: vx, y: vy });

		// debug marker at spawn point (position relative to container)
		const marker = document.createElement('div');
		marker.style.position = 'absolute';
		marker.style.width = '8px';
		marker.style.height = '8px';
		marker.style.borderRadius = '50%';
		marker.style.background = 'yellow';
		// container is the positioned parent, so place marker using start coords
		marker.style.left = (start.x) + 'px';
		marker.style.top = (start.y - 8) + 'px';
		marker.style.zIndex = '9999';
		marker.id = 'debug-spawn-marker';
		container.appendChild(marker);
		setTimeout(() => marker.remove(), 1200);
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
			// NOTE: ユーザ要望により、ここでの即時削除を無効化しました。観察用にボールが消えないようにします。
			/*
			const ballLabel = GAME_CONFIG.objects.ball.label;
			const floorLabel = GAME_CONFIG.objects.floor.label;
			if (bodyA.label === ballLabel && bodyB.label === floorLabel) {
				World.remove(world, bodyA);
			} else if (bodyB.label === ballLabel && bodyA.label === floorLabel) {
				World.remove(world, bodyB);
			}
			*/
		}
	});


});