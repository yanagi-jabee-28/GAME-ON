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
	// decide fill color: priority -> options.render.fillStyle -> random (if enabled) -> config.render.fillStyle -> fallback
	const optionFill = options && options.render && options.render.fillStyle;
	const useRandom = (typeof ballConfig.randomColor === 'undefined') ? true : Boolean(ballConfig.randomColor);
	const generatedColor = `hsl(${Math.random() * 360}, 90%, 60%)`;
	const fill = optionFill || (useRandom ? generatedColor : (ballConfig.render && ballConfig.render.fillStyle) || '#ccc');

	return Matter.Bodies.circle(
		x,
		y,
		ballConfig.radius,
		{
			...ballConfig.options,
			label: ballConfig.label,
			material: ballConfig.material,
			render: Object.assign({}, ballConfig.render || {}, { fillStyle: fill }),
			...options // 個別のインスタンスでさらに上書き可能
		}
	);
}

// helper: compute layout offsets once for reuse  
function getOffsets() {
	// 新しい設定構造に対応しつつ、後方互換性を保持
	const width = GAME_CONFIG.dimensions?.width || GAME_CONFIG.width || 0;
	const height = GAME_CONFIG.dimensions?.height || GAME_CONFIG.height || 0;
	const baseWidth = GAME_CONFIG.dimensions?.baseWidth || GAME_CONFIG.baseWidth || width;
	const baseHeight = GAME_CONFIG.dimensions?.baseHeight || GAME_CONFIG.baseHeight || height;

	const xOffset = (width - baseWidth) / 2;
	const yOffset = (height - baseHeight) / 2;
	return { xOffset, yOffset };
}

/**
 * ゲームエリアの境界（壁と床）を作成し、ワールドに追加します。
 * @param {Matter.World} world - オブジェクトを追加するMatter.jsのワールド
 */
