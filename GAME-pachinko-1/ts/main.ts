/**
 * Pachinko main loop and orchestration
 *
 * 役割（何をするファイルか）：
 * - Matter.js エンジン/レンダラの初期化と起動
 * - ワールド生成（境界・釘・各オブジェクトの配置）
 * - UI（強さスライダー）と発射ロジック（連射含む）
 * - 回転ギミック（風車など）の駆動スケジューラ
 * - 物理イベント（衝突）の軽いハンドリング
 *
 * 読み方（セクション目次）：
 *  1) Engine/Render の初期化（ブートストラップ）
 *  2) ワールドセットアップ（境界・釘・プリセットの読み込み）
 *  3) 回転ギミックの初期化（プリセット→プログラム駆動 or 等速回転）
 *  4) LaunchPad（発射台）の生成と座標更新
 *  5) UI（スライダー表示と数値ラベルの反映）
 *  6) 発射ロジック（単発/連射）
 *  7) イベントループ（afterUpdateでの駆動）と衝突処理
 */

import Matter from "matter-js";
import { GAME_CONFIG, getMaterialInteraction } from "../ts/config";
/** @type {any} */
const __GAME_CONFIG__any = GAME_CONFIG;
// --- Lightweight ambient helpers to reduce tsserver noise ---
// Declare common functions/vars that are defined elsewhere at runtime so editor doesn't complain
/** @type {any} */
var initParticlePool;
/** @type {any} */
var updateParticles;
// safe alias placeholder if needed
/** @type {any} */
var __RenderAny = /** @type {any} */ (typeof Matter !== 'undefined' && Matter.Render ? Matter.Render : {});
import { addBoundsToWorld, createBall, createBounds, createDecorPolygon, createDecorRectangle, createLaunchPadBody, createParticleBurst, createPolygon, createRectangle, createRotatingYakumono, createSensorCounter, createSensorCounterPolygon, getOffsets, loadPegs } from "../ts/objects";

// Guard to prevent double initialization
let __pachi_initialized = false;

