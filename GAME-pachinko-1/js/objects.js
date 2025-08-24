/**
 * このファイルは、ゲームに登場する様々なオブジェクト（物体）を生成するための関数を定義します。
 * 各関数は、config.jsで定義された設定を基に、Matter.jsのボディを作成します。
 * 「オブジェクトの工場」のような役割を担います。
 */

// --- 共通ユーティリティ: 材料・ラベル・描画の適用を一元化 ---
function getObjectDef(key) {
	return (GAME_CONFIG && GAME_CONFIG.objects && GAME_CONFIG.objects[key]) || {};
}

function makeBodyOptions(key, overrides = {}) {
	const def = getObjectDef(key);
	const baseOpts = Object.assign({}, def.options || {});
	const baseRender = Object.assign({}, def.render || {});
	const merged = Object.assign({}, baseOpts, { label: def.label, material: def.material, render: baseRender }, overrides);
	if (overrides && overrides.render) {
		merged.render = Object.assign({}, baseRender, overrides.render);
	}
	return merged;
}

function tagBodyWithDef(body, defOrKey) {
	const def = typeof defOrKey === 'string' ? getObjectDef(defOrKey) : (defOrKey || {});
	if (!body) return body;
	if (def.label) body.label = def.label;
	if (def.material) body.material = def.material;
	if (Array.isArray(body.parts)) {
		for (const p of body.parts) {
			if (p === body) continue;
			if (def.label) p.label = def.label;
			if (def.material) p.material = def.material;
		}
	}
	return body;
}

// JSON由来の材質文字列を正規化（'METAL2' or 'metal2' → GAME_MATERIALSの値、見つからなければそのまま）
function normalizeMaterialId(m) {
	if (typeof m !== 'string') return undefined;
	const s = m.trim();
	if (!s) return undefined;
	const lut = (typeof GAME_MATERIALS !== 'undefined' && GAME_MATERIALS) ? GAME_MATERIALS : {};
	const lower = s.toLowerCase();
	for (const [k, v] of Object.entries(lut)) {
		if (String(k).toLowerCase() === lower) return v;
		if (String(v).toLowerCase() === lower) return v;
	}
	// 未登録の材質名も許容（相互作用未定義なら default にフォールバック）
	return s;
}

/**
 * 新しいボールを作成します。
 * @param {number} x - 生成するx座標
 * @param {number} y - 生成するy座標
 * @param {object} [options={}] - デフォルト設定を上書きするための追加オプション
 * @returns {Matter.Body} Matter.jsのボールボディ
 */
function createBall(x, y, options = {}) {
	const ballConfig = getObjectDef('ball');
	const optionFill = options && options.render && options.render.fillStyle;
	const useRandom = (typeof ballConfig.randomColor === 'undefined') ? true : Boolean(ballConfig.randomColor);
	const generatedColor = `hsl(${Math.random() * 360}, 90%, 60%)`;
	const fill = optionFill || (useRandom ? generatedColor : (ballConfig.render && ballConfig.render.fillStyle) || '#ccc');
	const opt = makeBodyOptions('ball', { render: { fillStyle: fill } });
	const body = Matter.Bodies.circle(x, y, ballConfig.radius, Object.assign({}, opt, options));
	return tagBodyWithDef(body, 'ball');
}

// helper: compute layout offsets once for reuse
function getOffsets() {
	const width = GAME_CONFIG.dimensions?.width || GAME_CONFIG.width || 0;
	const height = GAME_CONFIG.dimensions?.height || GAME_CONFIG.height || 0;
	const baseWidth = GAME_CONFIG.dimensions?.baseWidth || GAME_CONFIG.baseWidth || width;
	const baseHeight = GAME_CONFIG.dimensions?.baseHeight || GAME_CONFIG.baseHeight || height;

	const xOffset = (width - baseWidth) / 2;
	const yOffset = (height - baseHeight) / 2;
	return { xOffset, yOffset };
}

/**
 * ゲームエリアの境界（壁と床）を作成します。
 * @returns {Matter.Body[]} bounds
 */
