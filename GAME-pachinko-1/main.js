document.addEventListener('DOMContentLoaded', () => {
    // Matter.jsのモジュールを取得
    const { Engine, Render, Runner, World, Bodies, Composite, Events } = Matter;

    // ゲーム設定
    const width = 450;
    const height = 600;
    const pegRadius = 5;
    const ballRadius = 8;

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
            width: width,
            height: height,
            wireframes: false, // ワイヤーフレームを無効にし、塗りつぶし表示に
            background: '#ffffff'
        }
    });

    // 物理演算の実行
    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    // 壁の作成 (上、下、左、右)
    const wallOptions = { isStatic: true, render: { fillStyle: '#333' } };
    World.add(world, [
        Bodies.rectangle(width / 2, -10, width, 20, wallOptions), // 上壁
        Bodies.rectangle(width / 2, height + 10, width, 20, wallOptions), // 下床
        Bodies.rectangle(-10, height / 2, 20, height, wallOptions), // 左壁
        Bodies.rectangle(width + 10, height / 2, 20, height, wallOptions) // 右壁
    ]);

    // 釘のプリセットを読み込んで配置
    fetch('./pegs-presets/pegs3.json')
        .then(response => response.json())
        .then(pegs => {
            const pegObjects = pegs.map(peg => {
                return Bodies.circle(peg.x, peg.y, pegRadius, {
                    isStatic: true,
                    restitution: 0.5, // 反発係数
                    friction: 0.1,
                    render: { fillStyle: '#555' }
                });
            });
            World.add(world, pegObjects);
        })
        .catch(error => console.error('Error loading pegs:', error));

    // ボール追加ボタンのイベント
    addButton.addEventListener('click', () => {
        const ball = Bodies.circle(
            Math.random() * (width - 80) + 40, // X座標をランダムに
            20,
            ballRadius, 
            {
                restitution: 0.8, // ボールの反発係数
                friction: 0.05,
                density: 0.01,
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
            if (!body.isStatic && body.position.y > height + 50) {
                World.remove(world, body);
            }
        });
    });
});
