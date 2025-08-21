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
		const defaults = windmillConfig.defaults || {};
		const blueprint = {
			x: pos.x,
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
	// 「ボールを追加」ボタンのクリックイベント
	document.getElementById('add-ball').addEventListener('click', () => {
		const x = Math.random() * (GAME_CONFIG.width - 80) + 40;
		const ball = createBall(x, 20);
		World.add(world, ball);
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