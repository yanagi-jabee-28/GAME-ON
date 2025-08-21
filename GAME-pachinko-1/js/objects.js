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
			const xOffset = ((GAME_CONFIG.width || 0) - (GAME_CONFIG.baseWidth || GAME_CONFIG.width || 0)) / 2;
			const yOffset = ((GAME_CONFIG.height || 0) - (GAME_CONFIG.baseHeight || GAME_CONFIG.height || 0)) / 2;
			const pegObjects = pegs.map(peg => {
				return Matter.Bodies.circle(peg.x + xOffset, peg.y + yOffset, pegConfig.radius, pegOptions);
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
	const windDef = GAME_CONFIG.objects.windmill || {};
	const defaults = windDef.defaults || {};
	const commonBodyOptions = GAME_CONFIG.objects.yakumono_blade || {};

	// blueprint の shape を defaults で補完
	const shape = Object.assign({}, defaults, blueprint.shape || {});
	const x = blueprint.x, y = blueprint.y;

	if (shape.type !== 'windmill') return null;

	// 描画オプション
	const bladeRender = blueprint.render || windDef.render || {};
	const centerColor = blueprint.centerFill || windDef.centerFill || '#333';

	// 羽根用オプション
	const bladeOptions = Object.assign({}, commonBodyOptions.options || {}, {
		label: commonBodyOptions.label,
		material: commonBodyOptions.material,
		render: bladeRender
	});

	// 作成: 中心と羽根（Compositeに追加）
	const parts = [];
	if (shape.centerRadius > 0) {
		const centerOptions = Object.assign({}, bladeOptions, { render: Object.assign({}, bladeOptions.render || {}, { fillStyle: centerColor }) });
		parts.push(Matter.Bodies.circle(x, y, shape.centerRadius, centerOptions));
	}

	const bladeOffset = shape.centerRadius + (shape.bladeLength / 2);
	for (let i = 0; i < shape.numBlades; i++) {
		const angle = (360 / shape.numBlades) * i;
		const angleRad = angle * Math.PI / 180;
		const partX = x + bladeOffset * Math.cos(angleRad);
		const partY = y + bladeOffset * Math.sin(angleRad);
		const blade = Matter.Bodies.rectangle(partX, partY, shape.bladeLength, shape.bladeWidth, bladeOptions);
		Matter.Body.setAngle(blade, angleRad);
		parts.push(blade);
	}

	// Composite を使って作ると拡張しやすい（将来ジョイントなどを追加可能）
	const composite = Matter.Composite.create();
	parts.forEach(p => Matter.Composite.add(composite, p));

	// 便宜上、Composite から Body を扱う箇所があるコード互換のために複合Bodyを返す
	const compound = Matter.Body.create({ parts, isStatic: true });
	return compound;
}
