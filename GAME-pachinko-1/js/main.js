/**
 * ゲームのメインロジックを管理するファイル。
 * Matter.jsのエンジンのセットアップ、オブジェクトの生成（objects.jsへの委任）、
 * イベントハンドリング（ボールの追加、衝突判定）など、
 * ゲーム全体の流れを制御する「司令塔」の役割を担います。
 */
document.addEventListener('DOMContentLoaded', () => {
	// Matter.jsの主要モジュールを取得
	const { Engine, Render, Runner, World, Events, Body } = Matter;

	// --- 1. エンジンの初期化 ---
	const engine = Engine.create();
	// パフォーマンス向上のため、物理演算の反復回数をデフォルト値に設定
	engine.positionIterations = 6;
	engine.velocityIterations = 4;
	engine.constraintIterations = 2;
	// 動きの停止した物体をスリープさせ、計算負荷を軽減
	engine.enableSleeping = true;
	engine.timing.timeScale = 1;
	engine.world.gravity.y = engine.world.gravity.y; // no-op for clarity
	const world = engine.world;

	// --- 2. レンダラーの作成 (簡潔に) ---
	const cfg = GAME_CONFIG;
	const dims = cfg.dimensions;
	const width = dims.width;
	const height = dims.height;
	const renderOptions = cfg.render || {};
	const container = document.getElementById('game-container');
	if (!container) {
		console.error('Game container element (#game-container) not found.');
		return; // 以降の処理はコンテナがないと成立しないため早期終了
	}
	container.style.width = width + 'px';
	container.style.height = height + 'px';
	// DOMレイヤリングのため relative を付与
	if (!container.style.position) container.style.position = 'relative';

	const render = Render.create({ element: container, engine, options: { width, height, pixelRatio: 1, ...renderOptions, showSleeping: false } });

	// ページ側の背景色（ゲーム外）を設定
	try {
		if (GAME_CONFIG.ui && GAME_CONFIG.ui.outerBackground) {
			document.body.style.backgroundColor = GAME_CONFIG.ui.outerBackground;
		}
	} catch (_) { /* no-op */ }

	// レンダリング順序をレイヤーで制御（未指定は1、負値対応、数値大きいほど前面）
	(function injectLayeredRendering() {
		const getLayer = (b) => {
			const v = b && b.render && typeof b.render.layer === 'number' ? b.render.layer : (b && b.render && b.render.layer != null ? Number(b.render.layer) : 1);
			return Number.isFinite(v) ? v : 1;
		};
		const origBodies = Render.bodies;
		Render.bodies = function (render, bodies, context) {
			try {
				const sorted = Array.isArray(bodies) ? bodies.slice().sort((a, b) => {
					const la = getLayer(a), lb = getLayer(b);
					if (la !== lb) return la - lb; // 小さい層を背面に、大きい層を前面に
					return (a && a.id || 0) - (b && b.id || 0);
				}) : bodies;
				return origBodies.call(this, render, sorted, context);
			} catch (_) {
				return origBodies.call(this, render, bodies, context);
			}
		};
	})();

	// --- 3. 物理演算と描画の開始（標準の Runner を使用） ---
	Render.run(render);
	const runner = Runner.create();
	Runner.run(runner, engine);

	

	// --- 4. オブジェクトの生成 ---
	// topPlate の初期調整をより簡潔に
	if (GAME_CONFIG.topPlate?.enabled) {
		GAME_CONFIG.topPlate.radius = GAME_CONFIG.topPlate.radius || Math.round(width * 0.6);
	}

	// create and add bounds (createBounds now returns an array)
	let currentBounds = createBounds();
	addBoundsToWorld(currentBounds, world);
	// pegs preset path from config
	try {
		const pegsPath = (GAME_CONFIG.presets && GAME_CONFIG.presets.pegs) || 'pegs-presets/pegs3.json';
		loadPegs(pegsPath, world);
	} catch (_) {
		loadPegs('pegs-presets/pegs3.json', world);
	}

	// --- 5. プリセットの読み込みと適用（オブジェクト全般・拡張可能） ---
	const windmillConfig = GAME_CONFIG.objects.windmill;
	const { xOffset: globalXOffset, yOffset: globalYOffset } = (typeof getOffsets === 'function') ? getOffsets() : { xOffset: 0, yOffset: 0 };

	// rotators 配列に { body, mode, anglePerSecond?, pivot, program? } を保持し、afterUpdate で回す
	let rotators = [];

	// helper: set compound body to an absolute angle around a pivot
	function setBodyAngleAroundPivot(body, pivot, targetAngleRad) {
		const cur = body.angle || 0;
		let delta = targetAngleRad - cur;
		// wrap small numerical noise
		if (Math.abs(delta) < 1e-6) return;
		Body.rotate(body, delta, pivot);
	}

	// 回転役物（windmill）をプリセットから初期化
	function initRotatorsFromPreset(preset) {
		const items = Array.isArray(preset.rotators) ? preset.rotators : [];
		return items.map(item => {
			if (item.type !== 'windmill') return null;
			const defaults = windmillConfig.defaults || {};
			const bladeColor = item.bladeColor ?? item.render?.fillStyle ?? windmillConfig.bladeColor ?? windmillConfig.render?.fillStyle;
			const centerColor = item.centerColor ?? item.centerFill ?? windmillConfig.centerColor ?? windmillConfig.centerFill;
			const render = Object.assign({}, item.render || {});
			if (item.layer != null && render.layer == null) render.layer = Number(item.layer);
			const blueprint = {
				x: (item.x || 0) + globalXOffset,
				y: (item.y || 0) + globalYOffset,
				render,
				bladeColor,
				centerColor,
				material: item.material,
				centerMaterial: item.centerMaterial,
				shape: Object.assign({ type: 'windmill' }, defaults, item.shape || {})
			};
			const body = createRotatingYakumono(blueprint);
			World.add(world, body);
			// pivot は常に中心円の中心（設計図の x,y）
			const pivot = { x: blueprint.x, y: blueprint.y };
			const zeroAngle = body.angle || 0;
			// 回転制御モードの設定を解釈（item.rotation または item.rotate）
			const rotCfg = item.rotation || item.rotate;
			// 1) シーケンス（角度->待機->角度…）優先
			if (rotCfg && Array.isArray(rotCfg.sequence || rotCfg.keyframes || rotCfg.waypoints)) {
				const seqIn = (rotCfg.sequence || rotCfg.keyframes || rotCfg.waypoints);
				const defMove = Number(rotCfg.moveMs) || 600;
				const defHold = Number(rotCfg.holdMs);
				const steps = seqIn.map(s => {
					if (typeof s === 'number') {
						return { angleDeg: s, moveMs: defMove, holdMs: Number.isFinite(defHold) ? defHold : 300 };
					}
					const angleDeg = Number(s.angleDeg ?? s.deg ?? s.angle ?? s.a ?? 0);
					const moveMs = Number(s.moveMs ?? defMove);
					const holdMs = Number.isFinite(s.holdMs) ? Number(s.holdMs) : (Number.isFinite(defHold) ? defHold : 300);
					return { angleDeg, moveMs, holdMs };
				}).map(s => ({ angleRad: s.angleDeg * Math.PI / 180, moveMs: Math.max(0, s.moveMs || 0), holdMs: Math.max(0, s.holdMs || 0) }));
				if (!steps.length) return null;
				const loop = rotCfg.loop !== false; // 既定: ループ
				const offsetMs = Math.max(0, Number(rotCfg.offsetMs || 0));
				const totalCycleMs = steps.reduce((acc, st) => acc + st.holdMs + st.moveMs, 0) || 1;
				const program = {
					type: 'seq',
					steps,
					loop,
					totalCycleMs,
					curIndex: 0,
					phase: 'hold', // 'hold' | 'move'
					phaseElapsed: 0,
					completed: false
				};
				// 初期角
				setBodyAngleAroundPivot(body, pivot, zeroAngle + steps[0].angleRad);
				// オフセットがあれば消化
				if (offsetMs) {
					let remain = loop ? (offsetMs % totalCycleMs) : Math.min(offsetMs, totalCycleMs);
					while (remain > 0 && !(program.completed && !loop)) {
						const st = steps[program.curIndex];
						if (program.phase === 'hold') {
							const use = Math.min(remain, st.holdMs - program.phaseElapsed);
							program.phaseElapsed += use;
							remain -= use;
							if (program.phaseElapsed >= st.holdMs) { program.phase = 'move'; program.phaseElapsed = 0; }
						} else {
							const use = Math.min(remain, st.moveMs - program.phaseElapsed);
							program.phaseElapsed += use;
							remain -= use;
							const nextIndex = (program.curIndex + 1) % steps.length;
							const a0 = steps[program.curIndex].angleRad;
							const a1 = steps[nextIndex].angleRad;
							const t = st.moveMs ? (program.phaseElapsed / st.moveMs) : 1;
							const ang = a0 + (a1 - a0) * Math.min(1, t);
							setBodyAngleAroundPivot(body, pivot, zeroAngle + ang);
							if (program.phaseElapsed >= st.moveMs) { program.curIndex = nextIndex; program.phase = 'hold'; program.phaseElapsed = 0; }
						}
						if (!loop && program.curIndex === steps.length - 1 && program.phase === 'hold' && program.phaseElapsed >= steps[program.curIndex].holdMs) {
							program.completed = true;
							break;
						}
					}
				}
				return { body, mode: 'program', program, pivot, zeroAngle };
			}
			// 2) 開始/終了角のレンジ指定（従来のプログラム回転）
			if (rotCfg && (Number.isFinite(rotCfg.durationMs || rotCfg.duration))) {
				const startDeg = Number(rotCfg.startDeg ?? rotCfg.fromDeg ?? rotCfg.startAngleDeg ?? rotCfg.from) || 0;
				const endDeg = Number(rotCfg.endDeg ?? rotCfg.toDeg ?? rotCfg.endAngleDeg ?? rotCfg.to);
				const hasEnd = Number.isFinite(endDeg);
				const durationMs = Number(rotCfg.durationMs ?? rotCfg.duration) || 1000;
				const loop = rotCfg.loop !== false; // 既定: ループする
				const yoyo = rotCfg.yoyo === true;  // 既定: しない
				const offsetMs = Number(rotCfg.offsetMs || 0) % durationMs;
				if (hasEnd) {
					const startRad = startDeg * Math.PI / 180;
					const endRad = endDeg * Math.PI / 180;
					const program = { type: 'range', startRad, endRad, durationMs, loop, yoyo, elapsedMs: offsetMs };
					// 初期角へ設定
					setBodyAngleAroundPivot(body, pivot, zeroAngle + startRad);
					return { body, mode: 'program', program, pivot, zeroAngle };
				}
			}
			// 既定: 従来の等速回転
			const rps = Number(item.rps ?? windmillConfig.rotationsPerSecond);
			const anglePerSecond = rps * 2 * Math.PI * (item.direction === -1 ? -1 : 1);
			return { body, mode: 'constant', anglePerSecond, pivot, zeroAngle };
		}).filter(Boolean);
	}

	// 任意長方形（rectangles）をプリセットから初期化
	function initRectanglesFromPreset(preset) {
		const rects = Array.isArray(preset.rectangles) ? preset.rectangles : [];
		if (!rects.length) return;
		const bodies = rects.map(r => createRectangle(Object.assign({}, r, {
			x: (r.x || 0) + globalXOffset,
			y: (r.y || 0) + globalYOffset
		}))).filter(Boolean);
		if (bodies.length) World.add(world, bodies);
	}

	// 装飾用（物理干渉なし）長方形をプリセットから初期化
	function initDecorRectanglesFromPreset(preset) {
		const items = Array.isArray(preset.decorRectangles) ? preset.decorRectangles : [];
		if (!items.length) return;
		const bodies = items.map(r => createDecorRectangle(Object.assign({}, r, {
			x: (r.x || 0) + globalXOffset,
			y: (r.y || 0) + globalYOffset
		}))).filter(Boolean);
		if (bodies.length) World.add(world, bodies);
	}

	// 任意多角形（polygons）
	function initPolygonsFromPreset(preset) {
		const items = Array.isArray(preset.polygons) ? preset.polygons : [];
		const defMode = (preset.polygonsDefaults?.coordMode) || (preset.defaults?.polygons?.coordMode) || (preset.defaults?.polygon?.coordMode);
		if (!items.length) return;
		const bodies = items.map(p => {
			const coordMode = (p.coordMode || p.pointsMode || (p.useWorldPoints ? 'world' : undefined) || defMode || 'local');
			if (String(coordMode).toLowerCase() === 'world') {
				// world座標指定: points にオフセットを適用
				const pts = Array.isArray(p.points) ? p.points.map(pt => ({ x: (pt.x || 0) + globalXOffset, y: (pt.y || 0) + globalYOffset })) : p.points;
				return createPolygon(Object.assign({}, p, { points: pts }));
			}
			// local座標指定: x,y にオフセット
			return createPolygon(Object.assign({}, p, {
				x: (p.x || 0) + globalXOffset,
				y: (p.y || 0) + globalYOffset,
				coordMode: coordMode
			}));
		}).filter(Boolean);
		if (bodies.length) World.add(world, bodies);
	}

	// 装飾用多角形（非干渉）
	function initDecorPolygonsFromPreset(preset) {
		const items = Array.isArray(preset.decorPolygons) ? preset.decorPolygons : [];
		const defMode = (preset.decorPolygonsDefaults?.coordMode) || (preset.defaults?.decorPolygons?.coordMode) || (preset.defaults?.decorPolygon?.coordMode);
		if (!items.length) return;
		const bodies = items.map(p => {
			const coordMode = (p.coordMode || p.pointsMode || (p.useWorldPoints ? 'world' : undefined) || defMode || 'local');
			if (String(coordMode).toLowerCase() === 'world') {
				const pts = Array.isArray(p.points) ? p.points.map(pt => ({ x: (pt.x || 0) + globalXOffset, y: (pt.y || 0) + globalYOffset })) : p.points;
				return createDecorPolygon(Object.assign({}, p, { points: pts }));
			}
			return createDecorPolygon(Object.assign({}, p, {
				x: (p.x || 0) + globalXOffset,
				y: (p.y || 0) + globalYOffset,
				coordMode: coordMode
			}));
		}).filter(Boolean);
		if (bodies.length) World.add(world, bodies);
	}
	// プリセット適用ハンドラ（拡張しやすい登録方式）
	function applyPresetWindmills(preset) {
		rotators = initRotatorsFromPreset(preset);
	}
	function applyPresetRectangles(preset) {
		initRectanglesFromPreset(preset);
	}
	function applyPresetDecorRectangles(preset) {
		initDecorRectanglesFromPreset(preset);
	}
	const presetApplicators = [
		applyPresetWindmills,
		applyPresetRectangles,
		applyPresetDecorRectangles,
		initPolygonsFromPreset,
		initDecorPolygonsFromPreset,
	];
	function applyPresetObjects(preset) {
		for (const fn of presetApplicators) {
			try { fn(preset); } catch (e) {
				console.warn('Preset applicator failed:', fn && fn.name ? fn.name : '(anonymous)', e);
			}
		}
	}

	(async () => {
		try {
			const objPath = (GAME_CONFIG.presets && GAME_CONFIG.presets.objects) || 'objects-presets/default.json';
			const res = await fetch(objPath);
			if (!res.ok) throw new Error(`Failed to load objects preset: ${res.status} ${res.statusText}`);
			const preset = await res.json();
			// 登録された適用ハンドラを順に実行（種類追加に強い）
			applyPresetObjects(preset);
		} catch (err) {
			console.error('Failed to init objects from preset:', err);
		}
	})();

	// フレーム更新ごとのイベント — 各役物の anglePerFrame を使って回転させる
	// 連射タイマー（物理ループと同期）
	let holdActive = false;
	let holdAccumMs = 0;
	let holdIntervalMsCfg = Number((GAME_CONFIG.launch && GAME_CONFIG.launch.holdIntervalMs) || 300);
	let holdFirstDelayMsCfg = Number((GAME_CONFIG.launch && GAME_CONFIG.launch.holdFirstShotDelayMs) || 0);
	let holdFirstShotPending = false;

	Events.on(engine, 'afterUpdate', () => {
		// engine.timing.delta is ms elapsed for the last tick; fall back to ~16.67ms
		const deltaMsRaw = (engine && engine.timing && engine.timing.delta) ? engine.timing.delta : 16.6667;
		const deltaMs = Math.min(deltaMsRaw, 32); // 休止復帰時のバースト抑制
		const deltaSec = deltaMs / 1000;
		rotators.forEach(rot => {
			if (rot.mode === 'program' && rot.program) {
				const p = rot.program;
				if (p.type === 'seq') {
					if (p.completed && !p.loop) return;
					let remaining = deltaMs;
					while (remaining > 0) {
						const st = p.steps[p.curIndex];
						if (p.phase === 'hold') {
							const need = st.holdMs - p.phaseElapsed;
							const use = Math.min(remaining, Math.max(0, need));
							p.phaseElapsed += use;
							remaining -= use;
							if (p.phaseElapsed >= st.holdMs) { p.phase = 'move'; p.phaseElapsed = 0; }
							else break;
						} else {
							const need = st.moveMs - p.phaseElapsed;
							const use = Math.min(remaining, Math.max(0, need));
							p.phaseElapsed += use;
							remaining -= use;
							const nextIndex = (p.curIndex + 1) % p.steps.length;
							const a0 = p.steps[p.curIndex].angleRad;
							const a1 = p.steps[nextIndex].angleRad;
							const t = st.moveMs ? (p.phaseElapsed / st.moveMs) : 1;
							const ang = a0 + (a1 - a0) * Math.min(1, t);
							setBodyAngleAroundPivot(rot.body, rot.pivot, rot.zeroAngle + ang);
							if (p.phaseElapsed >= st.moveMs) {
								p.curIndex = nextIndex;
								p.phase = 'hold';
								p.phaseElapsed = 0;
								if (!p.loop && p.curIndex === 0) { p.completed = true; break; }
							}
							else break;
						}
					}
				} else {
					if (!p.loop && p.elapsedMs >= p.durationMs) {
						// 非ループ: 終端で固定
						setBodyAngleAroundPivot(rot.body, rot.pivot, rot.zeroAngle + p.endRad);
						return;
					}
					p.elapsedMs += deltaMs;
					let t = p.elapsedMs / p.durationMs;
					if (p.loop) t = t % 1;
					else t = Math.min(1, t);
					if (p.yoyo) {
						// 0->1->0 の往復
						const cycle = t * 2;
						const dir = cycle <= 1 ? cycle : (2 - cycle);
						const angle = p.startRad + (p.endRad - p.startRad) * dir;
						setBodyAngleAroundPivot(rot.body, rot.pivot, rot.zeroAngle + angle);
					} else {
						const angle = p.startRad + (p.endRad - p.startRad) * t;
						setBodyAngleAroundPivot(rot.body, rot.pivot, rot.zeroAngle + angle);
					}
				}
			} else {
				const angle = (rot.anglePerSecond || 0) * deltaSec;
				if (angle) Body.rotate(rot.body, angle, rot.pivot);
			}
		});
		// 物理ループ同期の連射（初回ディレイ対応）
		if (holdActive) {
			holdAccumMs += deltaMs;
			if (holdFirstShotPending) {
				if (holdAccumMs >= holdFirstDelayMsCfg) {
					holdAccumMs = 0;
					holdFirstShotPending = false;
					spawnBallFromUI();
				}
			} else {
				const interval = Math.max(50, holdIntervalMsCfg);
				if (holdAccumMs >= interval) {
					holdAccumMs = 0; // 1発/フレーム上限（バースト防止）
					spawnBallFromUI();
				}
			}
		}
	});

	// --- 6. イベントリスナーの設定 ---

	// helper: compute spawn start coords based on GAME_CONFIG and offsets
	function computeSpawnCoords() {
		const spawnCfg = (GAME_CONFIG.launch && GAME_CONFIG.launch.spawn) || {};
		const { xOffset: sxOff, yOffset: syOff } = (typeof getOffsets === 'function') ? getOffsets() : { xOffset: 0, yOffset: 0 };
		const startX = (typeof spawnCfg.x === 'number') ? (spawnCfg.x + sxOff) : (40 + sxOff);
		const startY = (typeof spawnCfg.y === 'number') ? (spawnCfg.y + syOff) : (height - (spawnCfg.yOffsetFromBottom || 40) + syOff);
		return { x: startX, y: startY };
	}

	// DOM発射台は廃止（キャンバス側で描画）: 残っていれば非表示
	const legacyPad = document.getElementById('launch-pad');
	if (legacyPad) legacyPad.style.display = 'none';

	// キャンバス側の発射台ボディを生成して追加
	const padCfg0 = (GAME_CONFIG.launch && GAME_CONFIG.launch.pad) || {};
	const launchPadBody = createLaunchPadBody({
		width: padCfg0.width || 64,
		height: padCfg0.height || 14,
		color: padCfg0.background || '#444',
		borderColor: padCfg0.borderColor || '#fff',
		layer: Number(padCfg0.layer ?? 1)
	});
	World.add(world, launchPadBody);

	function applyPadConfig() {
		const padCfg = (GAME_CONFIG.launch && GAME_CONFIG.launch.pad) || {};
		// サイズ・見た目はボディ生成時のまま。必要なら再生成やスケール対応を追加可能。
		// レイヤー変更のみ反映
		const layer = Number(padCfg.layer ?? 1);
		launchPadBody.render.layer = Number.isFinite(layer) ? layer : 1;
	}

	function updateLaunchPadPosition() {
		const p = computeSpawnCoords();
		const padCfg = (GAME_CONFIG.launch && GAME_CONFIG.launch.pad) || {};
		const padW = Number(padCfg.width || 64);
		const padH = Number(padCfg.height || 14);
		const longIsWidth = padW >= padH;
		const originX = longIsWidth ? 0 : (padW / 2);
		const originY = longIsWidth ? (padH / 2) : 0;
		const angleDeg = Number((document.getElementById('angle-slider') || { value: GAME_CONFIG.launch?.defaultAngle || 90 }).value);
		const offsetY = padCfg.offsetY || 0;
		// 近端中心を原点にする: launch point からのオフセットを回転座標に沿って適用
		Matter.Body.setPosition(launchPadBody, { x: p.x - originX, y: p.y - originY });
		Matter.Body.setAngle(launchPadBody, (90 - angleDeg) * Math.PI / 180);
		// 追加のYオフセットを回転座標系で反映（ここでは近端からの+Yオフセットを前提）
		if (offsetY) {
			const a = (90 - angleDeg) * Math.PI / 180;
			const dx = 0 * Math.cos(a) - offsetY * Math.sin(a);
			const dy = 0 * Math.sin(a) + offsetY * Math.cos(a);
			Matter.Body.setPosition(launchPadBody, { x: p.x - originX + dx, y: p.y - originY + dy });
		}
	}

	// apply initial pad config and position
	applyPadConfig();
	updateLaunchPadPosition();

	// update when window resizes or when topPlate recreated
	window.addEventListener('resize', updateLaunchPadPosition);

	// UI 要素を取得

	const angleSlider = document.getElementById('angle-slider');
	const speedSlider = document.getElementById('speed-slider');
	const angleVal = document.getElementById('angle-val');
	const speedVal = document.getElementById('speed-val');

	// angle slider configuration from config.js
	if (GAME_CONFIG.launch) {
		// angle UI は無い可能性があるため速度のみ設定
		// speed slider: 0..100 を 0.01 刻みに
		speedSlider.min = 0;
		speedSlider.max = 100;
		speedSlider.step = 0.01;
	}

	// 天板UIは削除

	// UI 表示更新
	const launchArrow = document.getElementById('launch-arrow');
	const speedActual = document.createElement('span');
	speedActual.id = 'speed-actual';
	// 数値が詰まり過ぎて視認性が落ちるのを防ぐ
	speedActual.style.marginLeft = '6px';
	// スピードスライダー初期値は 0 に固定
	speedSlider.value = 0;

	// 連射モード用の視認性・操作性向上スタイルを注入
	function injectHoldUiStyles() {
		if (document.getElementById('hold-fire-style')) return;
		const style = document.createElement('style');
		style.id = 'hold-fire-style';
		style.textContent = `
			#speed-slider.hold-ui{ width:80%; max-width:360px; height:40px; margin:10px 0; }
			#speed-slider.hold-ui::-webkit-slider-runnable-track{ height:14px; border-radius:10px; background:linear-gradient(90deg,#6c6c6c,#3a3a3a); }
			#speed-slider.hold-ui::-webkit-slider-thumb{ -webkit-appearance:none; width:26px; height:26px; margin-top:-6px; border-radius:50%; background:#ff9800; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.4); }
			#speed-slider.hold-ui.active::-webkit-slider-thumb{ background:#ffc107; transform:scale(1.08); }
			#speed-slider.hold-ui::-moz-range-track{ height:14px; border-radius:10px; background:linear-gradient(90deg,#6c6c6c,#3a3a3a); }
			#speed-slider.hold-ui::-moz-range-thumb{ width:26px; height:26px; border-radius:50%; background:#ff9800; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.4); }
			#speed-slider.hold-ui.active::-moz-range-thumb{ background:#ffc107; }
			#speed-val.hold-ui{ font-size:1.2em; font-weight:600; margin-left:6px; }
		`;
		document.head.appendChild(style);
	}
	// attach after speedVal for visibility (we'll update textContent each frame)
	function updateArrow() {
		const launchArrow = document.getElementById('launch-arrow');
		if (!launchArrow) return; // arrow removed via CSS/HTML — no-op
		const angle = Number(angleSlider?.value ?? GAME_CONFIG.launch?.defaultAngle ?? 90);
		const sliderValue = Number(speedSlider.value);
		// map slider 0..100 -> px/s using config min/max and speedScale
		const { minSpeed = 5, maxSpeed = 400, speedScale = 1 } = GAME_CONFIG.launch || {};
		const speed = (minSpeed + (sliderValue / 100) * (maxSpeed - minSpeed)) * speedScale;
		const decimals = Number.isFinite(GAME_CONFIG.launch?.speedPrecision)
			? Math.max(0, Math.min(3, Number(GAME_CONFIG.launch.speedPrecision)))
			: 1;
		speedActual.textContent = ` (${speed.toFixed(decimals)} px/s)`;
		if (angleVal) angleVal.textContent = angle.toFixed(1);
		speedVal.textContent = sliderValue.toFixed(2);
		// position arrow near bottom-left of container (use container-relative coords)
		const rect = container.getBoundingClientRect();
		launchArrow.style.left = '24px';
		launchArrow.style.top = (rect.height - 80) + 'px';
		launchArrow.style.transform = `rotate(${-angle}deg)`; // negative because CSS y-axis
	}
	if (angleSlider) angleSlider.addEventListener('input', () => { updateArrow(); updateLaunchPadPosition(); });
	speedSlider.addEventListener('input', updateArrow);

	// 天板UIは削除（設定変更ハンドラ無し）

	// 汎用的なUI値更新ヘルパー
	function createSliderUpdater(slider, display, callback) {
		return () => {
			if (display) display.textContent = slider.value;
			if (callback) callback();
		};
	}

	// 天板UIは削除（イベント配線無し）
	// insert speedActual after speedVal in DOM
	const sliderInfo = document.querySelector('.slider-info');
	if (sliderInfo) {
		// 強さラベルの隣に速度表記を配置（中央揃えコンテナ内）
		const labelInInfo = sliderInfo.querySelector('label');
		if (labelInInfo) labelInInfo.appendChild(speedActual);
	}
	// 初期ラベル表示
	updateArrow();
	updateLaunchPadPosition();

	// 共通: 現在のUI値から1発スポーン
	function spawnBallFromUI() {
		const start = computeSpawnCoords();
		const angleDeg = Number((angleSlider && angleSlider.value) || GAME_CONFIG.launch?.defaultAngle || 90);
		const sliderValue = Number(speedSlider.value || 0);
		const { minSpeed = 5, maxSpeed = 400, speedScale = 1 } = GAME_CONFIG.launch || {};
		const baseSpeed = minSpeed + (sliderValue / 100) * (maxSpeed - minSpeed);
		const speedPxPerSec = baseSpeed * speedScale;
		const angleRad = angleDeg * Math.PI / 180;
		const velocity = { x: Math.cos(angleRad) * speedPxPerSec, y: -Math.sin(angleRad) * speedPxPerSec };
		const ball = createBall(start.x, start.y);
		World.add(world, ball);
		Body.setVelocity(ball, velocity);
	}

	// dev tools hook: spawn ball
	window.addEventListener('devtools:spawnBall', () => {
		try { spawnBallFromUI(); } catch (_) { /* no-op */ }
	});

	// 従来のボタン発射は維持
	// 追加ボタンは廃止（連射のみ）

	// スライダー長押し連射モード（設定で有効化時のみ）
	(function wireHoldToFire() {
		const launchCfg = GAME_CONFIG.launch || {};
		if (!launchCfg.holdToFireEnabled) return;
		injectHoldUiStyles();
		speedSlider.classList.add('hold-ui');
		speedVal.classList.add('hold-ui');
		holdIntervalMsCfg = Number(launchCfg.holdIntervalMs) || holdIntervalMsCfg;
		holdFirstDelayMsCfg = Number(launchCfg.holdFirstShotDelayMs) || 0;
		function startHold() {
			if (holdActive) return;
			holdActive = true;
			holdAccumMs = 0;
			holdFirstShotPending = true; // 初回はディレイ適用（0なら即時相当）
			speedSlider.classList.add('active');
		}
		function stopHold() {
			if (!holdActive) return;
			holdActive = false;
			holdAccumMs = 0;
			holdFirstShotPending = false;
			// 離したら強さを0へ
			speedSlider.value = 0;
			updateArrow();
			speedSlider.classList.remove('active');
		}
		speedSlider.addEventListener('pointerdown', startHold);
		window.addEventListener('pointerup', stopHold);
		window.addEventListener('pointercancel', stopHold);
		window.addEventListener('blur', stopHold);
	})();

	// 衝突開始イベント
	Events.on(engine, 'collisionStart', (event) => {
		const pairs = event.pairs;
		for (const pair of pairs) {
			const { bodyA, bodyB } = pair;

			// 材質に基づいた物理係数の動的適用
			if (bodyA.material && bodyB.material) {
				const interaction = getMaterialInteraction(bodyA.material, bodyB.material);
				pair.restitution = interaction.restitution;
				pair.friction = interaction.friction;
			}

			// 床とボールの衝突判定
			const ballLabel = GAME_CONFIG.objects.ball.label;
			const floorLabel = GAME_CONFIG.objects.floor.label;
			if (bodyA.label === ballLabel && bodyB.label === floorLabel) {
				World.remove(world, bodyA);
			} else if (bodyB.label === ballLabel && bodyA.label === floorLabel) {
				World.remove(world, bodyB);
			}
		}
	});


});