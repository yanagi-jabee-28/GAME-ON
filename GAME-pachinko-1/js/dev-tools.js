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
      <div class="row"><span>TimeScale</span><input id="dt-timescale" type="range" min="0" max="1" step="0.01"><span id="dt-tsv" class="stat">1.00</span></div>
      <div class="row"><label><input id="dt-wire" type="checkbox"> Wireframes (F2)</label></div>
      <div class="row"><label><input id="dt-collide" type="checkbox"> Show Collisions (F3)</label></div>
      <div class="row"><label><input id="dt-bounds" type="checkbox"> Show Bounds (F4)</label></div>
      <div class="row"><button id="dt-spawn">Spawn Ball</button><button id="dt-toggle">Hide (F1)</button></div>
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
		DT.els.timescale = el.querySelector('#dt-timescale');
		DT.els.tsv = el.querySelector('#dt-tsv');
		DT.els.wire = el.querySelector('#dt-wire');
		DT.els.collide = el.querySelector('#dt-collide');
		DT.els.bounds = el.querySelector('#dt-bounds');
		DT.els.spawn = el.querySelector('#dt-spawn');
		DT.els.toggle = el.querySelector('#dt-toggle');

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
		DT.els.toggle.addEventListener('click', () => {
			DT.els.root.style.display = 'none';
		});
	}

	function wireHotkeys() {
		window.addEventListener('keydown', (e) => {
			const hk = Object.assign({ toggle: 'F1', wire: 'F2', collide: 'F3', bounds: 'F4' }, DT.opts.hotkeys || {});
			const key = e.key;
			if (key === hk.toggle) {
				e.preventDefault();
				if (!DT.els.root) return;
				DT.els.root.style.display = (DT.els.root.style.display === 'none') ? '' : 'none';
			} else if (key === hk.wire) {
				if (DT.els.wire) { DT.els.wire.checked = !DT.els.wire.checked; DT.els.wire.dispatchEvent(new Event('change')); }
			} else if (key === hk.collide) {
				if (DT.els.collide) { DT.els.collide.checked = !DT.els.collide.checked; DT.els.collide.dispatchEvent(new Event('change')); }
			} else if (key === hk.bounds) {
				if (DT.els.bounds) { DT.els.bounds.checked = !DT.els.bounds.checked; DT.els.bounds.dispatchEvent(new Event('change')); }
			}
		});
	}

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
		wireHotkeys();
		if (engine && Matter && Matter.Events) {
			Matter.Events.on(engine, 'afterUpdate', onAfterUpdate);
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
