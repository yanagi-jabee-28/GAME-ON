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

/**
 * 設計図に基づいて回転する役物を生成します。
 * @param {object} blueprint - 役物の形状、位置、挙動を定義する設計図オブジェクト
 * @returns {Matter.Body} 生成された役物の複合ボディ
 */
function createRotatingYakumono(blueprint) {
	const { x, y, shape, render, centerFill } = blueprint;
	const commonBodyOptions = GAME_CONFIG.objects.yakumono_blade;
	let bodyParts = [];

	// 中心色の決定：blueprint の centerFill が優先、無ければ config のデフォルト
	const centerColor = centerFill || (GAME_CONFIG.objects.windmill && GAME_CONFIG.objects.windmill.centerFill) || '#333';

	if (shape.type === 'windmill') {
		// 羽根用のオプション
		const bladeOptions = {
			...commonBodyOptions.options,
			label: commonBodyOptions.label,
			material: commonBodyOptions.material,
			render: render
		};

		// 中心円は個別に色を設定
		if (shape.centerRadius > 0) {
			const centerOptions = { ...bladeOptions, render: { ...(bladeOptions.render || {}), fillStyle: centerColor } };
			bodyParts.push(Matter.Bodies.circle(x, y, shape.centerRadius, centerOptions));
		}

		// 羽根を作成
		const bladeLength = shape.bladeLength;
		const bladeWidth = shape.bladeWidth;
		const bladeOffset = shape.centerRadius + (bladeLength / 2);

		for (let i = 0; i < shape.numBlades; i++) {
			const angle = (360 / shape.numBlades) * i;
			const angleRad = angle * Math.PI / 180;

			const partX = x + bladeOffset * Math.cos(angleRad);
			const partY = y + bladeOffset * Math.sin(angleRad);

			const blade = Matter.Bodies.rectangle(partX, partY, bladeLength, bladeWidth, bladeOptions);
			Matter.Body.setAngle(blade, angleRad);
			bodyParts.push(blade);
		}
	}

	// パーツから複合ボディを作成し、静的オブジェクトとして設定
	const compoundBody = Matter.Body.create({
		parts: bodyParts,
		isStatic: true
	});

	return compoundBody;
}
