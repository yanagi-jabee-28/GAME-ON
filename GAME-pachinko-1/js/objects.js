/**
 * Objects factory for Pachinko
 *
 * 役割：
 * - 各種オブジェクト（ball/peg/rect/polygon/topPlate 等）を生成する純粋関数群
 * - config.js の GAME_CONFIG を参照し、描画/物理特性（material, label, render.layer 等）を付与
 * - main.js から呼び出されるユーティリティとして、生成とレイアウト適用に専念
 *
 * 読み方（セクション目次）：
 *  1) ユーティリティ（定義取得・マージ・material正規化・オフセット）
 *  2) プリミティブ生成（Ball/Rect/DecorRect/Polygon/DecorPolygon/LaunchPad）
 *  3) 境界生成（createBounds + addBoundsToWorld）
 *  4) データ駆動の生成（loadPegs：配列形式/グループ形式の両対応）
 *  5) 役物（風車）の複合ボディ生成（createRotatingYakumono）
 */

// --- 共通ユーティリティ: 材料・ラベル・描画の適用を一元化 ---
function getObjectDef(key) {
	return (GAME_CONFIG && GAME_CONFIG.objects && GAME_CONFIG.objects[key]) || {};
}

// Matter.Body 生成用オプションを、GAME_CONFIG のデフォルト + 呼び出し元の上書きで合成する
function makeBodyOptions(key, overrides = {}) {
	const def = getObjectDef(key);
	const baseOpts = Object.assign({}, def.options || {});
	const baseRender = Object.assign({ layer: 1 }, def.render || {});
	const merged = Object.assign({}, baseOpts, { label: def.label, material: def.material, render: baseRender }, overrides);
	if (overrides && overrides.render) {
		merged.render = Object.assign({}, baseRender, overrides.render);
	}
	return merged;
}

// 生成後の Body に label/material を再付与（複合ボディや parts にも波及）
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
// JSON 由来の材質名を GAME_MATERIALS に照合して正規化（未定義は素通し）
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
 * 新しいボールを作成
 * - 既定ではランダム色（config.objects.ball.randomColor が false なら指定色）
 */
function createBall(x, y, options = {}) {
	const ballConfig = getObjectDef('ball');
	const optionFill = options && options.render && options.render.fillStyle;
	const useRandom = (typeof ballConfig.randomColor === 'undefined') ? true : Boolean(ballConfig.randomColor);
	const generatedColor = `hsl(${Math.random() * 360}, 90%, 60%)`;
	const fill = optionFill || (useRandom ? generatedColor : (ballConfig.render && ballConfig.render.fillStyle) || '#ccc');
	const layerVal = (options && options.render && options.render.layer) ?? (ballConfig.render && ballConfig.render.layer) ?? 1;
	const opt = makeBodyOptions('ball', { render: { fillStyle: fill, layer: layerVal } });
	const body = Matter.Bodies.circle(x, y, ballConfig.radius, Object.assign({}, opt, options, { sleepThreshold: Infinity }));
	return tagBodyWithDef(body, 'ball');
}

// レイアウト基準（baseWidth/baseHeight）との差分から、左右上下のセンターオフセットを算出
function getOffsets() {
	const width = GAME_CONFIG.dimensions?.width || 0;
	const height = GAME_CONFIG.dimensions?.height || 0;
	const baseWidth = GAME_CONFIG.dimensions?.baseWidth || width;
	const baseHeight = GAME_CONFIG.dimensions?.baseHeight || height;

	const xOffset = (width - baseWidth) / 2;
	const yOffset = (height - baseHeight) / 2;
	return { xOffset, yOffset };
}

/**
 * ゲームエリアの境界（壁・床・天板）を作成
 * - topPlate.enabled が true の場合に、アーチ/ドームの天板を生成
 * - poly-decomp 依存を避けるため、既定はクアッド分割（安定・堅牢）
 */
