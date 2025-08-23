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
	// 頂点配列から“単一の多角形”を生成して隙間をゼロにします
	if (GAME_CONFIG.topPlate && GAME_CONFIG.topPlate.enabled) {
		const tp = GAME_CONFIG.topPlate;
		const cx = width / 2 + (tp.centerOffsetX || 0);
		// 角度分割数（多いほどスムーズ）
		const segs = Math.max(12, tp.segments || 24);
		const thickness = Math.max(2, tp.thickness || 20);
		const radius = tp.radius;

		// 無効な半径の場合はフラットな上壁にフォールバック
		if (!isFinite(radius) || radius <= thickness) {
			const topY = thickness / 2;
			bounds.push(Matter.Bodies.rectangle(width / 2, topY, width, thickness, wallOptions));
		} else if (tp.mode === 'dome') {
			// 半円ドーム: 角度は π から 2π
			const rOuter = radius;
			const rInner = Math.max(1, radius - thickness);
			// ドームの中心Y（既存ロジックを継承）
			const marginTop = 8;
			const topApexY = thickness / 2 + marginTop;
			const centerY = (tp.centerOffsetY || 0) + topApexY + radius;

			// 連結クアッド帯で作成
			const parts = [];
			for (let i = 0; i < segs; i++) {
				const a0 = Math.PI + (i / segs) * Math.PI;
				const a1 = Math.PI + ((i + 1) / segs) * Math.PI;
				const p0 = { x: cx + rOuter * Math.cos(a0), y: centerY + rOuter * Math.sin(a0) };
				const p1 = { x: cx + rOuter * Math.cos(a1), y: centerY + rOuter * Math.sin(a1) };
				const p2 = { x: cx + rInner * Math.cos(a1), y: centerY + rInner * Math.sin(a1) };
				const p3 = { x: cx + rInner * Math.cos(a0), y: centerY + rInner * Math.sin(a0) };
				const cxq = (p0.x + p1.x + p2.x + p3.x) / 4;
				const cyq = (p0.y + p1.y + p2.y + p3.y) / 4;
				const verts = [[
					{ x: p0.x - cxq, y: p0.y - cyq },
					{ x: p1.x - cxq, y: p1.y - cyq },
					{ x: p2.x - cxq, y: p2.y - cyq },
					{ x: p3.x - cxq, y: p3.y - cyq }
				]];
				const quad = Matter.Bodies.fromVertices(cxq, cyq, verts, { ...wallOptions, isStatic: true }, false);
				parts.push(quad);
			}
			const body = Matter.Body.create({ parts, isStatic: true, label: wallConfig.label || 'wall' });
			body.render = Object.assign({ visible: true }, wallOptions.render || {});
			bounds.push(body);
		} else {
			// 幅に合わせた円弧
			const halfChordOverRadius = (width / 2) / radius;
			if (!isFinite(radius) || halfChordOverRadius >= 1) {
				const topY = thickness / 2;
				bounds.push(Matter.Bodies.rectangle(width / 2, topY, width, thickness, wallOptions));
			} else {
				const totalAngle = 2 * Math.asin(Math.min(0.999, halfChordOverRadius));
				const startAngle = -totalAngle / 2;
				const endAngle = totalAngle / 2;
				const rOuter = radius;
				const rInner = Math.max(1, radius - thickness);
				// 既存ロジックの中心Y（弧を上部に配置）
				const margin = 8;
				const centerY = (tp.centerOffsetY || 0) + (radius - thickness / 2 - margin);

				// 連結クアッド帯で作成
				const parts = [];
				for (let i = 0; i < segs; i++) {
					const a0 = startAngle + (i / segs) * (endAngle - startAngle);
					const a1 = startAngle + ((i + 1) / segs) * (endAngle - startAngle);
					const p0 = { x: cx + rOuter * Math.cos(a0), y: centerY + rOuter * Math.sin(a0) };
					const p1 = { x: cx + rOuter * Math.cos(a1), y: centerY + rOuter * Math.sin(a1) };
					const p2 = { x: cx + rInner * Math.cos(a1), y: centerY + rInner * Math.sin(a1) };
					const p3 = { x: cx + rInner * Math.cos(a0), y: centerY + rInner * Math.sin(a0) };
					const cxq = (p0.x + p1.x + p2.x + p3.x) / 4;
					const cyq = (p0.y + p1.y + p2.y + p3.y) / 4;
					const verts = [[
						{ x: p0.x - cxq, y: p0.y - cyq },
						{ x: p1.x - cxq, y: p1.y - cyq },
						{ x: p2.x - cxq, y: p2.y - cyq },
						{ x: p3.x - cxq, y: p3.y - cyq }
					]];
					const quad = Matter.Bodies.fromVertices(cxq, cyq, verts, { ...wallOptions, isStatic: true }, false);
					parts.push(quad);
				}
				const body = Matter.Body.create({ parts, isStatic: true, label: wallConfig.label || 'wall' });
				body.render = Object.assign({ visible: true }, wallOptions.render || {});
				bounds.push(body);
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

	// ヘルパー: 安全な数値化
	const num = (v, d = 0) => (typeof v === 'number' && isFinite(v)) ? v : d;
	const getColor = (obj) => obj?.color || obj?.render?.fillStyle;

	(async () => {
		try {
			const response = await fetch(presetUrl);
			if (!response.ok) throw new Error(`Failed to load peg preset: ${response.status} ${response.statusText}`);
			const data = await response.json();
			const { xOffset, yOffset } = getOffsets();

			// 後方互換: 旧形式（配列） [{x,y}, ...]
			if (Array.isArray(data)) {
				const baseOptions = {
					...pegConfig.options,
					label: pegConfig.label,
					material: pegConfig.material,
					render: { ...pegConfig.render }
				};
				const pegObjects = data.map(peg =>
					Matter.Bodies.circle(
						num(peg.x) + xOffset,
						num(peg.y) + yOffset,
						pegConfig.radius,
						baseOptions
					)
				);
				Matter.World.add(world, pegObjects);
				return;
			}

			// 新形式
			const global = data?.defaults || {};
			const groups = Array.isArray(data?.groups) ? data.groups : [];

			const globalOffsetX = num(global?.offset?.x ?? global?.dx, 0);
			const globalOffsetY = num(global?.offset?.y ?? global?.dy, 0);
			const globalRadius = num(global?.radius, pegConfig.radius);
			const globalColor = getColor(global) || pegConfig.render?.fillStyle;

			const makeOptions = (color) => ({
				...pegConfig.options,
				label: pegConfig.label,
				material: pegConfig.material,
				render: Object.assign({}, pegConfig.render || {}, color ? { fillStyle: color } : {})
			});

			const bodies = [];
			groups.forEach(group => {
				const gOffX = num(group?.offset?.x ?? group?.dx, 0);
				const gOffY = num(group?.offset?.y ?? group?.dy, 0);
				const gRadius = num(group?.radius, globalRadius);
				const gColor = getColor(group) || globalColor;

				const points = Array.isArray(group?.points) ? group.points
					: (Array.isArray(group?.pegs) ? group.pegs : []);

				points.forEach(pt => {
					const px = num(pt.x) + gOffX + globalOffsetX + xOffset;
					const py = num(pt.y) + gOffY + globalOffsetY + yOffset;
					const radius = num(pt.radius, gRadius);
					const color = getColor(pt) || gColor;
					bodies.push(Matter.Bodies.circle(px, py, radius, makeOptions(color)));
				});
			});

			// groups が空で、かつ data.points/pegs が直下にある場合にも対応
			if (!bodies.length) {
				const points = Array.isArray(data?.points) ? data.points
					: (Array.isArray(data?.pegs) ? data.pegs : []);
				points.forEach(pt => {
					const px = num(pt.x) + globalOffsetX + xOffset;
					const py = num(pt.y) + globalOffsetY + yOffset;
					const radius = num(pt.radius, globalRadius);
					const color = getColor(pt) || globalColor;
					bodies.push(Matter.Bodies.circle(px, py, radius, makeOptions(color)));
				});
			}

			if (bodies.length) {
				Matter.World.add(world, bodies);
			} else {
				console.warn('No pegs found in preset:', presetUrl);
			}
		} catch (error) {
			console.error('Error loading pegs:', error);
		}
	})();
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

	// 作成: 中心と羽根（パーツ群）
	const parts = [];
	const centerRadius = Math.max(0, Number(shape.centerRadius) || 0);
	const numBlades = Math.max(1, Number(shape.numBlades) || 1);
	const bladeLength = Math.max(1, Number(shape.bladeLength) || 1);
	const bladeWidth = Math.max(1, Number(shape.bladeWidth) || 1);

	if (centerRadius > 0) {
		const centerOptions = Object.assign({}, bladeOptions, { render: Object.assign({}, bladeOptions.render || {}, { fillStyle: centerColor }) });
		parts.push(Matter.Bodies.circle(x, y, centerRadius, centerOptions));
	}

	const bladeOffset = centerRadius + (bladeLength / 2);
	for (let i = 0; i < numBlades; i++) {
		const angle = (360 / shape.numBlades) * i;
		const angleRad = angle * Math.PI / 180;
		const partX = x + bladeOffset * Math.cos(angleRad);
		const partY = y + bladeOffset * Math.sin(angleRad);
		const blade = Matter.Bodies.rectangle(partX, partY, bladeLength, bladeWidth, bladeOptions);
		Matter.Body.setAngle(blade, angleRad);
		parts.push(blade);
	}

	// 複合Bodyを返す（既存コード互換）
	const compound = Matter.Body.create({ parts, isStatic: true });
	return compound;
}
