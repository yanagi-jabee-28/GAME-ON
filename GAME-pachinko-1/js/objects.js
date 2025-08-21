/**
 * このファイルは、ゲームに登場する様々なオブジェクト（物体）を生成するための関数を定義します。
 * 各関数は、config.jsで定義された設定を基に、Matter.jsのボディを作成します。
 * 「オブジェクトの工場」のような役割を担います。
 */

/**
 * 新しいボールを作成します。
 * @param {number} x - 生成するx座標
 * @param {number} y - 生成するy座標
 * @param {object} [options={}] - デフォルト設定を上書きするための追加オプション
 * @returns {Matter.Body} Matter.jsのボールボディ
 */
function createBall(x, y, options = {}) {
	const ballConfig = GAME_CONFIG.objects.ball;
	// 色相をランダムにすることで、毎回異なる色のボールを生成します
	const randomColor = `hsl(${Math.random() * 360}, 90%, 60%)`;

	return Matter.Bodies.circle(
		x,
		y,
		ballConfig.radius,
		{
			...ballConfig.options,
			label: ballConfig.label,
			material: ballConfig.material,
			render: {
				...ballConfig.render, // 基本の描画設定を継承
				fillStyle: randomColor // 色だけを上書き
			},
			...options // 個別のインスタンスでさらに上書き可能
		}
	);
}

/**
 * ゲームエリアの境界（壁と床）を作成し、ワールドに追加します。
 * @param {Matter.World} world - オブジェクトを追加するMatter.jsのワールド
 */
function createBounds(world) {
	const { width, height } = GAME_CONFIG;
	const wallConfig = GAME_CONFIG.objects.wall;
	const floorConfig = GAME_CONFIG.objects.floor;

	// Matter.jsでは、オプションオブジェクトは都度新しいものを作成することが推奨されます
	const wallOptions = { ...wallConfig.options, render: { ...wallConfig.render } };
	const floorOptions = { ...floorConfig.options, label: floorConfig.label, render: { ...floorConfig.render } };

	const bounds = [
		// 上壁
		Matter.Bodies.rectangle(width / 2, -10, width, 20, wallOptions),
		// 床
		Matter.Bodies.rectangle(width / 2, height + 10, width, 20, floorOptions),
		// 左壁
		Matter.Bodies.rectangle(-10, height / 2, 20, height, wallOptions),
		// 右壁
		Matter.Bodies.rectangle(width + 10, height / 2, 20, height, wallOptions)
	];

	Matter.World.add(world, bounds);
}

/**
 * 指定されたプリセットファイルから釘のデータを読み込み、ワールドに配置します。
 * @param {string} presetUrl - 釘の座標が定義されたJSONファイルのURL
 * @param {Matter.World} world - オブジェクトを追加するMatter.jsのワールド
 */
function loadPegs(presetUrl, world) {
	const pegConfig = GAME_CONFIG.objects.peg;
	const pegOptions = {
		...pegConfig.options,
		label: pegConfig.label,
		material: pegConfig.material,
		render: { ...pegConfig.render }
	};

	fetch(presetUrl)
		.then(response => {
			if (!response.ok) {
				throw new Error(`Failed to load peg preset: ${response.statusText}`);
			}
			return response.json();
		})
		.then(pegs => {
			const pegObjects = pegs.map(peg => {
				return Matter.Bodies.circle(peg.x, peg.y, pegConfig.radius, pegOptions);
			});
			Matter.World.add(world, pegObjects);
		})
		.catch(error => console.error('Error loading pegs:', error));
}
