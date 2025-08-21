document.addEventListener('DOMContentLoaded', () => {
	// Matter.jsのモジュールを取得
	const { Engine, Render, Runner, World, Bodies, Composite, Events } = Matter;

	// DOM要素
	const container = document.getElementById('game-container');
	const addButton = document.getElementById('add-ball');

	// 物理エンジンの作成
	const engine = Engine.create();
	const world = engine.world;

	// レンダラーの作成
	const render = Render.create({
		element: container,
		engine: engine,
		options: {
			width: GAME_CONFIG.width,
			height: GAME_CONFIG.height,
			...GAME_CONFIG.renderOptions
		}
	});

	// 物理演算の実行
	Render.run(render);
	const runner = Runner.create();
	Runner.run(runner, engine);

	// 壁の作成 (上、下、左、右)
	const wallBaseOptions = { ...GAME_CONFIG.wallOptions, render: { ...GAME_CONFIG.wallRender } };
	World.add(world, [
		Bodies.rectangle(GAME_CONFIG.width / 2, -10, GAME_CONFIG.width, 20, wallBaseOptions), // 上壁
		Bodies.rectangle(GAME_CONFIG.width / 2, GAME_CONFIG.height + 10, GAME_CONFIG.width, 20, wallBaseOptions), // 下床
		Bodies.rectangle(-10, GAME_CONFIG.height / 2, 20, GAME_CONFIG.height, wallBaseOptions), // 左壁
		Bodies.rectangle(GAME_CONFIG.width + 10, GAME_CONFIG.height / 2, 20, GAME_CONFIG.height, wallBaseOptions) // 右壁
	]);

	// 釘のプリセットを読み込んで配置
	fetch('./pegs-presets/pegs3.json')
		.then(response => response.json())
		.then(pegs => {
			const pegObjects = pegs.map(peg => {
				return Bodies.circle(peg.x, peg.y, GAME_CONFIG.pegRadius, {
					...GAME_CONFIG.pegOptions,
					render: { ...GAME_CONFIG.pegRender }
				});
			});
			World.add(world, pegObjects);
		})
		.catch(error => console.error('Error loading pegs:', error));

	// ボール追加ボタンのイベント
	addButton.addEventListener('click', () => {
		const ball = Bodies.circle(
			Math.random() * (GAME_CONFIG.width - 80) + 40, // X座標をランダムに
			20,
			GAME_CONFIG.ballRadius,
			{
				...GAME_CONFIG.ballOptions,
				render: {
					fillStyle: `hsl(${Math.random() * 360}, 90%, 60%)` // ランダムな色
				}
			}
		);
		World.add(world, ball);
	});

	// 画面外に出たボールを削除してパフォーマンスを維持
	Events.on(engine, 'afterUpdate', () => {
		Composite.allBodies(world).forEach(body => {
			if (!body.isStatic && body.position.y > GAME_CONFIG.height + 50) {
				World.remove(world, body);
			}
		});
	});
});
