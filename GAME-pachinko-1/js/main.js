/**
 * ゲームのメインロジックを管理するファイル。
 * Matter.jsのエンジンのセットアップ、オブジェクトの生成（objects.jsへの委任）、
 * イベントハンドリング（ボールの追加、衝突判定）など、
 * ゲーム全体の流れを制御する「司令塔」の役割を担います。
 */
document.addEventListener('DOMContentLoaded', () => {
	// Matter.jsの主要モジュールを取得
	const { Engine, Render, Runner, World, Events } = Matter;

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
	// objects.jsに定義された関数を呼び出し、壁や釘をワールドに配置します。
	createBounds(world);
	// main.jsの場所がjs/内に移動したため、プリセットファイルへのパスを修正
	loadPegs('./pegs-presets/pegs3.json', world);

	// --- 5. イベントリスナーの設定 ---
	// 「ボールを追加」ボタンのクリックイベント
	document.getElementById('add-ball').addEventListener('click', () => {
		// X座標をランダムに決定して、新しいボールを生成・追加します
		const x = Math.random() * (GAME_CONFIG.width - 80) + 40;
		const ball = createBall(x, 20);
		World.add(world, ball);
	});

	// 衝突開始イベント（ボールが床に触れたかを検出）
	Events.on(engine, 'collisionStart', (event) => {
		const pairs = event.pairs;
		for (const pair of pairs) {
			const { bodyA, bodyB } = pair;
			const ballLabel = GAME_CONFIG.objects.ball.label;
			const floorLabel = GAME_CONFIG.objects.floor.label;

			// 衝突したペアが「ボール」と「床」であれば、ボールを削除します
			if (bodyA.label === ballLabel && bodyB.label === floorLabel) {
				World.remove(world, bodyA);
			} else if (bodyB.label === ballLabel && bodyA.label === floorLabel) {
				World.remove(world, bodyB);
			}
		}
	});
});
