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
	const render = Render.create({
		element: document.getElementById('game-container'),
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

	// --- 5. 役物の生成 ---
	const windmillConfig = GAME_CONFIG.objects.windmill;
	const windmillBlueprint = {
		x: 225,
		y: 480, // 釘の最下段より下に配置
		render: {
			blade: { fillStyle: '#ff0000' }, // 羽根の色
			center: { fillStyle: '#555555' } // 中心円の色
		},
		shape: {
			type: 'windmill',
			centerRadius: 6,
			numBlades: 4,
			bladeLength: 20,
			bladeWidth: 5
		}
	};
	const windmill = createRotatingYakumono(windmillBlueprint);
	World.add(world, windmill);

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

	// フレーム更新ごとのイベント
	const rotationsPerSecond = windmillConfig.rotationsPerSecond;
	const anglePerFrame = (rotationsPerSecond * 2 * Math.PI) / 60; // 60FPSを想定

	Events.on(engine, 'afterUpdate', () => {
		// 風車を毎フレーム回転させる
		Body.rotate(windmill, anglePerFrame);
	});
});