function createBounds() {
	const width = GAME_CONFIG.dimensions?.width || GAME_CONFIG.width || 650;
	const height = GAME_CONFIG.dimensions?.height || GAME_CONFIG.height || 900;
	const wallConfig = getObjectDef('wall');
	const floorConfig = getObjectDef('floor');

	const wallOptions = makeBodyOptions('wall');
	const tpBodyCfg = (GAME_CONFIG.objects && GAME_CONFIG.objects.topPlateBody) || { label: 'top-plate', material: (GAME_MATERIALS && GAME_MATERIALS.TOP_PLATE) || 'top_plate' };
	const floorOptions = makeBodyOptions('floor');

	const bounds = [];

	// 上壁の生成
	if (GAME_CONFIG.topPlate && GAME_CONFIG.topPlate.enabled) {
		const tp = GAME_CONFIG.topPlate;
		const cx = width / 2 + (tp.centerOffsetX || 0);
		// 極端な分割数は負荷と数値誤差の原因になるため上限を設ける
		const segs = Math.min(64, Math.max(12, tp.segments || 24));
		const thickness = Math.max(2, tp.thickness || 20);
		const radius = tp.radius;

		const hasDecomp = (typeof window !== 'undefined' && typeof window.decomp !== 'undefined');
		// poly-decomp の quickDecomp が複雑形状（環状セクタ）で暴走するため、
		// 天板に関しては常にクアッド分割で安全に生成する。
		const useSinglePolygon = false;

		// 無効な半径は矩形にフォールバック
		if (!isFinite(radius) || radius <= thickness) {
			const topY = thickness / 2;
			const rect = Matter.Bodies.rectangle(width / 2, topY, width, thickness, { ...wallOptions, isStatic: true, label: tpBodyCfg.label });
			rect.material = tpBodyCfg.material;
			bounds.push(rect);
		} else if (tp.mode === 'dome') {
			// 半円: π..2π の環状セクタ
			const rOuter = radius;
			const rInner = Math.max(1, radius - thickness);
			const marginTop = 8;
			const topApexY = thickness / 2 + marginTop; // ドームの最上点の視覚オフセット
			const centerY = (tp.centerOffsetY || 0) + topApexY + radius;

			const start = Math.PI, end = 2 * Math.PI;
			if (hasDecomp && useSinglePolygon) {
				// アンカーを (cx, centerY) に固定し、局所頂点を渡す（重複端点は排除）
				const localVerts = [];
				for (let i = 0; i <= segs; i++) {
					const a = start + (i / segs) * (end - start);
					localVerts.push({ x: rOuter * Math.cos(a), y: rOuter * Math.sin(a) });
				}
				for (let i = segs - 1; i >= 1; i--) { // 端点の二重追加を避ける
					const a = start + (i / segs) * (end - start);
					localVerts.push({ x: rInner * Math.cos(a), y: rInner * Math.sin(a) });
				}
				const plateOptions = { ...wallOptions, isStatic: true, slop: 0.02 };
				// removeCollinear を小さくして分解時の誤差を抑える
				const poly = Matter.Bodies.fromVertices(cx, centerY, [localVerts], plateOptions, true, 0.0001);
				poly.label = wallConfig.label || 'wall';
				poly.render = Object.assign({ visible: true }, wallOptions.render || {});
				bounds.push(poly);
			} else {
				// フォールバック: 連結クアッド（極小オーバーラップ）
				const parts = [];
				const delta = (end - start) / segs;
				const eps = Math.max(delta * 0.003, 0.0015); // オーバーラップ角度（より小さく）
				const plateOptions = { ...wallOptions, isStatic: true, slop: 0.02 };
				for (let i = 0; i < segs; i++) {
					let a0 = start + i * delta - eps;
					let a1 = start + (i + 1) * delta + eps;
					if (i === 0) a0 = start;
					if (i === segs - 1) a1 = end;
					const p0 = { x: cx + rOuter * Math.cos(a0), y: centerY + rOuter * Math.sin(a0) };
					const p1 = { x: cx + rOuter * Math.cos(a1), y: centerY + rOuter * Math.sin(a1) };
					const p2 = { x: cx + rInner * Math.cos(a1), y: centerY + rInner * Math.sin(a1) };
					const p3 = { x: cx + rInner * Math.cos(a0), y: centerY + rInner * Math.sin(a0) };
					const cxq = (p0.x + p1.x + p2.x + p3.x) / 4;
					const cyq = (p0.y + p1.y + p2.y + p3.y) / 4;
					const qverts = [[
						{ x: p0.x - cxq, y: p0.y - cyq },
						{ x: p1.x - cxq, y: p1.y - cyq },
						{ x: p2.x - cxq, y: p2.y - cyq },
						{ x: p3.x - cxq, y: p3.y - cyq }
					]];
					const part = Matter.Bodies.fromVertices(cxq, cyq, qverts, plateOptions, false);
					part.label = tpBodyCfg.label;
					part.material = tpBodyCfg.material;
					parts.push(part);
				}
				const body = Matter.Body.create({ parts, isStatic: true, label: tpBodyCfg.label });
				body.material = tpBodyCfg.material;
				body.render = Object.assign({ visible: true }, wallOptions.render || {});
				bounds.push(body);
			}
		} else {
			// 画面幅に合わせた円弧（弦長 = width）
			const halfChordOverRadius = (width / 2) / radius;
			if (!isFinite(radius) || halfChordOverRadius >= 1) {
				const topY = thickness / 2;
				const rect = Matter.Bodies.rectangle(width / 2, topY, width, thickness, { ...wallOptions, isStatic: true, label: tpBodyCfg.label });
				rect.material = tpBodyCfg.material;
				bounds.push(rect);
			} else {
				const totalAngle = 2 * Math.asin(Math.min(0.999, halfChordOverRadius));
				const start = -totalAngle / 2;
				const end = totalAngle / 2;
				const rOuter = radius;
				const rInner = Math.max(1, radius - thickness);
				const margin = 8;
				const centerY = (tp.centerOffsetY || 0) + (radius - thickness / 2 - margin);

				if (hasDecomp && useSinglePolygon) {
					// アンカーを (cx, centerY) に固定し、局所頂点で渡す（端点重複は避ける）
					const localVerts = [];
					for (let i = 0; i <= segs; i++) {
						const a = start + (i / segs) * (end - start);
						localVerts.push({ x: rOuter * Math.cos(a), y: rOuter * Math.sin(a) });
					}
					for (let i = segs - 1; i >= 1; i--) {
						const a = start + (i / segs) * (end - start);
						localVerts.push({ x: rInner * Math.cos(a), y: rInner * Math.sin(a) });
					}
					const plateOptions = { ...wallOptions, isStatic: true, slop: 0.04 };
					const poly = Matter.Bodies.fromVertices(cx, centerY, [localVerts], plateOptions, true, 0.0001);
					poly.label = wallConfig.label || 'wall';
					poly.render = Object.assign({ visible: true }, wallOptions.render || {});
					bounds.push(poly);
				} else {
					// フォールバック: 連結クアッド
					const parts = [];
					const delta = (end - start) / segs;
					const eps = Math.max(delta * 0.003, 0.0015);
					const plateOptions = { ...wallOptions, isStatic: true, slop: 0.02 };
					for (let i = 0; i < segs; i++) {
						let a0 = start + i * delta - eps;
						let a1 = start + (i + 1) * delta + eps;
						if (i === 0) a0 = start;
						if (i === segs - 1) a1 = end;
						const p0 = { x: cx + rOuter * Math.cos(a0), y: centerY + rOuter * Math.sin(a0) };
						const p1 = { x: cx + rOuter * Math.cos(a1), y: centerY + rOuter * Math.sin(a1) };
						const p2 = { x: cx + rInner * Math.cos(a1), y: centerY + rInner * Math.sin(a1) };
						const p3 = { x: cx + rInner * Math.cos(a0), y: centerY + rInner * Math.sin(a0) };
						const cxq = (p0.x + p1.x + p2.x + p3.x) / 4;
						const cyq = (p0.y + p1.y + p2.y + p3.y) / 4;
						const qverts = [[
							{ x: p0.x - cxq, y: p0.y - cyq },
							{ x: p1.x - cxq, y: p1.y - cyq },
							{ x: p2.x - cxq, y: p2.y - cyq },
							{ x: p3.x - cxq, y: p3.y - cyq }
						]];
						const part = Matter.Bodies.fromVertices(cxq, cyq, qverts, plateOptions, false);
						part.label = tpBodyCfg.label;
						part.material = tpBodyCfg.material;
						parts.push(part);
					}
					const body = Matter.Body.create({ parts, isStatic: true, label: tpBodyCfg.label });
					body.material = tpBodyCfg.material;
					body.render = Object.assign({ visible: true }, wallOptions.render || {});
					bounds.push(body);
				}
			}
		}
	} else {
		// 従来の単一矩形
		bounds.push(Matter.Bodies.rectangle(width / 2, -10, width, 20, wallOptions));
	}

	// 床と左右の壁
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
 * 任意の長方形ボディを生成します。
 * @param {object} spec - { x, y, width, height, angleDeg?, isStatic?, material?, color?, label? }
 * @returns {Matter.Body}
 */
function createRectangle(spec = {}) {
	const x = Number(spec.x) || 0;
	const y = Number(spec.y) || 0;
	const w = Math.max(1, Number(spec.width) || 1);
	const h = Math.max(1, Number(spec.height) || 1);
	const angleDeg = Number(spec.angleDeg || spec.angle || 0);
	const angleRad = angleDeg * Math.PI / 180;
	const mat = normalizeMaterialId(spec.material) || getObjectDef('rect').material;
	const label = spec.label || getObjectDef('rect').label;
	const color = (spec.color || spec.fill || spec.fillStyle || getObjectDef('rect').render?.fillStyle);
	const opts = makeBodyOptions('rect', Object.assign({}, mat ? { material: mat } : {}, label ? { label } : {}, color ? { render: { fillStyle: color } } : {},
		(typeof spec.isStatic === 'boolean') ? { isStatic: spec.isStatic } : {}));

	const body = Matter.Bodies.rectangle(x, y, w, h, opts);
	if (angleRad) Matter.Body.setAngle(body, angleRad);
	return body;
}

/**
 * 指定されたプリセットファイルから釘のデータを読み込み、ワールドに配置します。
 * @param {string} presetUrl - 釘の座標が定義されたJSONファイルのURL
 * @param {Matter.World} world - オブジェクトを追加するMatter.jsのワールド
 */
function loadPegs(presetUrl, world) {
	const pegConfig = getObjectDef('peg');

	const num = (v, d = 0) => (typeof v === 'number' && isFinite(v)) ? v : d;
	const getColor = (obj) => obj?.color || obj?.render?.fillStyle;

	(async () => {
		try {
			const response = await fetch(presetUrl);
			if (!response.ok) throw new Error(`Failed to load peg preset: ${response.status} ${response.statusText}`);
			const data = await response.json();
			const { xOffset, yOffset } = getOffsets();

			// 旧形式（配列） [{x,y}, ...]
			if (Array.isArray(data)) {
				const pegObjects = data.map(peg => {
					const color = getColor(peg);
					const mat = normalizeMaterialId(peg?.material) || pegConfig.material;
					const opts = makeBodyOptions('peg', Object.assign({}, color ? { render: { fillStyle: color } } : {}, mat ? { material: mat } : {}));
					return Matter.Bodies.circle(
						num(peg.x) + xOffset,
						num(peg.y) + yOffset,
						pegConfig.radius,
						opts
					);
				});
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
			const globalMaterial = normalizeMaterialId(global?.material) || pegConfig.material;

			const makeOptions = (material, color) => makeBodyOptions('peg', Object.assign({}, material ? { material } : {}, color ? { render: { fillStyle: color } } : {}));

			const bodies = [];
			groups.forEach(group => {
				const gOffX = num(group?.offset?.x ?? group?.dx, 0);
				const gOffY = num(group?.offset?.y ?? group?.dy, 0);
				const gRadius = num(group?.radius, globalRadius);
				const gColor = getColor(group) || globalColor;
				const gMaterial = normalizeMaterialId(group?.material) || globalMaterial;

				const points = Array.isArray(group?.points) ? group.points
					: (Array.isArray(group?.pegs) ? group.pegs : []);

				points.forEach(pt => {
					const px = num(pt.x) + gOffX + globalOffsetX + xOffset;
					const py = num(pt.y) + gOffY + globalOffsetY + yOffset;
					const radius = num(pt.radius, gRadius);
					const color = getColor(pt) || gColor;
					const mat = normalizeMaterialId(pt?.material) || gMaterial;
					bodies.push(Matter.Bodies.circle(px, py, radius, makeOptions(mat, color)));
				});
			});

			if (!bodies.length) {
				const points = Array.isArray(data?.points) ? data.points
					: (Array.isArray(data?.pegs) ? data.pegs : []);
				points.forEach(pt => {
					const px = num(pt.x) + globalOffsetX + xOffset;
					const py = num(pt.y) + globalOffsetY + yOffset;
					const radius = num(pt.radius, globalRadius);
					const color = getColor(pt) || globalColor;
					const mat = normalizeMaterialId(pt?.material) || globalMaterial;
					bodies.push(Matter.Bodies.circle(px, py, radius, makeOptions(mat, color)));
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
	const windDef = getObjectDef('windmill') || {};
	const defaults = windDef.defaults || {};
	const commonBodyOptions = getObjectDef('yakumono_blade') || {};

	const shape = Object.assign({}, defaults, blueprint.shape || {});
	const x = blueprint.x, y = blueprint.y;

	if (shape.type !== 'windmill') return null;

	const bladeRender = Object.assign({}, windDef.render || {}, blueprint.render || {});
	if (blueprint.bladeColor) bladeRender.fillStyle = blueprint.bladeColor;

	const centerColor = blueprint.centerColor || blueprint.centerFill || windDef.centerColor || windDef.centerFill || '#333';
	const bladeMaterial = normalizeMaterialId(blueprint.material) || commonBodyOptions.material;
	const centerMaterial = normalizeMaterialId(blueprint.centerMaterial) || bladeMaterial;

	const bladeOptions = makeBodyOptions('yakumono_blade', { render: bladeRender, material: bladeMaterial });

	const parts = [];
	const centerRadius = Math.max(0, Number(shape.centerRadius) || 0);
	const numBlades = Math.max(1, Number(shape.numBlades) || 1);
	const bladeLength = Math.max(1, Number(shape.bladeLength) || 1);
	const bladeWidth = Math.max(1, Number(shape.bladeWidth) || 1);

	if (centerRadius > 0) {
		const centerOptions = makeBodyOptions('yakumono_blade', { material: centerMaterial, render: Object.assign({}, bladeOptions.render || {}, { fillStyle: centerColor }) });
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

	const compound = Matter.Body.create({ parts, isStatic: true });
	return compound;
}