function createBounds() {
	// 設定から寸法を取得（後方互換性を保持）
	const width = GAME_CONFIG.dimensions?.width || GAME_CONFIG.width || 650;
	const height = GAME_CONFIG.dimensions?.height || GAME_CONFIG.height || 900;
	const wallConfig = GAME_CONFIG.objects.wall;
	const floorConfig = GAME_CONFIG.objects.floor;

	// Matter.jsでは、オプションオブジェクトは都度新しいものを作成することが推奨されます
	const wallOptions = { ...wallConfig.options, render: { ...wallConfig.render } };
	const floorOptions = { ...floorConfig.options, label: floorConfig.label, render: { ...floorConfig.render } };

	const bounds = [];

	// 上壁：通常は長方形1枚だが、configで円弧天板を有効化している場合は
	// 複数の短い長方形セグメントで円弧を近似する
	if (GAME_CONFIG.topPlate && GAME_CONFIG.topPlate.enabled) {
		const tp = GAME_CONFIG.topPlate;
		const cx = width / 2 + (tp.centerOffsetX || 0); // arc の中心 x (config でオフセット可能)
		// arc の中心 y を計算して、ドーム（半円）がキャンバス上部に収まるようにする。
		// ドームの円心は画像の上部外側にあるため、円心 y を下に寄せてドーム本体がキャンバスに入るよう計算します。
		// ここでは円心を (tp.radius - tp.thickness/2 - margin) 分だけ上にして、ドームの山頂がキャンバス内に来るようにします。
		const margin = 8;
		const cy = (tp.centerOffsetY || 0) + (tp.radius - (tp.thickness || 20) / 2 - margin);
		console.info('topPlate debug: cx=', cx, 'cy=', cy, 'radius=', tp.radius, 'thickness=', tp.thickness, 'mode=', tp.mode);
		const segs = Math.max(6, tp.segments || 24);
		const arcWidth = width; // cover the width
		const halfChordOverRadius = (arcWidth / 2) / tp.radius;

		if (tp.mode === 'dome') {
			// dome の半径が画面幅/2 より小さいと不整合なので自動調整
			if (tp.radius < (width / 2)) {
				console.info('topPlate dome: adjusting radius to fit width');
				tp.radius = Math.round(width / 2);
			}
			const startAngle = Math.PI; // leftmost on circle
			const endAngle = 2 * Math.PI; // rightmost
			// 画面内に山頂が来るように円心 y を再計算する
			const marginTop = 8;
			const topApexY = (tp.thickness || 20) / 2 + marginTop;
			const centerY = (tp.centerOffsetY || 0) + topApexY + tp.radius;
			for (let i = 0; i < segs; i++) {
				const a0 = startAngle + (i / segs) * (endAngle - startAngle);
				const a1 = startAngle + ((i + 1) / segs) * (endAngle - startAngle);
				const aMid = (a0 + a1) / 2;
				const px = cx + tp.radius * Math.cos(aMid);
				const py = centerY + tp.radius * Math.sin(aMid);
				const chord = Math.hypot(tp.radius * Math.cos(a1) - tp.radius * Math.cos(a0), tp.radius * Math.sin(a1) - tp.radius * Math.sin(a0));
				const rect = Matter.Bodies.rectangle(px, py, chord + 2, tp.thickness, wallOptions);
				Matter.Body.rotate(rect, aMid + Math.PI / 2);
				bounds.push(rect);
			}
		} else {
			// asin の定義域外（>1）になると NaN を返すため、その場合は
			// フォールバックとして従来の矩形上壁を追加する。
			if (!isFinite(tp.radius) || halfChordOverRadius >= 1) {
				console.warn('topPlate: radius too small for width; falling back to flat top. radius=', tp.radius, 'width=', width);
				// フォールバック矩形をキャンバス内に配置する（中心を厚さの半分に）
				const topY = (tp.thickness || 20) / 2;
				bounds.push(Matter.Bodies.rectangle(width / 2, topY, width, tp.thickness || 20, wallOptions));
			} else {
				const totalAngle = 2 * Math.asin(Math.min(0.999, halfChordOverRadius)); // chord angle spanning the width
				const startAngle = -totalAngle / 2;
				for (let i = 0; i < segs; i++) {
					const a0 = startAngle + (i / segs) * totalAngle;
					const a1 = startAngle + ((i + 1) / segs) * totalAngle;
					const mx = (Math.cos(a0) + Math.cos(a1)) / 2;
					const my = (Math.sin(a0) + Math.sin(a1)) / 2;
					const px = cx + tp.radius * mx;
					const py = cy + tp.radius * my;
					// segment length approximated by arc chord
					const chord = Math.hypot(tp.radius * Math.cos(a1) - tp.radius * Math.cos(a0), tp.radius * Math.sin(a1) - tp.radius * Math.sin(a0));
					const rect = Matter.Bodies.rectangle(px, py, chord + 2, tp.thickness, wallOptions);
					Matter.Body.rotate(rect, (a0 + a1) / 2 + Math.PI / 2);
					bounds.push(rect);
				}
			}
		}
	} else {
		// 上壁（従来の単一矩形）
		bounds.push(Matter.Bodies.rectangle(width / 2, -10, width, 20, wallOptions));
	}

	// 床と左右の壁は従来どおり
	bounds.push(Matter.Bodies.rectangle(width / 2, height + 10, width, 20, floorOptions));
	bounds.push(Matter.Bodies.rectangle(-10, height / 2, 20, height, wallOptions));
	bounds.push(Matter.Bodies.rectangle(width + 10, height / 2, 20, height, wallOptions));
	return bounds;
}

// helper to add bounds to a world (keeps callsites simple)
function addBoundsToWorld(bounds, world) {
	if (Array.isArray(bounds) && bounds.length) {
		Matter.World.add(world, bounds);
	}
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
			const { xOffset, yOffset } = getOffsets();
			const pegObjects = pegs.map(peg => Matter.Bodies.circle(peg.x + xOffset, peg.y + yOffset, pegConfig.radius, pegOptions));
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
	// Accept human-facing config keys (bladeColor / centerColor) and map them
	// to renderer-specific properties (fillStyle). Keep backward compatibility
	// with existing `render`/`centerFill` keys.
	const bladeRender = Object.assign({}, windDef.render || {}, blueprint.render || {});
	// blueprint may specify bladeColor (human friendly). If present, map to fillStyle.
	if (blueprint.bladeColor) bladeRender.fillStyle = blueprint.bladeColor;

	// center color: prefer human-friendly `centerColor`, fall back to legacy keys
	const centerColor = blueprint.centerColor || blueprint.centerFill || windDef.centerColor || windDef.centerFill || '#333';

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