function createBounds() {
	const width = GAME_CONFIG.dimensions?.width || 650;
	const height = GAME_CONFIG.dimensions?.height || 900;
	const wallConfig = getObjectDef('wall');
	const floorConfig = getObjectDef('floor');

	const wallOptions = makeBodyOptions('wall');
	const tpBodyCfg = (GAME_CONFIG.objects && GAME_CONFIG.objects.topPlateBody) || { label: 'top-plate', material: (GAME_MATERIALS && GAME_MATERIALS.TOP_PLATE) || 'top_plate' };
	let topPlateOptions = makeBodyOptions('topPlateBody');
	// 天板の色を config から上書き（指定があれば）
	if (GAME_CONFIG.topPlate && GAME_CONFIG.topPlate.color) {
		const tpColor = GAME_CONFIG.topPlate.color;
		topPlateOptions = Object.assign({}, topPlateOptions, {
			render: Object.assign({}, topPlateOptions.render || {}, { fillStyle: tpColor })
		});
	}
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
			const rect = Matter.Bodies.rectangle(width / 2, topY, width, thickness, { ...topPlateOptions, isStatic: true, label: tpBodyCfg.label });
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
				const plateOptions = { ...topPlateOptions, isStatic: true, slop: 0.02 };
				// removeCollinear を小さくして分解時の誤差を抑える
				const poly = Matter.Bodies.fromVertices(cx, centerY, [localVerts], plateOptions, true, 0.0001);
				poly.label = tpBodyCfg.label;
				poly.material = tpBodyCfg.material;
				poly.render = Object.assign({ visible: true }, topPlateOptions.render || {});
				bounds.push(poly);
			} else {
				// フォールバック: 連結クアッド（極小オーバーラップ）
				const parts = [];
				const delta = (end - start) / segs;
				const eps = Math.max(delta * 0.003, 0.0015); // オーバーラップ角度（より小さく）
				const plateOptions = { ...topPlateOptions, isStatic: true, slop: 0.02 };
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
				body.render = Object.assign({ visible: true }, topPlateOptions.render || {});
				bounds.push(body);
			}
		} else {
			// 画面幅に合わせた円弧（弦長 = width）
			const halfChordOverRadius = (width / 2) / radius;
			if (!isFinite(radius) || halfChordOverRadius >= 1) {
				const topY = thickness / 2;
				const rect = Matter.Bodies.rectangle(width / 2, topY, width, thickness, { ...topPlateOptions, isStatic: true, label: tpBodyCfg.label });
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
					const plateOptions = { ...topPlateOptions, isStatic: true, slop: 0.04 };
					const poly = Matter.Bodies.fromVertices(cx, centerY, [localVerts], plateOptions, true, 0.0001);
					poly.label = tpBodyCfg.label;
					poly.material = tpBodyCfg.material;
					poly.render = Object.assign({ visible: true }, topPlateOptions.render || {});
					bounds.push(poly);
				} else {
					// フォールバック: 連結クアッド
					const parts = [];
					const delta = (end - start) / segs;
					const eps = Math.max(delta * 0.003, 0.0015);
					const plateOptions = { ...topPlateOptions, isStatic: true, slop: 0.02 };
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
					body.render = Object.assign({ visible: true }, topPlateOptions.render || {});
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
	// 厚みを増やすが、内側の境界位置は従来どおりに保つ（外側へ厚く）
	bounds.push(Matter.Bodies.rectangle(-20, height / 2, 40, height, wallOptions));
	bounds.push(Matter.Bodies.rectangle(width + 20, height / 2, 40, height, wallOptions));
	return bounds;
}

// ワールドに境界群を一括追加（呼び出し箇所を簡潔に）
function addBoundsToWorld(bounds, world) {
	if (Array.isArray(bounds) && bounds.length) {
		Matter.World.add(world, bounds);
	}
}

/**
 * 任意の長方形（静的/動的）
 * spec: { x, y, width, height, angleDeg?, isStatic?, material?, color?, label?, layer?, anchor? }
 */
function createRectangle(spec = {}) {
	let x = Number(spec.x) || 0;
	let y = Number(spec.y) || 0;
	const w = Math.max(1, Number(spec.width) || 1);
	const h = Math.max(1, Number(spec.height) || 1);
	// 座標の基準（anchor/origin）: 'center'（既定） or 'top-left'
	const rawAnchor = (spec.anchor || spec.origin || 'center');
	const anchor = String(rawAnchor).toLowerCase().replace(/\s+/g, '-');
	if (anchor === 'top-left' || anchor === 'topleft' || anchor === 'left-top') {
		// 与えられた (x,y) は左上基準→Matter は中心基準のため、中心に変換
		x = x + w / 2;
		y = y + h / 2;
	}
	const angleDeg = Number(spec.angleDeg || spec.angle || 0);
	const angleRad = angleDeg * Math.PI / 180;
	const mat = normalizeMaterialId(spec.material) || getObjectDef('rect').material;
	const label = spec.label || getObjectDef('rect').label;
	const color = (spec.color || spec.fill || spec.fillStyle || getObjectDef('rect').render?.fillStyle);
	const layer = (spec.layer != null ? Number(spec.layer) : (getObjectDef('rect').render?.layer ?? 1));
	const renderOverride = {};
	if (color) renderOverride.fillStyle = color;
	renderOverride.layer = layer;
	const opts = makeBodyOptions('rect', Object.assign({}, mat ? { material: mat } : {}, label ? { label } : {},
		(typeof spec.isStatic === 'boolean') ? { isStatic: spec.isStatic } : {}, { render: renderOverride }));

	const body = Matter.Bodies.rectangle(x, y, w, h, opts);
	if (angleRad) Matter.Body.setAngle(body, angleRad);
	return body;
}

/**
 * 描画専用（非干渉）長方形
 */
function createDecorRectangle(spec = {}) {
	const base = Object.assign({ material: getObjectDef('decor').material, layer: (spec.layer != null ? Number(spec.layer) : (getObjectDef('decor').render?.layer ?? 1)) }, spec);
	// isSensor/static はオプション合成により付与される
	const body = createRectangle(base);
	// 念のためセンサー化（物理干渉しない）
	body.isSensor = true;
	body.isStatic = true;
	// ラベルをdecorに統一（指定があれば尊重）
	body.label = spec.label || getObjectDef('decor').label;
	// マテリアルはDECOR
	body.material = getObjectDef('decor').material;
	return body;
}

/**
 * 任意多角形（静的）
 * - coordMode: 'world' or 'local'（既定は 'local'）
 * - 角度/位置オフセット、任意ピボットを用いた回転にも対応
 */
function createPolygon(spec = {}) {
	const pts = Array.isArray(spec.points) ? spec.points : [];
	if (pts.length < 3) return null; // 要三点以上
	const angleDeg = Number(spec.angleDeg || spec.angle || 0);
	const angleRad = angleDeg * Math.PI / 180;
	const mat = normalizeMaterialId(spec.material) || getObjectDef('polygon').material;
	const label = spec.label || getObjectDef('polygon').label;
	const color = (spec.color || spec.fill || spec.fillStyle || getObjectDef('polygon').render?.fillStyle);
	const layer = (spec.layer != null ? Number(spec.layer) : (getObjectDef('polygon').render?.layer ?? 1));
	const modeRaw = spec.coordMode || spec.pointsMode || (spec.useWorldPoints ? 'world' : 'local');
	const mode = (String(modeRaw || 'local').toLowerCase() === 'world') ? 'world' : 'local';
	const offX = Number(spec.offsetX ?? (spec.offset && spec.offset.x)) || 0;
	const offY = Number(spec.offsetY ?? (spec.offset && spec.offset.y)) || 0;
	const rotOffDeg = Number(spec.angleOffsetDeg ?? spec.angleOffset) || 0;
	const rotOffRad = rotOffDeg * Math.PI / 180;
	const pivotModeRaw = spec.pivotMode || (spec.pivot && spec.pivot.mode) || 'centroid';
	const pivotMode = String(pivotModeRaw).toLowerCase() === 'point' ? 'point' : 'centroid';
	const pivotX = Number(spec.pivot && spec.pivot.x);
	const pivotY = Number(spec.pivot && spec.pivot.y);
	const opts = makeBodyOptions('polygon', Object.assign({}, mat ? { material: mat } : {}, label ? { label } : {},
		(typeof spec.isStatic === 'boolean') ? { isStatic: spec.isStatic } : {}, { render: Object.assign({}, color ? { fillStyle: color } : {}, { layer }) }));

	let body;
	if (mode === 'world') {
		// ワールド座標で与えられた頂点群を、その重心位置にボディを配置してローカル化
		let worldVerts = pts.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
		// 可能なら Matter の重心計算を使用
		let c;
		try {
			c = Matter.Vertices && typeof Matter.Vertices.centre === 'function'
				? Matter.Vertices.centre(worldVerts)
				: null;
		} catch (_) { c = null; }
		if (!c) {
			const sx = worldVerts.reduce((s, v) => s + v.x, 0);
			const sy = worldVerts.reduce((s, v) => s + v.y, 0);
			c = { x: sx / worldVerts.length, y: sy / worldVerts.length };
		}
		// 回転オフセット（基準: 指定点 or 重心）を適用
		if (rotOffRad) {
			const pivot = (pivotMode === 'point' && isFinite(pivotX) && isFinite(pivotY)) ? { x: pivotX, y: pivotY } : c;
			worldVerts = worldVerts.map(v => {
				const dx = v.x - pivot.x, dy = v.y - pivot.y;
				const rx = dx * Math.cos(rotOffRad) - dy * Math.sin(rotOffRad);
				const ry = dx * Math.sin(rotOffRad) + dy * Math.cos(rotOffRad);
				return { x: pivot.x + rx, y: pivot.y + ry };
			});
		}
		// 位置オフセット（ワールド）
		if (offX || offY) {
			worldVerts = worldVerts.map(v => ({ x: v.x + offX, y: v.y + offY }));
		}
		// 変換後の重心で再配置
		try {
			c = Matter.Vertices && typeof Matter.Vertices.centre === 'function'
				? Matter.Vertices.centre(worldVerts)
				: c;
		} catch (_) { /* keep c */ }
		const localVerts = worldVerts.map(v => ({ x: v.x - c.x, y: v.y - c.y }));
		body = Matter.Bodies.fromVertices(c.x, c.y, [localVerts], opts, true, 0.0001);
	} else {
		// ローカル座標: x,y を中心として配置
		let x = Number(spec.x) || 0;
		let y = Number(spec.y) || 0;
		// オフセットは中心を移動
		x += offX; y += offY;
		let localVerts = pts.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
		// 回転オフセット適用（基準: 指定点=ローカル座標 or 重心）
		if (rotOffRad) {
			// 重心（ローカル）を計算
			let lc = { x: 0, y: 0 };
			try {
				lc = (Matter.Vertices && typeof Matter.Vertices.centre === 'function') ? Matter.Vertices.centre(localVerts) : lc;
			} catch (_) { /* no-op */ }
			const pivotLocal = (pivotMode === 'point' && isFinite(pivotX) && isFinite(pivotY)) ? { x: pivotX, y: pivotY } : lc;
			localVerts = localVerts.map(v => {
				const dx = v.x - pivotLocal.x, dy = v.y - pivotLocal.y;
				const rx = dx * Math.cos(rotOffRad) - dy * Math.sin(rotOffRad);
				const ry = dx * Math.sin(rotOffRad) + dy * Math.cos(rotOffRad);
				return { x: pivotLocal.x + rx, y: pivotLocal.y + ry };
			});
		}
		body = Matter.Bodies.fromVertices(x, y, [localVerts], opts, true, 0.0001);
	}
	if (angleRad) Matter.Body.setAngle(body, angleRad);
	return body;
}

/**
 * 描画専用多角形（非干渉）
 */
function createDecorPolygon(spec = {}) {
	const base = Object.assign({ material: getObjectDef('decorPolygon').material, isStatic: true }, spec);
	const body = createPolygon(base);
	if (!body) return body;
	body.isSensor = true;
	body.isStatic = true;
	body.label = spec.label || getObjectDef('decorPolygon').label;
	body.material = getObjectDef('decorPolygon').material;
	return body;
}

/**
 * 発射台（キャンバス描画用、非干渉）
 */
function createLaunchPadBody(spec = {}) {
	const padW = Math.max(1, Number(spec.width || 64));
	const padH = Math.max(1, Number(spec.height || 14));
	const color = spec.color || spec.background || '#444';
	const borderColor = spec.borderColor || '#fff';
	const layer = (spec.layer != null ? Number(spec.layer) : (GAME_CONFIG.objects?.rect?.render?.layer ?? 1));
	const opts = makeBodyOptions('rect', {
		label: 'launch-pad',
		material: getObjectDef('decor')?.material,
		isStatic: true,
		isSensor: true,
		render: { fillStyle: color, strokeStyle: borderColor, lineWidth: 3, layer }
	});
	const body = Matter.Bodies.rectangle(0, 0, padW, padH, opts);
	// 完全非干渉（衝突しない）
	body.collisionFilter = Object.assign({}, body.collisionFilter, { mask: 0x0000 });
	return body;
}

/**
 * 釘プリセットのロードと配置
 * - 旧形式: 配列 [{x,y}, ...]
 * - 新形式: { defaults, groups:[ { offset|dx/dy, radius|color|material|layer, points|pegs:[{x,y,...}] } ] }
 * - フォールバック: ルートの points / pegs
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
					const layer = (peg && peg.layer != null) ? Number(peg.layer) : (pegConfig.render?.layer ?? 1);
					const opts = makeBodyOptions('peg', Object.assign({}, color ? { render: { fillStyle: color } } : {}, mat ? { material: mat } : {}, { render: { layer } }));
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
			const globalLayer = (global && global.layer != null) ? Number(global.layer) : (pegConfig.render?.layer ?? 1);

			const makeOptions = (material, color) => makeBodyOptions('peg', Object.assign({}, material ? { material } : {}, color ? { render: { fillStyle: color } } : {}));

			const bodies = [];
			groups.forEach(group => {
				const gOffX = num(group?.offset?.x ?? group?.dx, 0);
				const gOffY = num(group?.offset?.y ?? group?.dy, 0);
				const gRadius = num(group?.radius, globalRadius);
				const gColor = getColor(group) || globalColor;
				const gMaterial = normalizeMaterialId(group?.material) || globalMaterial;
				const gLayer = (group && group.layer != null) ? Number(group.layer) : globalLayer;

				const points = Array.isArray(group?.points) ? group.points
					: (Array.isArray(group?.pegs) ? group.pegs : []);

				points.forEach(pt => {
					const px = num(pt.x) + gOffX + globalOffsetX + xOffset;
					const py = num(pt.y) + gOffY + globalOffsetY + yOffset;
					const radius = num(pt.radius, gRadius);
					const color = getColor(pt) || gColor;
					const mat = normalizeMaterialId(pt?.material) || gMaterial;
					const layer = (pt && pt.layer != null) ? Number(pt.layer) : gLayer;
					const opts = makeOptions(mat, color);
					opts.render = Object.assign({}, opts.render || {}, { layer });
					bodies.push(Matter.Bodies.circle(px, py, radius, opts));
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
					const layer = (pt && pt.layer != null) ? Number(pt.layer) : globalLayer;
					const opts = makeOptions(mat, color);
					opts.render = Object.assign({}, opts.render || {}, { layer });
					bodies.push(Matter.Bodies.circle(px, py, radius, opts));
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
 * 回転役物（風車）の複合ボディ生成
 */
function createRotatingYakumono(blueprint) {
	const windDef = getObjectDef('windmill') || {};
	const defaults = windDef.defaults || {};
	const commonBodyOptions = getObjectDef('yakumono_blade') || {};

	const shape = Object.assign({}, defaults, blueprint.shape || {});
	const x = blueprint.x, y = blueprint.y;

	if (shape.type !== 'windmill') return null;

	const bladeRender = Object.assign({}, windDef.render || {}, { layer: (windDef.render?.layer ?? 1) }, blueprint.render || {});
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
