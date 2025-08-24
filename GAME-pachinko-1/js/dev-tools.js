// Developer tools overlay and hotkeys for GAME-pachinko-1
// Safe to include: no-ops when not initialized.
(function () {
	const DT = {
		inited: false,
		els: {},
		opts: {},
		movingFps: 0,
		samples: [],
		maxSamples: 30,
		_hiTimers: {}, // body.id -> timeout
		_origRender: {}, // body.id -> {fillStyle, strokeStyle, lineWidth}
		_pegTextTimer: null,
		_lastPickTs: 0,
	};

	function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

	function countByLabel(world, label) {
		try {
			return (world && world.bodies ? world.bodies : []).filter(b => b && b.label === label).length;
		} catch { return 0; }
	}

	function injectStyles() {
		if (document.getElementById('devtools-style')) return;
		const style = document.createElement('style');
		style.id = 'devtools-style';
		style.textContent = `
      #devtools-overlay{ position:absolute; left:8px; top:8px; z-index:9999; color:#eee; font:12px/1.4 system-ui,Segoe UI,Roboto,Arial; background:rgba(20,22,26,.88); border:1px solid rgba(255,255,255,.1); border-radius:8px; padding:8px 10px; box-shadow:0 4px 14px rgba(0,0,0,.3); }
      #devtools-overlay h3{ margin:0 0 6px; font-size:12px; font-weight:700; color:#ffd54f; }
      #devtools-overlay .row{ display:flex; align-items:center; gap:6px; margin:4px 0; }
      #devtools-overlay .row label{ opacity:.9; }
      #devtools-overlay .stat{ min-width:72px; display:inline-block; text-align:right; font-variant-numeric:tabular-nums; }
      #devtools-overlay input[type="range"]{ width:120px; }
      #devtools-overlay button{ cursor:pointer; padding:3px 8px; border-radius:6px; border:1px solid rgba(255,255,255,.15); background:#2b3440; color:#eee; }
      #devtools-overlay .muted{ opacity:.7; }
    `;
		document.head.appendChild(style);
	}

	function createOverlay() {
		const div = document.createElement('div');
		div.id = 'devtools-overlay';
		div.innerHTML = `
      <h3>Dev Tools</h3>
      <div class="row"><span>FPS:</span><span id="dt-fps" class="stat">-</span><span class="muted">(avg)</span></div>
      <div class="row"><span>Bodies:</span><span id="dt-bodies" class="stat">-</span><span class="muted">/ Balls:</span><span id="dt-balls" class="stat">-</span></div>
      <div class="row"><span>Delta:</span><span id="dt-delta" class="stat">-</span><span class="muted">ms</span></div>
	<div class="row"><span>Peg:</span><span id="dt-pegpos" class="stat">-</span></div>
      <div class="row"><span>TimeScale</span><input id="dt-timescale" type="range" min="0" max="1" step="0.01"><span id="dt-tsv" class="stat">1.00</span></div>
	<div class="row"><label><input id="dt-wire" type="checkbox"> Wireframes</label></div>
	<div class="row"><label><input id="dt-collide" type="checkbox"> Show Collisions</label></div>
	<div class="row"><label><input id="dt-bounds" type="checkbox"> Show Bounds</label></div>
	<div class="row"><button id="dt-spawn">Spawn Ball</button></div>
    `;
		return div;
	}

	function bind(container) {
		const el = createOverlay();
		container = container || document.body;
		container.appendChild(el);
		DT.els.root = el;
		DT.els.fps = el.querySelector('#dt-fps');
		DT.els.bodies = el.querySelector('#dt-bodies');
		DT.els.balls = el.querySelector('#dt-balls');
		DT.els.delta = el.querySelector('#dt-delta');
		DT.els.pegpos = el.querySelector('#dt-pegpos');
		DT.els.timescale = el.querySelector('#dt-timescale');
		DT.els.tsv = el.querySelector('#dt-tsv');
		DT.els.wire = el.querySelector('#dt-wire');
		DT.els.collide = el.querySelector('#dt-collide');
		DT.els.bounds = el.querySelector('#dt-bounds');
		DT.els.spawn = el.querySelector('#dt-spawn');

		DT.els.timescale.addEventListener('input', () => {
			const v = parseFloat(DT.els.timescale.value);
			if (DT.engine) DT.engine.timing.timeScale = clamp(v, 0, 1);
			DT.els.tsv.textContent = (DT.engine ? DT.engine.timing.timeScale : v).toFixed(2);
		});
		DT.els.wire.addEventListener('change', () => {
			if (DT.render && DT.render.options) {
				DT.render.options.wireframes = !!DT.els.wire.checked;
			}
		});
		DT.els.collide.addEventListener('change', () => {
			if (DT.render && DT.render.options) {
				DT.render.options.showCollisions = !!DT.els.collide.checked;
			}
		});
		DT.els.bounds.addEventListener('change', () => {
			if (DT.render && DT.render.options) {
				DT.render.options.showBounds = !!DT.els.bounds.checked;
			}
		});
		DT.els.spawn.addEventListener('click', () => {
			window.dispatchEvent(new CustomEvent('devtools:spawnBall'));
		});
	}

	function copyToClipboard(text) {
		try {
			if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).catch(() => {/* noop fallback below */ });
				return;
			}
		} catch { /* fallback below */ }
		try {
			const ta = document.createElement('textarea');
			ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
			document.body.appendChild(ta); ta.focus(); ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		} catch { /* ignore */ }
	}

	function highlightBody(body, durationMs = 900) {
		if (!body) return;
		const id = body.id;
		// restore if already highlighted
		if (DT._hiTimers[id]) {
			clearTimeout(DT._hiTimers[id]);
			DT._hiTimers[id] = null;
			const orig = DT._origRender[id];
			if (orig && body.render) {
				body.render.fillStyle = orig.fillStyle;
				body.render.strokeStyle = orig.strokeStyle;
				body.render.lineWidth = orig.lineWidth;
			}
		}
		// save originals
		DT._origRender[id] = {
			fillStyle: body.render && body.render.fillStyle,
			strokeStyle: body.render && body.render.strokeStyle,
			lineWidth: body.render && body.render.lineWidth,
		};
		// apply highlight styles
		if (!body.render) body.render = {};
		body.render.strokeStyle = '#FFD54F';
		body.render.lineWidth = 3;
		// brighten fill but keep original category visible
		body.render.fillStyle = '#FFE082';
		// auto-revert
		DT._hiTimers[id] = setTimeout(() => {
			const orig = DT._origRender[id];
			if (orig && body && body.render) {
				body.render.fillStyle = orig.fillStyle;
				body.render.strokeStyle = orig.strokeStyle;
				body.render.lineWidth = orig.lineWidth;
			}
			DT._hiTimers[id] = null;
		}, durationMs);
	}

	// Canvas座標→ワールド座標の変換（簡易: スクロール・CSS拡縮に対応）
	function getWorldPointFromEvent(e, render) {
		const canvas = render && render.canvas;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		let clientX, clientY;
		if (e.touches && e.touches[0]) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
		else if (e.changedTouches && e.changedTouches[0]) { clientX = e.changedTouches[0].clientX; clientY = e.changedTouches[0].clientY; }
		else { clientX = e.clientX; clientY = e.clientY; }
		const x = (clientX - rect.left) * scaleX;
		const y = (clientY - rect.top) * scaleY;
		// render.bounds を考慮（パン/ズーム未使用ならそのまま）
		const b = render.bounds;
		if (b) {
			const bw = b.max.x - b.min.x;
			const bh = b.max.y - b.min.y;
			const vw = render.options.width || canvas.width;
			const vh = render.options.height || canvas.height;
			const sx = bw / vw;
			const sy = bh / vh;
			return { x: b.min.x + x * sx, y: b.min.y + y * sy };
		}
		return { x, y };
	}

	function isPeg(body) {
		if (!body) return false;
		// ラベル優先、次に半径や静的属性で推測
		if (body.label === (window.GAME_CONFIG && window.GAME_CONFIG.objects && window.GAME_CONFIG.objects.peg && window.GAME_CONFIG.objects.peg.label) || body.label === 'peg') return true;
		// 円形かつ小さめ・静的なら釘の可能性（ヒューリスティクス）
		if (body.circleRadius && body.circleRadius <= 8 && body.isStatic) return true;
		return false;
	}

	function pickPegAt(world, Matter, point) {
		if (!world || !Matter || !point) return null;
		try {
			const bodies = world.bodies || [];
			const found = Matter.Query.point(bodies, point);
			if (found && found.length) {
				for (let i = 0; i < found.length; i++) {
					const b = found[i];
					if (isPeg(b)) return b;
				}
			}
			// フォールバック: 近傍の釘を許容誤差で拾う
			const pegBodies = bodies.filter(isPeg);
			let best = null; let bestDist = Infinity;
			for (const b of pegBodies) {
				const dx = (b.position?.x || 0) - point.x;
				const dy = (b.position?.y || 0) - point.y;
				const d = Math.hypot(dx, dy) - (b.circleRadius || 0);
				if (d < bestDist) { bestDist = d; best = b; }
			}
			const tolerance = 10; // px
			return (bestDist <= tolerance) ? best : null;
		} catch { return null; }
	}

	function wireCanvasPicking() {
		const render = DT.render;
		if (!render || !render.canvas) return;
		const canvas = render.canvas;
		const handlePick = (e) => {
			const now = performance.now();
			if (now - (DT._lastPickTs || 0) < 120) return; // duplicate guard
			DT._lastPickTs = now;
			const pt = getWorldPointFromEvent(e, render);
			if (!pt) return;
			const peg = pickPegAt(DT.world, DT.Matter, pt);
			if (!peg) return;
			const x = (peg.position && peg.position.x) || pt.x;
			const y = (peg.position && peg.position.y) || pt.y;
			const text = `${x.toFixed(1)}, ${y.toFixed(1)}`;
			if (DT.els.pegpos) {
				DT.els.pegpos.textContent = text + ' (copied)';
				if (DT._pegTextTimer) clearTimeout(DT._pegTextTimer);
				DT._pegTextTimer = setTimeout(() => { if (DT.els.pegpos) DT.els.pegpos.textContent = text; }, 1000);
			}
			copyToClipboard(text);
			highlightBody(peg, 1000);
			DT._lastPicked = { body: peg, until: performance.now() + 1000 };
		};
		canvas.addEventListener('pointerdown', handlePick, { passive: true });
		canvas.addEventListener('click', handlePick, { passive: true });
		canvas.addEventListener('touchstart', (e) => { handlePick(e); }, { passive: true });
	}

	function onAfterRender() {
		if (!DT.render || !DT._lastPicked) return;
		const now = performance.now();
		if (now > (DT._lastPicked.until || 0)) { DT._lastPicked = null; return; }
		const ctx = DT.render.context; if (!ctx) return;
		const b = DT._lastPicked.body; if (!b || !b.position) return;
		const r = (b.circleRadius || 6) + 6;
		ctx.save();
		ctx.beginPath();
		ctx.arc(b.position.x, b.position.y, r, 0, Math.PI * 2);
		ctx.strokeStyle = '#FFD54F';
		ctx.lineWidth = 2;
		ctx.shadowColor = 'rgba(255,213,79,0.8)';
		ctx.shadowBlur = 8;
		ctx.stroke();
		// crosshair
		ctx.beginPath();
		ctx.moveTo(b.position.x - r, b.position.y);
		ctx.lineTo(b.position.x + r, b.position.y);
		ctx.moveTo(b.position.x, b.position.y - r);
		ctx.lineTo(b.position.x, b.position.y + r);
		ctx.stroke();
		ctx.restore();
	}

	// hotkeys removed: overlay is always visible when enabled via config

	function onAfterUpdate() {
		if (!DT.engine) return;
		const delta = (DT.engine.timing && DT.engine.timing.delta) ? DT.engine.timing.delta : 16.67;
		const fps = 1000 / Math.max(1e-3, delta);
		DT.samples.push(fps);
		if (DT.samples.length > DT.maxSamples) DT.samples.shift();
		const avg = DT.samples.reduce((a, b) => a + b, 0) / DT.samples.length;
		DT.movingFps = avg;
		if (DT.els.fps) DT.els.fps.textContent = avg.toFixed(1);
		if (DT.els.delta) DT.els.delta.textContent = delta.toFixed(2);
		if (DT.world) {
			if (DT.els.bodies) DT.els.bodies.textContent = (DT.world.bodies ? DT.world.bodies.length : 0);
			if (DT.els.balls) DT.els.balls.textContent = countByLabel(DT.world, (window.GAME_CONFIG && window.GAME_CONFIG.objects && window.GAME_CONFIG.objects.ball && window.GAME_CONFIG.objects.ball.label) || 'ball');
		}
		if (DT.els.tsv && DT.engine) DT.els.tsv.textContent = (DT.engine.timing.timeScale || 0).toFixed(2);
	}

	DT.init = function ({ engine, render, runner, world, Matter, container, config } = {}) {
		if (DT.inited) return;
		DT.engine = engine; DT.render = render; DT.runner = runner; DT.world = world; DT.Matter = Matter; DT.opts = config || {};
		injectStyles();
		bind(container || (render && render.canvas && render.canvas.parentElement) || document.body);
		// always on; enable/disable via config only
		wireCanvasPicking();
		if (engine && Matter && Matter.Events) {
			Matter.Events.on(engine, 'afterUpdate', onAfterUpdate);
			if (render) Matter.Events.on(render, 'afterRender', onAfterRender);
		}
		// initialize UI state from render.options
		if (render && render.options) {
			if (DT.els.wire) DT.els.wire.checked = !!render.options.wireframes;
			if (DT.els.collide) DT.els.collide.checked = !!render.options.showCollisions;
			if (DT.els.bounds) DT.els.bounds.checked = !!render.options.showBounds;
		}
		// timescale default
		if (DT.els.timescale && engine) {
			DT.els.timescale.value = String(engine.timing.timeScale || 1);
			DT.els.tsv.textContent = (engine.timing.timeScale || 1).toFixed(2);
		}
		DT.inited = true;
	};

	window.GAME_DEVTOOLS = DT;
})();