function pachiInit() {
	if (__pachi_initialized) return;
	__pachi_initialized = true;
	// original DOMContentLoaded callback body follows
	// Matter.jsの主要モジュールを取得
	const { Engine, Render, Runner, World, Events, Body, Constraint } = Matter;

	// -------------------------
	// 小さなユーティリティ群（リファクタリング用）
	// -------------------------
	/** 安全に関数を実行するヘルパー（例外を無視） */
	function safeCall(fn) { try { return fn(); } catch (_) { /* no-op */ } }

	/** clamp helper */
	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

	/** map range helper: t in [0,1] -> [a,b] */
	function mapRange(t, a, b) { return a + (b - a) * t; }

	/** スライダー値(0..100)から速度(px/s)を算出する共通関数 */
	function computeSpeedFromSlider(sliderValue) {
		const { minSpeed = 5, maxSpeed = 400, speedScale = 1 } = GAME_CONFIG.launch || {};
		const v = clamp(Number(sliderValue || 0), 0, 100) / 100;
		return (minSpeed + v * (maxSpeed - minSpeed)) * speedScale;
	}

	/** パーティクル色選定を共通化するヘルパー
	 * cfg may have .mode/.particleMode and .color/.particleColor
	 */
	function pickParticleColor(cfg, ballBody) {
		try {
			if (!cfg) return undefined;
			const mode = cfg.mode || cfg.particleMode;
			if (mode === 'custom') return cfg.color || cfg.particleColor || undefined;
			if (mode === 'ball') return (ballBody && ballBody.render && ballBody.render.fillStyle) ? ballBody.render.fillStyle : undefined;
		} catch (_) { /* no-op */ }
		return undefined;
	}


	// If this sensor is configured to trigger the embedded slot, start it
	try {
		// prefer a window-scoped counterId if present; avoid referencing a possibly-undefined local symbol
		const runtimeCounterId = (typeof window !== 'undefined' && (window as any).counterId) || null;
		if (runtimeCounterId) {
			const cfgEntry2 = GAME_CONFIG.sensorCounters.counters[runtimeCounterId] || {};
			if (cfgEntry2.slotTrigger && window.EmbeddedSlot && typeof window.EmbeddedSlot.startSpin === 'function') {
				try { window.EmbeddedSlot.startSpin(); } catch (_) { /* no-op */ }
			}
		}
	} catch (_) { /* no-op */ }

	// Ensure embedded slot is visible and initialized (if adapter is present)
	try {
		// prefer dynamic import/style: adapter exports ensureEmbeddedSlotVisible
		if (typeof (window as any).EmbeddedSlot === 'undefined') {
			// adapter module may be loaded as module script; attempt to call exported helper if available on window
			// fallback: call window.EmbeddedSlot.init via adapter's global if present
			if (typeof (window as any).ensureEmbeddedSlotVisible === 'function') {
				try { (window as any).ensureEmbeddedSlotVisible(); } catch (_) { /* no-op */ }
			}
		} else {
			try { (window as any).EmbeddedSlot.init({ show: false }); } catch (_) { /* no-op */ }
		}
	} catch (_) { /* no-op */ }
	// ========================
	// 1. エンジンの初期化（低レベル設定）
	// ========================
	const engine = Engine.create();
	// 物理エンジンの反復回数を設定から反映
	engine.positionIterations = Number(GAME_CONFIG.physics?.positionIterations ?? 12);
	engine.velocityIterations = Number(GAME_CONFIG.physics?.velocityIterations ?? 8);
	engine.constraintIterations = Number(GAME_CONFIG.physics?.constraintIterations ?? 6);
	// 動きの停止した物体をスリープさせ、計算負荷を軽減
	engine.enableSleeping = true;
	// スリープ閾値を少し下げて微小振動を抑止し、負荷を軽減
	// engine.timing may have custom properties; cast to any to avoid tsserver property errors
	try { (engine.timing as any).isFixed = true; } catch (_) { /** no-op */ }
	engine.positionIterations = Number(GAME_CONFIG.physics?.positionIterations ?? 12);
	engine.velocityIterations = Number(GAME_CONFIG.physics?.velocityIterations ?? 8);
	engine.constraintIterations = Number(GAME_CONFIG.physics?.constraintIterations ?? 6);
	engine.world.gravity.y = Number(GAME_CONFIG.physics?.gravityY ?? engine.world.gravity.y);
	const world = engine.world;

	// パーティクルプールを初期化（objects.jsで定義）
	if (typeof initParticlePool === 'function') {
		initParticlePool(world);
	}

	// ========================
	// 2. レンダラーの作成（DOM要素・基本オプション）
	// ========================
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
	// --- 初期レイアウト厳密化: CSSを強制指定 ---
	container.style.position = 'relative';
	container.style.width = width + 'px';
	container.style.height = height + 'px';
	container.style.maxWidth = '100vw';
	container.style.maxHeight = '100vh';
	container.style.margin = '0 auto';
	container.style.boxSizing = 'border-box';
	container.style.overflow = 'hidden';
	// 初期レイアウトが安定するまで視覚的に隠しておく（モバイルで左上に集まる現象対策）
	try { container.style.visibility = 'hidden'; } catch (_) { /* no-op */ }

	// cast options/pixelRatio to any to satisfy TS types (pixelRatio may be 'auto' at runtime)
	const render = Render.create({ element: container, engine, options: { width, height, pixelRatio: 'auto' as any, ...renderOptions, showSleeping: false } });
	// --- canvasサイズをcontainerに即時合わせる ---
	try {
		const c = render && render.canvas;
		if (c) {
			c.style.width = width + 'px';
			c.style.height = height + 'px';
			c.width = width;
			c.height = height;
		}
	} catch (_) { /* no-op */ }

	// レイアウトが確定するまで描画を開始しないためのフラグ
	let sizedReady = false;
	let readyCandidateTs = 0;
	const minReadyDelayMs = 600; // 少し長めに待ってから初回描画（左上寄りのチラつき対策）
	const stableWindowMs = 250; // この時間連続でコンテナサイズが安定したらOK
	const maxInitWaitMs = 4000; // 最長待機（安全弁）
	const initStartTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
	let layoutStableSince = 0;
	let lastCw = 0, lastCh = 0;
	let fontsReady = false;

	// ロード用オーバーレイを表示/非表示
	let loadingOverlay: HTMLElement | null = null;
	function showLoadingOverlay() {
		try {
			if (loadingOverlay) return;
			const ov = document.createElement('div');
			ov.id = 'pachi-loading-overlay';
			ov.setAttribute('aria-busy', 'true');
			ov.style.position = 'absolute';
			ov.style.inset = '0';
			ov.style.display = 'flex';
			ov.style.alignItems = 'center';
			ov.style.justifyContent = 'center';
			ov.style.background = 'rgba(0,0,0,0.25)';
			ov.style.color = '#fff';
			ov.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
			ov.style.fontSize = '14px';
			ov.style.letterSpacing = '0.02em';
			ov.style.backdropFilter = 'blur(1px)';
			ov.style.transition = 'opacity 180ms ease';
			ov.style.zIndex = '10';
			ov.innerHTML = `
				<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
					<div style="width:22px;height:22px;border-radius:50%;border:3px solid rgba(255,255,255,0.5);border-top-color:#fff;animation:pachi-spin 0.9s linear infinite"></div>
					<div>読み込み中…</div>
				</div>
			`;
			// スピナーの keyframes を一時的に追加
			try {
				const style = document.createElement('style');
				style.textContent = '@keyframes pachi-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
				ov.appendChild(style);
			} catch (__) { /* no-op */ }
			container.appendChild(ov);
			loadingOverlay = ov;
		} catch (_) { /* no-op */ }
	}
	function hideLoadingOverlay() {
		try {
			if (!loadingOverlay) return;
			loadingOverlay.style.opacity = '0';
			const toRemove = loadingOverlay;
			loadingOverlay = null;
			setTimeout(() => { try { toRemove.remove(); } catch (_) { /* no-op */ } }, 200);
		} catch (_) { /* no-op */ }
	}

	// フォント読み込みの完了も待機条件に加える
	try {
		if (document && (document as any).fonts && typeof (document as any).fonts.ready !== 'undefined') {
			(document as any).fonts.ready.then(() => { fontsReady = true; }).catch(() => { fontsReady = true; });
		} else {
			fontsReady = true;
		}
	} catch (_) { fontsReady = true; }

	// 初期はオーバーレイを表示しておく
	showLoadingOverlay();

	// Stability counters: require several consecutive stable frames in addition to a time window
	let stableFrameCount = 0;
	const stableFramesRequired = 4; // require N consecutive frames of stable size

	// Require full window load for extra safety on initial layout (fonts/images/styles)
	let windowLoaded = (typeof document !== 'undefined' && document.readyState === 'complete');
	try {
		if (typeof window !== 'undefined' && window.addEventListener) {
			window.addEventListener('load', () => { windowLoaded = true; });
		}
	} catch (_) { /* no-op */ }

	// Wait for stylesheets to finish loading (protect against late-inserted or slow CSS)
	let stylesLoaded = false;
	try {
		const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
		if (!links.length) {
			stylesLoaded = true;
		} else {
			let remaining = links.length;
			const markLoaded = () => { remaining--; if (remaining <= 0) stylesLoaded = true; };
			const timer = setTimeout(() => { stylesLoaded = true; try { (window as any).__pachi_stylesheetTimeout = true; } catch (_) { } }, 3000);
			for (const l of links) {
				try {
					if ((l as any).sheet) { markLoaded(); continue; }
					if (l.sheet) { markLoaded(); continue; }
					l.addEventListener('load', () => { try { markLoaded(); } catch (_) { } });
					l.addEventListener('error', () => { try { markLoaded(); } catch (_) { } });
				} catch (_) { markLoaded(); }
			}
			// when done, clear timer
			const poll = setInterval(() => { if (stylesLoaded) { clearInterval(poll); clearTimeout(timer); try { (window as any).__pachi_stylesLoaded = true; } catch (_) { } } }, 50);
		}
	} catch (_) { stylesLoaded = true; }

	// Observe DOM mutations that may affect layout; reset stability counters when changes occur
	let layoutObserver: MutationObserver | null = null;
	try {
		if (typeof MutationObserver !== 'undefined' && document && document.body) {
			layoutObserver = new MutationObserver(() => {
				// reset so ensureCanvasSized will wait for a stable period again
				layoutStableSince = 0;
				stableFrameCount = 0;
			});
			layoutObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
		}
	} catch (_) { layoutObserver = null; }

	// Ensure canvas internal pixel size matches container (fixes mobile sizing/raster issues)
	function ensureCanvasSized() {
		try {
			const c = render && render.canvas;
			if (!c) return;
			const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? (window.devicePixelRatio || 1) : 1;
			// CSS size: let the canvas fill the container element
			const rect = container.getBoundingClientRect();
			const cw = Math.max(0, Math.round(container.clientWidth || rect.width || 0));
			const ch = Math.max(0, Math.round(container.clientHeight || rect.height || 0));
			if (cw <= 0 || ch <= 0) return;
			// set CSS pixel size to container dimensions (avoid relative % rounding issues)
			c.style.width = String(cw) + 'px';
			c.style.height = String(ch) + 'px';
			// Important: the renderer was created with logical dimensions `width`/`height` (GAME_CONFIG.dimensions).
			// The canvas backing buffer must match those logical dimensions multiplied by devicePixelRatio
			// so Matter.js maps world coordinates correctly to pixels. Use logical width/height here,
			// and compute the scale that maps logical->backing pixels for the context transform.
			const logicalW = Number(width || 0) || 0;
			const logicalH = Number(height || 0) || 0;
			if (logicalW <= 0 || logicalH <= 0) return;
			const pw = Math.round(logicalW * dpr);
			const ph = Math.round(logicalH * dpr);
			if (c.width !== pw || c.height !== ph) {
				// ensure render.options.pixelRatio matches device pixel ratio to keep coordinate mapping correct
				try { if (render && render.options) render.options.pixelRatio = dpr; } catch (_) { }
				// set backing buffer to logical size * dpr
				c.width = pw;
				c.height = ph;
				// update context transform to map logical coordinates -> backing buffer pixels
				try {
					const ctx = c.getContext('2d');
					if (ctx && typeof ctx.setTransform === 'function') {
						const scaleX = pw / logicalW;
						const scaleY = ph / logicalH;
						ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
					}
				} catch (_) { /* no-op */ }
				// also update render.canvas dimensions if present
				try { if (render && render.canvas) { render.canvas.width = pw; render.canvas.height = ph; render.canvas.style.width = String(cw) + 'px'; render.canvas.style.height = String(ch) + 'px'; } } catch (_) { }
				console.debug('[PACHINKO] ensureCanvasSized ->', { cw, ch, dpr, logicalW, logicalH, pw, ph, renderOptions: (render && render.options) ? Object.assign({}, render.options) : null });
			}

			// サイズの安定判定：一定時間連続で変化しないこと
			const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
			const sizeChanged = (Math.abs(cw - lastCw) > 0.5) || (Math.abs(ch - lastCh) > 0.5);
			if (sizeChanged) {
				// size changed -> reset stability counters and record new baseline
				layoutStableSince = now;
				lastCw = cw; lastCh = ch;
				stableFrameCount = 0;
			} else {
				// size unchanged this frame -> increment consecutive stable frames
				if (!layoutStableSince) layoutStableSince = now;
				stableFrameCount = Math.min(stableFramesRequired, stableFrameCount + 1);
			}
			const stableOk = layoutStableSince && (now - layoutStableSince >= stableWindowMs) && (stableFrameCount >= stableFramesRequired);

			// 全条件が整ったら最小待機を消化してから描画許可
			const readyNow = (cw > 0 && ch > 0 && c.width > 0 && c.height > 0) && !!stableOk && !!fontsReady && !!windowLoaded && !!stylesLoaded;
			const timedOut = (now - initStartTs) >= maxInitWaitMs; // 安全弁
			if (readyNow || timedOut) {
				if (!readyCandidateTs) readyCandidateTs = now;
				if ((now - readyCandidateTs >= minReadyDelayMs) || timedOut) {
					sizedReady = true;
					// expose for debugging
					try { (window as any).__pachi_sizedReady = true; } catch (_) { }
					try { container.style.visibility = ''; } catch (_) { }
					hideLoadingOverlay();
					// stop observing DOM mutations once ready
					try { if (layoutObserver) { layoutObserver.disconnect(); layoutObserver = null; } } catch (_) { }
					// force a couple of render passes to ensure the context transform and rendering are stable
					try {
						Render.world(render);
						setTimeout(() => { try { Render.world(render); } catch (_) { } }, 50);
						setTimeout(() => { try { Render.world(render); } catch (_) { } }, 120);
					} catch (_) { }
				}
			}
		} catch (e) { console.warn('[PACHINKO] ensureCanvasSized error', e); }
	}

	// dev-tools へ Engine/Render を通知（UI 拡張で利用）
	try {
		// 開発者ツール向けに参照を公開し、イベントも通知
		 (window as any).__engine_for_devtools__ = engine;
		 (window as any).__render_for_devtools__ = render;
		window.dispatchEvent(new CustomEvent('devtools:engine-ready', { detail: { engine, render } }));
	} catch (_) { /* no-op */ }

	// ページ側の背景色（ゲーム外）を設定
	try {
		if (GAME_CONFIG.ui && GAME_CONFIG.ui.outerBackground) {
			document.body.style.backgroundColor = GAME_CONFIG.ui.outerBackground;
		}
	} catch (_) { /* no-op */ }

	// レンダリング順序を render.layer で制御（小→大の順）
	// - 同一 layer では id 昇順にしてデターミニズムを担保
	(function injectLayeredRendering() {
		const getLayer = (b) => {
			const v = b && b.render && typeof b.render.layer === 'number' ? b.render.layer : (b && b.render && b.render.layer != null ? Number(b.render.layer) : 1);
			return Number.isFinite(v) ? v : 1;
		};
		// use any-cast on Render to avoid type complaints when adding .bodies override
		const origBodies = (Render as any).bodies;
	 (Render as any).bodies = function (render, bodies, context) {
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

	// ========================
	// 3. 物理演算と描画の開始
	// ========================
	// 注意: 初期レイアウトが未確定のまま Render.run すると、
	// デフォルトの 300x150 で 0,0 に要素が集まる描画が行われる場合がある。
	// 本実装では独自 rAF ループで Render.world を呼ぶため、Render.run は使用しない。
	const runner = Runner.create();

	// --- Adaptive physics/performance manager ---
	(function setupAdaptivePhysics() {
		// device memory hint (Chrome/Edge support)
		// navigator.deviceMemory is a non-standard hint; guard and cast to any
		const deviceMem = (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) ? Number((navigator as any).deviceMemory) : null;
		const lowMemDevice = (deviceMem != null) ? (deviceMem <= 4) : false;
		if (lowMemDevice) {
			// apply conservative defaults for low-memory devices
			try {
				GAME_CONFIG.physics.substeps = Math.max(1, Number(GAME_CONFIG.physics.substeps || 1));
				GAME_CONFIG.physics.fixedFps = Math.max(30, Number(GAME_CONFIG.physics.fixedFps || 60));
				GAME_CONFIG.physics.positionIterations = Math.max(6, Number(GAME_CONFIG.physics.positionIterations || 6));
				GAME_CONFIG.physics.velocityIterations = Math.max(4, Number(GAME_CONFIG.physics.velocityIterations || 4));
				GAME_CONFIG.physics.constraintIterations = Math.max(2, Number(GAME_CONFIG.physics.constraintIterations || 2));
				// prefer low pixel ratio for renderer
				if (render && render.options) render.options.pixelRatio = 1;
			} catch (_) { /* no-op */ }
		}

		// runtime frame-time monitor that gently degrades physics settings under sustained high frame cost
		const samples = [];
		const maxSamples = 60; // サンプル窓: 60フレーム分（およそ1秒）を保持して短期平均を取る
		function pushSample(ms) { samples.push(ms); if (samples.length > maxSamples) samples.shift(); }
		function avgMs() { if (!samples.length) return 0; return samples.reduce((a, b) => a + b, 0) / samples.length; }

		// Expose a lightweight recorder called from the rAF loop
		 (window as any).__recordPhysicsPerf__ = function (frameMs) {
			try {
				pushSample(frameMs);
				const avg = avgMs();
				// thresholds are conservative: if avg > 30ms (≈33fps) degrade; if avg < 12ms (≈83fps) consider increasing
				if (avg > 30) { // avg > 30ms: 平均フレーム時間が30msを超える（約33fps未満） -> 負荷高めと判断
					// degrade gradually (avoid sudden jumps)
					GAME_CONFIG.physics.substeps = Math.max(1, (Number(GAME_CONFIG.physics.substeps) || 1) - 1);
					GAME_CONFIG.physics.fixedFps = Math.max(30, (Number(GAME_CONFIG.physics.fixedFps) || 60) - 5);
					GAME_CONFIG.physics.positionIterations = Math.max(4, (Number(GAME_CONFIG.physics.positionIterations) || 6) - 1);
					GAME_CONFIG.physics.velocityIterations = Math.max(3, (Number(GAME_CONFIG.physics.velocityIterations) || 4) - 1);
					// force simple renderer
					if (render && render.options) render.options.pixelRatio = 1;
				} else if (avg < 12) { // avg < 12ms: 平均フレーム時間が12ms未満（約83fps以上） -> 余裕があるため品質回復可
					// restore slowly toward defaults
					GAME_CONFIG.physics.substeps = Math.min(4, (Number(GAME_CONFIG.physics.substeps) || 1) + 1);
					GAME_CONFIG.physics.fixedFps = Math.min(60, (Number(GAME_CONFIG.physics.fixedFps) || 30) + 5);
					GAME_CONFIG.physics.positionIterations = Math.min(12, (Number(GAME_CONFIG.physics.positionIterations) || 6) + 1);
					GAME_CONFIG.physics.velocityIterations = Math.min(8, (Number(GAME_CONFIG.physics.velocityIterations) || 4) + 1);
				}
			} catch (_) { /* no-op */ }
		};
	})();
	// カスタム固定タイムステップループ（requestAnimationFrameベース）
	// - アキュムレータで実時間を蓄積し、固定長の物理ステップに分割して更新する
	// - timeScale（世界時間倍率）は GAME_CONFIG.physics.timeScale で管理
	(function runFixedTimestep() {
		const substeps = Math.max(1, Number(GAME_CONFIG.physics?.substeps ?? 1)); // サブステップ数の下限1
		const fixedFps = Math.max(30, Number(GAME_CONFIG.physics?.fixedFps ?? 60)); // 物理更新の目標FPS（下限30fps）
		const maxFixedStepsPerFrame = Math.max(1, Number(GAME_CONFIG.physics?.maxFixedStepsPerFrame ?? 3)); // 1フレーム内で許可する物理ステップの最大数
		const adaptiveSubsteps = Boolean(GAME_CONFIG.physics?.adaptiveSubsteps ?? false); // サブステップ適応モードフラグ
		const fixedDtMs = 1000 / fixedFps; // 固定ステップ長 (ms)
		let last = performance.now();
		let acc = 0;
		function loop(now) {
			// タブ復帰などで巨大なelapsedが来た場合の暴走抑制
			const elapsedRaw = now - last;
			const elapsed = Math.min(elapsedRaw, 200); // 大きなジャンプは200msで打ち切る（タブ復帰等の暴走抑制）
			last = now;
			const paused = Boolean(GAME_CONFIG.physics?.paused);
			// record elapsed to adaptive physics manager (if present)
			 try { if (typeof (window as any).__recordPhysicsPerf__ === 'function') (window as any).__recordPhysicsPerf__(elapsed); } catch (_) { /* no-op */ }
			const tsCfg = Number(GAME_CONFIG.physics?.timeScale ?? 1); // UIが管理するワールド倍率
			const ts = paused ? 0 : tsCfg;
			// タイムスケール適用: 停止時はアキュムリセット、それ以外は実時間を蓄積
			if (ts === 0) {
				acc = 0; // 停止時は物理を進めない
			} else {
				acc += elapsed;
			}
			let steps = 0;
			// 固定ステップをサブステップに分割して順次Engine.updateを呼ぶ
			while (acc >= fixedDtMs && steps < maxFixedStepsPerFrame) {
				// 大きなフレーム遅延時はサブステップ数を抑えて1にする（オーバーヘッドを減らす）
				const effSubsteps = (adaptiveSubsteps && elapsed > fixedDtMs * 1.5) ? 1 : substeps;
				const stepMs = fixedDtMs / effSubsteps;
				for (let i = 0; i < effSubsteps; i++) {
					// 物理更新はワールド時間（stepMs * timeScale）で進める
					Engine.update(engine, stepMs * ts);
				}
				acc -= fixedDtMs;
				steps++;
			}
			// 予算オーバー時は過剰な遅延を切り捨て、スパイラルを防ぐ
			if (acc >= fixedDtMs) {
				acc = Math.min(acc, fixedDtMs);
			}
			// ワールド時間（シミュレーション時間）を算出
			const rotDeltaMs = elapsed * ts; // シミュ/ワールド時間ms
			const rotDeltaSec = rotDeltaMs / 1000;
			// 回転役物（rotators）の時間進行を行う（プログラム/定速双方対応）
			if (ts !== 0 && Array.isArray(rotators) && rotators.length) {
				for (const rot of rotators) {
					if (rot && rot.enabled === false) continue; // disabled rotator: skip
					if (rot.mode === 'program' && rot.program) {
						const p = rot.program;
						if (p.type === 'seq') {
							if (p.completed && !p.loop) continue;
							let remaining = rotDeltaMs;
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
								setBodyAngleAroundPivot(rot.body, rot.pivot, rot.zeroAngle + p.endRad);
								continue;
							}
							p.elapsedMs += rotDeltaMs;
							let t = p.elapsedMs / p.durationMs;
							if (p.loop) t = t % 1; else t = Math.min(1, t);
							if (p.yoyo) {
								const cycle = t * 2;
								const dir = cycle <= 1 ? cycle : (2 - cycle);
								const angle = p.startRad + (p.endRad - p.startRad) * dir;
								setBodyAngleAroundPivot(rot.body, rot.pivot, rot.zeroAngle + angle);
							} else {
								const angle = p.startRad + (p.endRad - p.startRad) * t;
								setBodyAngleAroundPivot(rot.body, rot.pivot, rot.zeroAngle + angle);
							}
						}
					} else if (rot.mode === 'inertial' && rot.inertial) {
						// sleep idle rotators: skip processing if not recently active
						try {
							const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
							const last = Number(rot.lastActiveAt || 0);
							const thr = Number(rot.sleepThresholdMs || 3000);
							if (now - last > thr) {
								// let Matter.js simulate passively; skip custom inertial updates
								continue;
							}
						} catch (_) { /* no-op */ }
						// If no spring parameters are present, treat this as physics-only inertial
						// (we rely on Matter.js collisions and body.mass/inertia). Avoid NaN by
						// guarding access to missing properties.
						if (typeof rot.inertial.springStiffness !== 'number') {
							// ensure body remains at pivot to avoid drift
							try {
								// avoid hard snapping which causes visible jitter: translate a fraction
								const pos = rot.body.position || { x: 0, y: 0 };
								const dx = rot.pivot.x - pos.x;
								const dy = rot.pivot.y - pos.y;
								const distSq = dx * dx + dy * dy;
								if (distSq > 2.25) { // > 1.5 px
									const frac = 0.3; // move 30% of the offset per frame
									Matter.Body.translate(rot.body, { x: dx * frac, y: dy * frac });
								}
							} catch (_) { /* no-op */ }
							continue; // skip custom torque integration
						}
						// スプリング（角度誤差）+ ダンパ（角速度）で安定回帰させる
						const I = rot.body.inertia || 0;
						if (I > 0) {
							const cur = rot.body.angle || 0;
							const target = rot.zeroAngle + rot.inertial.restRad;
							let err = cur - target;
							err = Math.atan2(Math.sin(err), Math.cos(err));
							const omega = rot.body.angularVelocity || 0;
							const k = rot.inertial.springStiffness;
							const c = rot.inertial.springDamping;
							const gBias = Number(rot.inertial.gravityBias ?? 0);
							const gAngleDeg = Number(rot.inertial.gravityAngleDeg ?? rot.inertial.gravityAngle ?? 90);
							const gAngle = gAngleDeg * Math.PI / 180;
							const gravityTarget = rot.zeroAngle + gAngle;
							let gravityTorque = 0;
							if (gBias && Math.abs(gBias) > 0) {
								const mass = (rot.body && rot.body.mass) ? rot.body.mass : 1;
								const gravityOffset = Number(rot.inertial.gravityOffset ?? rot.inertial.gravityRadius ?? 8);
								const worldG = (engine && engine.world && typeof engine.world.gravity?.y === 'number') ? Math.abs(engine.world.gravity.y) : 1;
								gravityTorque = -gBias * mass * gravityOffset * worldG * Math.sin(cur - gravityTarget);
								if (!Number.isFinite(gravityTorque)) gravityTorque = 0;
								gravityTorque = Math.max(-10000, Math.min(10000, gravityTorque));
							}
							const ad = Math.max(0, rot.inertial.angularDamping || 0);
							const torque = (-k * err) + (-c * omega) + gravityTorque;
							// integrate desired angular acceleration -> torque/I
							const angAcc = (torque / I);
							let newOmega = omega + angAcc * rotDeltaSec;
							if (ad > 0) {
								const factor = Math.max(0, 1 - ad * rotDeltaSec);
								newOmega *= factor;
							}
							// instead of directly setting angular velocity (which can cause jank),
							// apply an equivalent tangential force at an approximate radius to produce torque
							try {
								const approxR = Math.max(8, (rot.body.bounds.max.x - rot.body.bounds.min.x) / 4);
								// torque = r x F  -> F_tangential = torque / r
								const force = { x: 0, y: 0 };
								const fMag = torque / approxR;
								// apply force perpendicular to current angle to produce angular acceleration
								const dirX = -Math.sin(rot.body.angle || 0);
								const dirY = Math.cos(rot.body.angle || 0);
								force.x = dirX * fMag * 0.5; // scale down to be gentle
								force.y = dirY * fMag * 0.5;
								Matter.Body.applyForce(rot.body, rot.body.position, force);
							} catch (_) {
								// fallback: set angular velocity if force application fails
								try { Body.setAngularVelocity(rot.body, newOmega); } catch (_) { /* no-op */ }
							}
							try {
								const pos = rot.body.position || { x: 0, y: 0 };
								const dx = rot.pivot.x - pos.x;
								const dy = rot.pivot.y - pos.y;
								const distSq = dx * dx + dy * dy;
								if (distSq > 2.25) {
									const frac = 0.3;
									Matter.Body.translate(rot.body, { x: dx * frac, y: dy * frac });
								}
							} catch (_) { /* no-op */ }
						}
					} else {
						const angle = (rot.anglePerSecond || 0) * rotDeltaSec;
						if (angle) Body.rotate(rot.body, angle);
					}
				}
			}
			// 長押し連射タイマーの進行（ワールド時間基準）
			if (ts !== 0 && holdActive) {
				holdAccumMs += elapsed * ts;
				if (holdFirstShotPending) {
					if (holdAccumMs >= holdFirstDelayMsCfg) {
						holdAccumMs = 0;
						holdFirstShotPending = false;
						try { spawnBallFromUI(); } catch (_) { /* no-op */ }
					}
				} else {
					const interval = Math.max(50, holdIntervalMsCfg);
					if (holdAccumMs >= interval) {
						holdAccumMs = 0; // 1発/フレーム上限
						try { spawnBallFromUI(); } catch (_) { /* no-op */ }
					}
				}
			}
			// Ensure the canvas is fully cleared each frame to avoid visual trails / ghosting.
			try {
				const c = render && render.canvas;
				if (c && c.getContext) {
					const ctx = c.getContext('2d');
					if (ctx) {
						// use clearRect to fully clear the canvas; ensure default composite mode
						const prev = ctx.globalCompositeOperation;
						ctx.globalCompositeOperation = 'source-over';
						ctx.clearRect(0, 0, c.width, c.height);
						ctx.globalCompositeOperation = prev;
					}
				}
			} catch (_) { /* no-op */ }

			// パーティクルの状態を更新 (objects.jsで定義)
			if (typeof updateParticles === 'function') {
				updateParticles(rotDeltaMs);
			}

			// レイアウト未確定時は描画をスキップ
			if (!sizedReady) {
				try { ensureCanvasSized(); } catch (_) { }
				// ensureCanvasSized 内で ready 判定されるまで描画せず待機
				requestAnimationFrame(loop);
				return;
			}
			Render.world(render);
			requestAnimationFrame(loop);
		}
		requestAnimationFrame(loop);
	})();

	// ========================
	// 4. ワールド生成（境界・釘・プリセット適用）
	// ========================
	// topPlate の半径は未指定時、画面幅から推測
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

	// rotators 配列に { id, body, mode, anglePerSecond?, pivot, program?, enabled } を保持し、afterUpdate で回す
	let rotators = [];

	// ランタイムで有効/無効を切り替えるための簡易API（ブラウザコンソール用）
	if (typeof window !== 'undefined') {
		window.setRotatorEnabledById = function (id, enabled) {
			const r = Array.isArray(rotators) ? rotators.find(r => r && r.id === id) : null;
			if (r) r.enabled = !!enabled;
			return !!(r && r.enabled);
		};
		window.setRotatorEnabledByIndex = function (index, enabled) {
			if (!Array.isArray(rotators)) return false;
			const i = Number(index) | 0;
			if (!rotators[i]) return false;
			rotators[i].enabled = !!enabled;
			return !!rotators[i].enabled;
		};
		window.setAllRotatorsEnabled = function (enabled) {
			if (!Array.isArray(rotators)) return 0;
			let n = 0; for (const r of rotators) { if (!r) continue; r.enabled = !!enabled; n++; }
			return n;
		};
		window.getRotatorsSummary = function () {
			if (!Array.isArray(rotators)) return [];
			return rotators.map((r, i) => r ? ({ index: i, id: r.id, kind: r.kind, enabled: r.enabled, mode: r.mode }) : null).filter(Boolean);
		};
		window.toggleRotatorEnabled = function (idOrIndex) {
			if (typeof idOrIndex === 'number') {
				const i = idOrIndex | 0; if (!rotators[i]) return false; rotators[i].enabled = !rotators[i].enabled; return rotators[i].enabled;
			}
			const r = Array.isArray(rotators) ? rotators.find(r => r && r.id === String(idOrIndex)) : null;
			if (!r) return false; r.enabled = !r.enabled; return r.enabled;
		};
		window.setRotatorsEnabledByKind = function (kind, enabled) {
			if (!Array.isArray(rotators)) return 0;
			const k = String(kind || '').toLowerCase();
			let n = 0; for (const r of rotators) { if (!r) continue; if (String(r.kind).toLowerCase() === k) { r.enabled = !!enabled; n++; } }
			return n;
		};
	}

	// helper: set compound body to an absolute angle around a pivot
	// ボディをピボット中心で指定角度に設定する（小さな誤差を無視）
	function setBodyAngleAroundPivot(body, pivot, targetAngleRad) {
		const cur = body.angle || 0;
		let delta = targetAngleRad - cur;
		// wrap small numerical noise
		if (Math.abs(delta) < 1e-6) return;
		// Rotate the body's position around the pivot by delta, then set the body's angle.
		// This ensures the compound body rotates visually around the pivot point.
		try {
			const px = pivot.x || 0;
			const py = pivot.y || 0;
			const cx = body.position?.x || 0;
			const cy = body.position?.y || 0;
			const dx = cx - px;
			const dy = cy - py;
			const cos = Math.cos(delta);
			const sin = Math.sin(delta);
			const nx = dx * cos - dy * sin;
			const ny = dx * sin + dy * cos;
			const newX = px + nx;
			const newY = py + ny;
			// move body to new position and set angle
			Matter.Body.setPosition(body, { x: newX, y: newY });
			Matter.Body.setAngle(body, cur + delta);
		} catch (_) {
			// fallback to simple rotate if anything goes wrong
			try { Matter.Body.rotate(body, delta); } catch (_) { /* no-op */ }
		}
	}

	// プリセットから回転役物（風車等）を作成し、rotators 配列へ登録する
	// rotators はループで駆動される
	function initRotatorsFromPreset(preset) {
		const items = Array.isArray(preset.rotators) ? preset.rotators : [];
		return items.map((item, idx) => {
			// 新タイプ 'paddle' は、風車ジオメトリを1枚ブレード前提で使う別名として扱う
			const isWindmill = item.type === 'windmill';
			const isPaddle = item.type === 'paddle';
			if (!isWindmill && !isPaddle) return null;
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
				// paddle の場合も内部の形状は windmill ベースだが、型識別のために type を通す
				shape: Object.assign({ type: isPaddle ? 'paddle' : 'windmill' }, defaults, item.shape || {})
			};
			const body = createRotatingYakumono(blueprint);
			World.add(world, body);
			// pivot は常に中心円の中心（設計図の x,y）
			const pivot = { x: blueprint.x, y: blueprint.y };
			const zeroAngle = body.angle || 0;
			// 有効/無効（既定 true）とID（未指定は型+index）
			const enabled = (item.enabled !== false);
			const id = String(item.id || `${isPaddle ? 'paddle' : 'windmill'}_${idx}`);
			const kind = isPaddle ? 'paddle' : 'windmill';
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
				return { id, kind, body, mode: 'program', program, pivot, zeroAngle, enabled };
			}
			// 2) 慣性（物理）駆動モード：衝突で回り、減衰とスプリングで静止角へ戻る
			if (rotCfg && String(rotCfg.mode || '').toLowerCase() === 'inertial') {
				// 動的化し、中心点にピン制約（位置固定、回転は自由）
				// 注意: ここでは独自の "stiffness/damping/sensitivity/gravityBias" 等の
				// パラメータを使わず、純粋に Matter.js の質量・密度・衝突インパルス
				// と world.gravity による挙動に任せる実装にする。
				Body.setStatic(body, false);
				const restDeg = Number(rotCfg.restDeg ?? rotCfg.restAngleDeg ?? 0);
				const restRad = restDeg * Math.PI / 180;
				// ピボット固定（回転は Matter.js の力学に委ねる）
				// use a softer pin (not perfectly rigid) to avoid harsh corrections
				const pin = Constraint.create({ pointA: { x: pivot.x, y: pivot.y }, bodyB: body, pointB: { x: 0, y: 0 }, length: 0, stiffness: 0.7, damping: 0.1 });
				World.add(world, pin);
				// apply a small air friction so rotations decay smoothly
				body.frictionAir = Math.max(0.001, body.frictionAir || 0.02);
				// 初期角（あれば設定）
				try { setBodyAngleAroundPivot(body, pivot, zeroAngle + restRad); } catch (_) { /* no-op */ }
				const inertial = { pin };
				const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
				const rot = { id, kind, body, mode: 'inertial', inertial, pivot, zeroAngle, enabled, lastActiveAt: now, sleepThresholdMs: 3000 };
				return rot;
			}
			// 3) 開始/終了角のレンジ指定（従来のプログラム回転）
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
					return { id, kind, body, mode: 'program', program, pivot, zeroAngle, enabled };
				}
			}
			// 既定: 従来の等速回転
			const rps = Number(item.rps ?? windmillConfig.rotationsPerSecond);
			const anglePerSecond = rps * 2 * Math.PI * (item.direction === -1 ? -1 : 1);
			return { id, kind, body, mode: 'constant', anglePerSecond, pivot, zeroAngle, enabled };
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

	// センサー通過カウント用ボディをプリセットから初期化
	function initSensorCountersFromPreset(preset) {
		const items = Array.isArray(preset.sensorCounters) ? preset.sensorCounters : [];
		if (!items.length) return;
		const bodies = items.map(s => createSensorCounter(Object.assign({}, s, {
			x: (s.x || 0) + globalXOffset,
			y: (s.y || 0) + globalYOffset
		}))).filter(Boolean);
		if (bodies.length) World.add(world, bodies);
	}

	// センサー通過カウント用ポリゴンボディをプリセットから初期化
	function initSensorCounterPolygonsFromPreset(preset) {
		const items = Array.isArray(preset.sensorCounterPolygons) ? preset.sensorCounterPolygons : [];
		if (!items.length) return;
		const bodies = items.map(s => {
			const coordMode = (s.coordMode || s.pointsMode || (s.useWorldPoints ? 'world' : undefined) || 'local');
			if (String(coordMode).toLowerCase() === 'world') {
				// world座標指定: points にオフセットを適用
				const pts = Array.isArray(s.points) ? s.points.map(pt => ({ x: (pt.x || 0) + globalXOffset, y: (pt.y || 0) + globalYOffset })) : s.points;
				return createSensorCounterPolygon(Object.assign({}, s, { points: pts }));
			}
			// local座標指定: x,y にオフセット
			return createSensorCounterPolygon(Object.assign({}, s, {
				x: (s.x || 0) + globalXOffset,
				y: (s.y || 0) + globalYOffset,
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
		initSensorCountersFromPreset,
		initSensorCounterPolygonsFromPreset,
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

	// ========================
	// 5. ループ内処理（回転ギミックの駆動＆連射タイマー）
	// ========================
	// rotators の回転モード：
	//  - program: シーケンス/範囲指定で角度を補間し追従
	//  - constant: 等速回転（anglePerSecond）
	let holdActive = false;
	let holdAccumMs = 0;
	let holdIntervalMsCfg = Number((GAME_CONFIG.launch && GAME_CONFIG.launch.holdIntervalMs) || 300);
	let holdFirstDelayMsCfg = Number((GAME_CONFIG.launch && GAME_CONFIG.launch.holdFirstShotDelayMs) || 0);
	let holdFirstShotPending = false;

	// 回転・連射は rAF ループ側で駆動（ここでは未使用）

	// ========================
	// 6. 発射台（LaunchPad）と UI の初期化
	// ========================

	// helper: compute spawn start coords based on GAME_CONFIG and offsets
	function computeSpawnCoords() {
		const spawnCfg: any = (GAME_CONFIG.launch && GAME_CONFIG.launch.spawn) || {};
		const { xOffset: sxOff, yOffset: syOff } = (typeof getOffsets === 'function') ? getOffsets() : { xOffset: 0, yOffset: 0 };
		const startX = (typeof spawnCfg.x === 'number') ? (spawnCfg.x + sxOff) : (40 + sxOff);
		const startY = (typeof spawnCfg.y === 'number') ? (spawnCfg.y + syOff) : (height - (spawnCfg.yOffsetFromBottom || 40) + syOff);
		return { x: startX, y: startY };
	}

	// 旧 DOM 発射台は廃止（残っている場合は非表示にし、キャンバス描画に集約）
	const legacyPad = document.getElementById('launch-pad');
	if (legacyPad) legacyPad.style.display = 'none';

	// キャンバス側の発射台ボディを生成して追加
	const padCfg0: any = (GAME_CONFIG.launch && GAME_CONFIG.launch.pad) || {};
	const launchPadBody = createLaunchPadBody({
		width: padCfg0.width || 64,
		height: padCfg0.height || 14,
		color: padCfg0.background || '#444',
		borderColor: padCfg0.borderColor || '#fff',
		layer: Number(padCfg0.layer ?? 1)
	});
	World.add(world, launchPadBody);

	function applyPadConfig() {
		const padCfg: any = (GAME_CONFIG.launch && GAME_CONFIG.launch.pad) || {};
		// サイズ・見た目はボディ生成時のまま。必要なら再生成やスケール対応を追加可能。
		// レイヤー変更のみ反映
		const layer = Number(padCfg.layer ?? 1);
		 (launchPadBody.render as any).layer = Number.isFinite(layer) ? layer : 1;
	}

	function updateLaunchPadPosition() {
		const p = computeSpawnCoords();
		const padCfg: any = (GAME_CONFIG.launch && GAME_CONFIG.launch.pad) || {};
		const padCfgAny: any = padCfg;
		const padW = Number(padCfgAny.width || 64);
		const padH = Number(padCfgAny.height || 14);
		const longIsWidth = padW >= padH;
		const originX = longIsWidth ? 0 : (padW / 2);
		const originY = longIsWidth ? (padH / 2) : 0;
		// read slider value via typed element to avoid TS complaining about .value on HTMLElement
		const angleEl = /** @type {HTMLInputElement|null} */ (document.getElementById('angle-slider'));
		 const angleDeg = Number((angleEl ? (angleEl as HTMLInputElement).value : (GAME_CONFIG.launch?.defaultAngle || 90)));
		const offsetY = padCfgAny.offsetY || 0;
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
	// Try to set initial positions, but the container size may not be stable
	// immediately after DOMContentLoaded (CSS or font loading may still affect layout).
	// If the container size is invalid (width/height === 0), retry a few times with delays.
	function tryInitPosition(retries = 6, delayMs = 80) {
		try {
			const c = container.getBoundingClientRect();
			const valid = c && c.width > 0 && c.height > 0;
			// debug dump (one-shot) to help diagnose mobile init timing
			try {
				const gw = /** @type {any} */ (window);
				 if (!(window as any).__pachi_init_logged__) {
					 (window as any).__pachi_init_logged__ = true;
					console.debug('[PACHINKO] init dbg', {
						rect: c,
						client: { w: container.clientWidth, h: container.clientHeight },
						renderedCanvas: render && render.canvas ? { w: render.canvas.width, h: render.canvas.height, styleW: render.canvas.style.width, styleH: render.canvas.style.height } : null
					});
				}
			} catch (_) { }
			if (valid) {
				try {
					updateLaunchPadPosition();
					updateArrow();
					ensureCanvasSized();
				} catch (_) { /* no-op */ }
				try { container.style.visibility = ''; } catch (_) { }
				return true;
			}
		} catch (_) { /* no-op */ }

		// If ResizeObserver is available, observe until container receives non-zero size
		if (typeof ResizeObserver !== 'undefined') {
			try {
				const ro = new ResizeObserver((entries) => {
					for (const e of entries) {
						const cr: any = e && e.contentRect ? e.contentRect : {};
						const w = Number(cr.width || 0);
						const h = Number(cr.height || 0);
						if (w > 0 && h > 0) {
							try { updateLaunchPadPosition(); updateArrow(); ensureCanvasSized(); } catch (_) { }
							try { container.style.visibility = ''; } catch (_) { }
							try { ro.disconnect(); } catch (_) { }
							return;
						}
					}
				});
				ro.observe(container);
				// give it a short grace period and continue retry polling as well
			} catch (_) { /* no-op */ }
		}

		if (retries <= 0) {
			// last resort: call once (may result in slight visual glitch but avoids leaving things unpositioned)
			try { updateLaunchPadPosition(); updateArrow(); } catch (_) { }
			try { container.style.visibility = ''; } catch (_) { }
			return false;
		}
		setTimeout(() => tryInitPosition(retries - 1, delayMs), delayMs);
		return false;
	}
	tryInitPosition();
	// best-effort ensure canvas is sized right away in addition to the retry/observer
	try { ensureCanvasSized(); } catch (_) { }

	// ensure canvas updates on resize as well (mobile orientation changes etc.)
	try {
		window.addEventListener('resize', () => { try { ensureCanvasSized(); updateLaunchPadPosition(); } catch (_) { } });
	} catch (_) { }

	// Also try again after full load (images/fonts applied) as a fallback for some mobile browsers
	try { window.addEventListener('load', () => tryInitPosition(2, 120)); } catch (_) { }
	// If Font loading can delay layout, re-run sizing once fonts are ready (some mobile browsers behave oddly)
	try {
		if (document && document.fonts && typeof document.fonts.ready !== 'undefined') {
			document.fonts.ready.then(() => {
				console.debug('[PACHINKO] fonts.ready fired, re-checking layout');
				tryInitPosition(3, 80);
				try { ensureCanvasSized(); } catch (_) { }
			}).catch(() => { /* no-op */ });
		}
	} catch (_) { }
	// Extra delayed fallback: sometimes layout stabilizes a bit later; run one last check after 600ms
	try { setTimeout(() => { console.debug('[PACHINKO] delayed fallback sizing'); tryInitPosition(1, 120); try { ensureCanvasSized(); } catch (_) { } }, 600); } catch (_) { }

	// update when window resizes or when topPlate recreated
	window.addEventListener('resize', updateLaunchPadPosition);

	// UI（スライダー/ラベル）

	/** @type {HTMLInputElement | null} */
	const angleSlider = /** @type {HTMLInputElement | null} */ (document.getElementById('angle-slider'));
	/** @type {HTMLInputElement | null} */
	const speedSlider: HTMLInputElement | null = document.getElementById('speed-slider') as HTMLInputElement | null;
	/** @type {HTMLElement | null} */
	const angleVal = document.getElementById('angle-val');
	/** @type {HTMLElement | null} */
	const speedVal = document.getElementById('speed-val');

	// angle slider configuration from config.js
	if (GAME_CONFIG.launch) {
		// angle UI は無い可能性があるため速度のみ設定
		// speed slider: 0..100 を 0.01 刻みに
		if (speedSlider) {
			speedSlider.min = '0';
			speedSlider.max = '100';
			speedSlider.step = '0.01';
		}
	}

	// 天板UIは削除

	// UI 表示更新（矢印と速度数値）
	const launchArrow = document.getElementById('launch-arrow');
	const speedActual = document.createElement('span');
	speedActual.id = 'speed-actual';
	// 数値が詰まり過ぎて視認性が落ちるのを防ぐ
	speedActual.style.marginLeft = '6px';
	// スピードスライダー初期値は 0 に固定
	if (speedSlider) speedSlider.value = '0';

	// Apply label color from config if provided
	try {
		const labelColor = GAME_CONFIG.ui && GAME_CONFIG.ui.labelColor;
		if (labelColor) {
			if (angleVal) angleVal.style.color = labelColor;
			if (speedVal) speedVal.style.color = labelColor;
			if (speedActual) speedActual.style.color = labelColor;
			// also apply to the label text nodes inside .slider-info
			const sliderInfo = document.querySelector('.slider-info');
			if (sliderInfo) {
				const labels = sliderInfo.querySelectorAll('label');
				labels.forEach(l => { l.style.color = labelColor; });
			}
		}
	} catch (_) { /* no-op */ }

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
	// 表示更新は input イベントで行い、軽量に保つ
	function updateArrow() {
		const launchArrow = document.getElementById('launch-arrow');
		if (!launchArrow) return; // arrow removed via CSS/HTML — no-op
		 const angle = Number((angleSlider as HTMLInputElement)?.value ?? GAME_CONFIG.launch?.defaultAngle ?? 90);
		const sliderValue = Number(speedSlider.value);
		const speed = computeSpeedFromSlider(sliderValue);
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

	// （未使用の UI ヘルパーは削除し、必要最小限のイベントのみを維持）
	// insert speedActual after speedVal in DOM（中央揃えのラベルに付加）
	const sliderInfo = document.querySelector('.slider-info');
	if (sliderInfo) {
		// 強さラベルの隣に速度表記を配置（中央揃えコンテナ内）
		const labelInInfo = sliderInfo.querySelector('label');
		if (labelInInfo) labelInInfo.appendChild(speedActual);
	}
	// 初期ラベル表示・初期位置反映
	updateArrow();
	updateLaunchPadPosition();

	// --- 発射可能弾数（残弾）表示と管理 ---
	const cfgAmmo = (GAME_CONFIG && GAME_CONFIG.launch && Number.isFinite(Number(GAME_CONFIG.launch.ammo))) ? Number(GAME_CONFIG.launch.ammo) : 1000;
	let launchAmmo = cfgAmmo;
	GAME_CONFIG.launch.currentAmmo = launchAmmo;
	function updateAmmoUI() {
		try {
			let ammoEl = document.getElementById('ammo-count');
			if (!ammoEl && sliderInfo) {
				ammoEl = document.createElement('div');
				ammoEl.id = 'ammo-count';
				ammoEl.className = 'ammo-box';
				sliderInfo.appendChild(ammoEl);
			}
			if (ammoEl) {
				ammoEl.textContent = `残弾: ${launchAmmo} 発`;
				// 低弾閾値: 10 発以下で警告スタイル
				if (launchAmmo <= 10) ammoEl.classList.add('low'); else ammoEl.classList.remove('low');
			}
		} catch (_) { /* no-op */ }
	}

	// 初期表示
	updateAmmoUI();

	// スロット勝利時に配当額を持ち玉(ammo)へ換算して加算
	try {
		window.addEventListener('slot:win', (ev) => {
			try {
				const ce = /** @type {CustomEvent} */ (ev);
				 const amount = Number((ce as CustomEvent)?.detail?.amount) || 0;
				const mult = Number(GAME_CONFIG?.rewards?.slotWinAmmoMultiplier);
				if (!(amount > 0 && Number.isFinite(mult) && mult > 0)) return;
				const gain = Math.floor(amount * mult);
				// ammo 付与
				if (gain > 0) {
					launchAmmo = Number(launchAmmo || 0) + gain;
					GAME_CONFIG.launch.currentAmmo = launchAmmo;
					updateAmmoUI();
					// devtools 通知
					try { window.dispatchEvent(new CustomEvent('devtools:ammo-gained', { detail: { source: 'slot:win', amount, mult, gain, total: launchAmmo } })); } catch (_) { }
				}

				// メッセージ（テンプレート）表示: {amount}, {mult}, {adjusted}
				try {
					const templ = (GAME_CONFIG?.rewards?.slotWinMessageTemplate) || '';
					if (templ) {
						const adjusted = gain;
						const msg = String(templ)
							.replaceAll('{amount}', String(amount))
							.replaceAll('{mult}', String(mult))
							.replaceAll('{adjusted}', String(adjusted));
						showToastMessage(msg, Number(GAME_CONFIG?.rewards?.slotWinMessageMs) || 2200);
					}
				} catch (_) { /* no-op */ }
			} catch (_) { /* no-op */ }
		});
	} catch (_) { /* no-op */ }

	// 軽量トースト表示（main内ローカル, フェードイン/アウト対応）
	function showToastMessage(msg, durationMs) {
		try {
			let el = document.getElementById('pachi-slot-toast');
			if (!el) {
				el = document.createElement('div');
				el.id = 'pachi-slot-toast';
				el.style.position = 'absolute';
				el.style.left = '50%';
				el.style.top = '16px';
				el.style.transform = 'translate(-50%, -6px)';
				el.style.padding = '8px 12px';
				el.style.background = 'rgba(0,0,0,0.75)';
				el.style.color = '#fff';
				el.style.borderRadius = '8px';
				el.style.fontSize = '14px';
				el.style.zIndex = '10000';
				el.style.pointerEvents = 'none';
				el.style.opacity = '0';
				el.style.transition = 'opacity 220ms ease, transform 220ms ease';
				const container = document.getElementById('game-container') || document.body;
				container.appendChild(el);
			}
			// 更新と表示
			el.textContent = msg;
			el.style.display = '';
			// 既存タイマーをクリア
			clearTimeout((showToastMessage as any)._hideTimer);
			clearTimeout((showToastMessage as any)._fadeTimer);
			// フェードイン（次フレームで）
			requestAnimationFrame(() => {
				el.style.opacity = '1';
				el.style.transform = 'translate(-50%, 0)';
			});
			// フェードアウト＆非表示
			const total = Math.max(400, Number(durationMs || 2000));
			const fadeMs = 220;
			const fadeOutDelay = Math.max(0, total - fadeMs);
			(showToastMessage as any)._fadeTimer = setTimeout(() => {
				try { el.style.opacity = '0'; el.style.transform = 'translate(-50%, -6px)'; } catch (_) { }
			}, fadeOutDelay);
			(showToastMessage as any)._hideTimer = setTimeout(() => {
				try { el.style.display = 'none'; } catch (_) { }
			}, total + 10);
		} catch (_) { /* no-op */ }
	}

	// timeScale の開発者 UI は dev-tools.js 側で注入するよう変更

	// ========================
	// 7. 発射ロジック（単発/連射）
	// ========================
	// 現在の UI 値から 1 発スポーン（連射はこの関数を繰り返し呼ぶ）
	function spawnBallFromUI() {
		// 弾数がなければ発射しない
		if (typeof launchAmmo === 'number' && launchAmmo <= 0) return;
		const start = computeSpawnCoords();
		 let angleDeg = Number((angleSlider && (angleSlider as HTMLInputElement).value) || GAME_CONFIG.launch?.defaultAngle || 90);
		const angleRandomness = GAME_CONFIG.launch?.angleRandomness || 0;
		if (angleRandomness > 0) {
			const randomAngleOffset = (Math.random() * 2 - 1) * angleRandomness;
			angleDeg += randomAngleOffset;
		}
		const sliderValue = Number(speedSlider.value || 0);
		const speedPxPerSec = computeSpeedFromSlider(sliderValue);
		const angleRad = angleDeg * Math.PI / 180;
		const velocity = { x: Math.cos(angleRad) * speedPxPerSec, y: -Math.sin(angleRad) * speedPxPerSec };
		const ball = createBall(start.x, start.y);
		World.add(world, ball);
		Body.setVelocity(ball, velocity);

		// 発射成功として残弾を減らす
		try {
			if (typeof launchAmmo === 'number') {
				launchAmmo = Math.max(0, Number(launchAmmo) - 1);
				GAME_CONFIG.launch.currentAmmo = launchAmmo;
				updateAmmoUI();
			}
		} catch (_) { /* no-op */ }

		// 総射出数をインクリメント
		try {
			if (GAME_CONFIG && GAME_CONFIG.metrics) GAME_CONFIG.metrics.totalSpawned = (Number(GAME_CONFIG.metrics.totalSpawned) || 0) + 1;
			// 開発者ツール向けに発射イベントを通知（即時更新を促す）
			try {
				if (typeof window !== 'undefined' && window.dispatchEvent) {
					window.dispatchEvent(new CustomEvent('devtools:ball-spawned', { detail: { total: GAME_CONFIG.metrics.totalSpawned } }));
				}
			} catch (_) { /* no-op */ }
		} catch (_) { /* no-op */ }
	}

	// dev tools hook: spawn ball
	window.addEventListener('devtools:spawnBall', () => {
		try { spawnBallFromUI(); } catch (_) { /* no-op */ }
	});

	// 従来のボタン発射は維持
	// 追加ボタンは廃止（連射のみ）

	// スライダー長押し連射モード（設定で有効化時のみ）
	(function wireHoldToFire() {
		/** @type {any} */
		const launchCfg: any = GAME_CONFIG.launch || {};
		if (!launchCfg || !launchCfg.holdToFireEnabled) return;
		injectHoldUiStyles();
		if (speedSlider) speedSlider.classList.add('hold-ui');
		if (speedVal) speedVal.classList.add('hold-ui');
		holdIntervalMsCfg = Number(launchCfg.holdIntervalMs) || holdIntervalMsCfg;
		holdFirstDelayMsCfg = Number(launchCfg.holdFirstShotDelayMs) || 0;
		function startHold() {
			if (holdActive) return;
			holdActive = true;
			holdAccumMs = 0;
			// 毎回ホールド開始時に初回ディレイを適用（0なら即時相当でスキップ）
			holdFirstShotPending = holdFirstDelayMsCfg > 0;
			speedSlider.classList.add('active');
		}
		function stopHold() {
			if (!holdActive) return;
			holdActive = false;
			holdAccumMs = 0;
			holdFirstShotPending = false;
			// 離したら強さを0へ
			if (speedSlider) speedSlider.value = '0';
			updateArrow();
			speedSlider.classList.remove('active');
		}
		speedSlider.addEventListener('pointerdown', startHold);
		window.addEventListener('pointerup', stopHold);
		window.addEventListener('pointercancel', stopHold);
		window.addEventListener('blur', stopHold);
	})();

	// ========================
	// 8. 衝突イベント（片付け・係数適用）
	// ========================
	Events.on(engine, 'collisionStart', (event) => {
		const pairs = event.pairs;
		for (const pair of pairs) {
			const { bodyA, bodyB } = pair;

			// 一方向壁（oneWay）: ボールの速度方向に応じて衝突を無効化
			try {
				const ballLabel = GAME_CONFIG.objects.ball.label;
				function shouldDisableByOneWay(ball, other) {
					if (!ball || !other || !other.oneWay || other.oneWay.enabled !== true) return false;
					const v = ball.velocity || { x: 0, y: 0 };
					const dir = other.oneWay.blockDir;
					// blockDir が 'up' の場合: 上向き（vy < 0）はブロック、下向き（vy > 0）は通過
					if (dir === 'up') return v.y > 0;     // 下向きは衝突を無効化
					if (dir === 'down') return v.y < 0;  // 上向きは無効化
					if (dir === 'left') return v.x > 0;  // 右向きは無効化
					if (dir === 'right') return v.x < 0; // 左向きは無効化
					return false;
				}
				let disable = false;
				if (bodyA.label === ballLabel) disable = shouldDisableByOneWay(bodyA, bodyB);
				else if (bodyB.label === ballLabel) disable = shouldDisableByOneWay(bodyB, bodyA);
				if (disable) {
					pair.isActive = false; // この衝突ペアを無効化
					continue; // 他処理はスキップ
				}
			} catch (_) { /* no-op */ }

			// 材質に基づいた物理係数の動的適用
			 if ((bodyA as any).material && (bodyB as any).material) {
				 const interaction = getMaterialInteraction((bodyA as any).material, (bodyB as any).material);
				 pair.restitution = interaction.restitution;
				 pair.friction = interaction.friction;
			}

			// --- 軽量: 衝突で回転体へ角運動量を簡易伝達 ---
			// 物理計算は単純化: 接触点とボールの速度からモーメントを算出し
			// 小さな係数で角速度に加算するだけ。これで弱い当たりでも回りやすくなる。
			try {
				if (Array.isArray(rotators) && rotators.length) {
					const ballLabel = GAME_CONFIG.objects.ball.label;
					// map bodyId -> rotator for quick lookup
					const map = new Map(rotators.filter(Boolean).map(r => [r.body.id, r]));
					let ballBody = null, rot = null;
					if (bodyA.label === ballLabel && map.has(bodyB.id)) { ballBody = bodyA; rot = map.get(bodyB.id); }
					else if (bodyB.label === ballLabel && map.has(bodyA.id)) { ballBody = bodyB; rot = map.get(bodyA.id); }
					// if collision involves an inertial rotator, mark it active to prevent sleeping
					try {
						if (rot && rot.mode === 'inertial') {
							rot.lastActiveAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
						}
					} catch (_) { /* no-op */ }
				}
			} catch (_) { /* no-op */ }

			// センサー通過カウント処理（進入イベント）
			if (GAME_CONFIG.sensorCounters.enabled) {
				handleSensorCounterCollision(bodyA, bodyB, 'enter');
			}

			// 床とボールの衝突判定（パーティクル発生のオプション対応）
			const ballLabel = GAME_CONFIG.objects.ball.label;
			const floorLabel = GAME_CONFIG.objects.floor.label;
			const eff: any = (GAME_CONFIG.effects && GAME_CONFIG.effects.floor) || {};
			const particleCfg = /** @type {any} */ ((eff && eff.particle) ? eff.particle : {});
			function handleFloorHit(ballBody) {
				if (!ballBody) return;
				try {
					if (particleCfg.enabled && typeof createParticleBurst === 'function') {
						const pColor = pickParticleColor(particleCfg, ballBody);
						const cnt = Number.isFinite(particleCfg.count) ? particleCfg.count : 12;
						const life = Number.isFinite(particleCfg.lifeMs) ? particleCfg.lifeMs : 700;
						createParticleBurst(world, ballBody.position.x, ballBody.position.y, pColor, cnt, life);
					}
				} catch (_) { /* no-op */ }
				if (!(eff && eff.removeBall === false)) {
					World.remove(world, ballBody);
					if (typeof window !== 'undefined' && window.dispatchEvent) {
						window.dispatchEvent(new CustomEvent('devtools:ball-removed', { detail: { ballId: ballBody.id, trigger: 'floor' } }));
					}
				}
			}
			if (bodyA.label === ballLabel && bodyB.label === floorLabel) {
				handleFloorHit(bodyA);
			} else if (bodyB.label === ballLabel && bodyA.label === floorLabel) {
				handleFloorHit(bodyB);
			}
		}
	});

	// センサー退出イベントの処理
	Events.on(engine, 'collisionEnd', (event) => {
		if (!GAME_CONFIG.sensorCounters.enabled) return;

		const pairs = event.pairs;
		for (const pair of pairs) {
			const { bodyA, bodyB } = pair;
			handleSensorCounterCollision(bodyA, bodyB, 'exit');
		}
	});

	// センサー通過カウント処理関数
	function handleSensorCounterCollision(bodyA, bodyB, eventType) {
		const ballLabel = GAME_CONFIG.objects.ball.label;
		let sensorBody = null;
		let ballBody = null;

		// センサーとボールのペアを特定
		if (bodyA.label === ballLabel && bodyB.label && bodyB.label.startsWith('sensor_counter_')) {
			ballBody = bodyA;
			sensorBody = bodyB;
		} else if (bodyB.label === ballLabel && bodyA.label && bodyA.label.startsWith('sensor_counter_')) {
			ballBody = bodyB;
			sensorBody = bodyA;
		}

		if (!sensorBody || !ballBody) return;

		const counterId = sensorBody.sensorData.counterId;
		const ballId = ballBody.id;
		const counter = GAME_CONFIG.sensorCounters.counters[counterId];

		if (!counter) return;

		if (eventType === 'enter') {
			// 進入イベント
			if (!sensorBody.sensorData.isEntered.has(ballId)) {
				sensorBody.sensorData.isEntered.add(ballId);
				counter.enterCount++;
				counter.currentInside++;
				// センサー更新通知（devtools 用）
				try {
					if (typeof window !== 'undefined' && window.dispatchEvent) {
						window.dispatchEvent(new CustomEvent('devtools:sensor-updated', { detail: { id: counterId, type: 'enter', counter: Object.assign({}, counter) } }));
					}
				} catch (_) { /* no-op */ }

				// センサー反応で弾数を増やし、入賞メッセージを表示
				try {
					const gain = (GAME_CONFIG && GAME_CONFIG.launch && Number.isFinite(Number(GAME_CONFIG.launch.ammoGainOnSensor))) ? Number(GAME_CONFIG.launch.ammoGainOnSensor) : 0;
					if (gain > 0 && typeof launchAmmo === 'number') {
						launchAmmo = Number(launchAmmo) + gain;
						GAME_CONFIG.launch.currentAmmo = launchAmmo;
						updateAmmoUI();
						// 入賞メッセージ
						try {
							const templ = (GAME_CONFIG && GAME_CONFIG.rewards && GAME_CONFIG.rewards.sensorEnterMessageTemplate) || '';
							if (templ) {
								const msg = String(templ).replaceAll('{gain}', String(gain));
								showToastMessage(msg, Number(GAME_CONFIG?.rewards?.slotWinMessageMs) || 1200);
							}
						} catch (_) { /* no-op */ }
					}
				} catch (_) { /* no-op */ }

				// (disabled) auto-start slot from sensor

				// removeOn が 'enter' に設定されている場合はここで削除を行う
				try {
					const cfgEntry = GAME_CONFIG.sensorCounters.counters[counterId] || {};
					const removeOn = cfgEntry.removeOn || (cfgEntry.removeOnPass ? 'exit' : null);
					if (removeOn === 'enter') {
						if (world && ballBody && world.bodies && world.bodies.indexOf && world.bodies.indexOf(ballBody) !== -1) {
							try {
								if (typeof createParticleBurst === 'function') {
									try {
										const cfgEntry = GAME_CONFIG.sensorCounters.counters[counterId] || {};
										const pColor = pickParticleColor(cfgEntry, ballBody);
										createParticleBurst(world, ballBody.position.x, ballBody.position.y, pColor, 12, 700);
									} catch (_) { /* no-op */ }
								}
							} catch (_) { /* no-op */ }
							World.remove(world, ballBody);
							if (typeof window !== 'undefined' && window.dispatchEvent) {
								window.dispatchEvent(new CustomEvent('devtools:ball-removed', { detail: { ballId: ballId, counterId: counterId, trigger: 'enter' } }));
							}
						}
					}
				} catch (_) { /* no-op */ }
			}
		} else if (eventType === 'exit') {
			// 退出イベント
			if (sensorBody.sensorData.isEntered.has(ballId)) {
				sensorBody.sensorData.isEntered.delete(ballId);
				counter.exitCount++;
				counter.currentInside = Math.max(0, counter.currentInside - 1);
				counter.totalPassed++;
				// パチンコの「当たり」（センサー通過）イベントを通知
				try { if (typeof window !== 'undefined' && window.dispatchEvent) { window.dispatchEvent(new CustomEvent('pachi:hit', { detail: { counterId, totalPassed: counter.totalPassed } })); } } catch (_) { /* no-op */ }
				// センサーごとのオプションで通過時にボールを削除する挙動
				try {
					const cfgEntry = GAME_CONFIG.sensorCounters.counters[counterId] || {};
					const removeOn = cfgEntry.removeOn || (cfgEntry.removeOnPass ? 'exit' : null);
					if (removeOn === 'exit') {
						try {
							// world にまだ含まれていれば削除
							if (world && ballBody && world.bodies && world.bodies.indexOf && world.bodies.indexOf(ballBody) !== -1) {
								// 削除の前にパーティクルバーストを発生させる
								try {
									if (typeof createParticleBurst === 'function') {
										try {
											const cfgEntry = GAME_CONFIG.sensorCounters.counters[counterId] || {};
											const pColor = pickParticleColor(cfgEntry, ballBody);
											createParticleBurst(world, ballBody.position.x, ballBody.position.y, pColor, 12, 700);
										} catch (_) { /* no-op */ }
									}
								} catch (_) { /* no-op */ }
								World.remove(world, ballBody);
								// 削除イベント通知
								if (typeof window !== 'undefined' && window.dispatchEvent) {
									window.dispatchEvent(new CustomEvent('devtools:ball-removed', { detail: { ballId: ballId, counterId: counterId, trigger: 'exit' } }));
								}
							}
						} catch (_) { /* no-op */ }
					}
				} catch (_) { /* no-op */ }
				// センサー更新通知（devtools 用）
				try {
					if (typeof window !== 'undefined' && window.dispatchEvent) {
						window.dispatchEvent(new CustomEvent('devtools:sensor-updated', { detail: { id: counterId, type: 'exit', counter: Object.assign({}, counter) } }));
					}
				} catch (_) { /* no-op */ }

				// (disabled) auto-start slot from sensor
			}
		}
	}


}

// Prefer full window load to avoid layout races caused by fonts/images/CSSOM
try {
	window.addEventListener('load', pachiInit);
} catch (_) { }
