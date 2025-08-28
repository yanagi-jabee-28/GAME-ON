// 開発者向けツール集: UI 拡張やデバッグ操作をここに集約
(function setupDevTools() {
	// 最新の Engine 参照を保持し、常にそれを使う
	let CURRENT_ENGINE = null;
	function getEngine() {
		return CURRENT_ENGINE || window.__engine_for_devtools__ || null;
	}
	// GAME_CONFIG の取得（let/const は window に乗らないため typeof で安全に参照）
	function getCfg() {
		try { return (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG : (window.GAME_CONFIG || undefined); } catch (_) { return window.GAME_CONFIG; }
	}
	function devEnabled() {
		const cfg = getCfg();
		return !!(cfg && cfg.dev && cfg.dev.enabled);
	}

	// 強さスライダーの直下に、開発者パネルを生成
	function ensureDevPanel() {
		if (!devEnabled()) return null;
		if (document.getElementById('dev-panel')) return document.getElementById('dev-panel');
		const controls = document.querySelector('.controls');
		if (!controls) return null;
		const panel = document.createElement('div');
		panel.id = 'dev-panel';
		panel.style.marginTop = '10px';
		panel.style.padding = '8px 10px';
		panel.style.borderRadius = '8px';
		panel.style.background = 'rgba(0,0,0,0.4)';
		panel.style.color = '#fff';
		panel.style.fontSize = '12px';
		panel.style.lineHeight = '1.6';
		const title = document.createElement('div');
		title.textContent = '開発者';
		title.style.fontWeight = '600';
		title.style.marginBottom = '4px';
		panel.appendChild(title);
		// 強さスライダーの下に差し込む
		controls.appendChild(panel);
		return panel;
	}

	// .controls がまだ無い場合に待ち受けて注入
	function waitControlsAndInject(engineRef) {
		if (!devEnabled()) return;
		if (ensureDevPanel()) { injectTimeScaleSlider(engineRef); return; }
		const obs = new MutationObserver(() => {
			if (ensureDevPanel()) {
				try { injectTimeScaleSlider(engineRef); } catch (_) { /* no-op */ }
				obs.disconnect();
			}
		});
		obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
	}

	// timeScale スライダーを作成してパネルに追加
	function injectTimeScaleSlider() {
		const panel = ensureDevPanel();
		if (!panel) return;
		if (panel.querySelector('#dev-timescale')) return; // 重複防止
		const row = document.createElement('div');
		const label = document.createElement('label');
		label.textContent = 'タイムスケール:';
		label.style.marginRight = '8px';
		const input = document.createElement('input');
		input.type = 'range';
		input.id = 'dev-timescale';
		input.min = '0';
		input.max = '2';
		input.step = '0.01';
		const init = Number((getCfg()?.physics?.timeScale) ?? 1);
		input.value = String(init);
		input.style.verticalAlign = 'middle';
		input.style.width = '160px';
		const val = document.createElement('span');
		val.id = 'dev-timescale-val';
		val.textContent = ` ${init.toFixed(2)}`;
		val.style.marginLeft = '6px';
		input.addEventListener('input', () => {
			const v = Number(input.value);
			try {
				const eng = getEngine();
				if (eng && eng.timing) eng.timing.timeScale = v;
			} catch (_) { /* no-op */ }
			const cfgNow = getCfg();
			if (cfgNow && cfgNow.physics) {
				if (v > 0) cfgNow.physics.paused = false;
				cfgNow.physics.timeScale = v;
			}
			val.textContent = ` ${v.toFixed(2)}`;
		});
		row.appendChild(label);
		row.appendChild(input);
		row.appendChild(val);
		panel.appendChild(row);

		// 初期反映（エンジンが既にあれば値を適用）
		const eng0 = getEngine();
		if (eng0 && eng0.timing) {
			const v0 = Number(input.value);
			eng0.timing.timeScale = v0;
			const cfgNow = getCfg();
			if (cfgNow && cfgNow.physics) {
				if (v0 > 0) cfgNow.physics.paused = false;
				cfgNow.physics.timeScale = v0;
			}
		}
	}

	// main.js から Engine/Render が準備できたら受け取ってバインド
	window.addEventListener('devtools:engine-ready', (e) => {
		const engine = e?.detail?.engine;
		CURRENT_ENGINE = engine || CURRENT_ENGINE;
		// UI が未生成なら生成
		if (!document.getElementById('dev-timescale')) injectTimeScaleSlider();
		// 現在のUI値をエンジンへ反映
		const input = document.getElementById('dev-timescale');
		if (input && engine && engine.timing) {
			const v = Number(input.value);
			engine.timing.timeScale = v;
			const cfgNow = getCfg();
			if (cfgNow && cfgNow.physics) {
				if (v > 0) cfgNow.physics.paused = false;
				cfgNow.physics.timeScale = v;
			}
			const val = document.getElementById('dev-timescale-val');
			if (val) val.textContent = ` ${v.toFixed(2)}`;
		}
	});

	// 既に main.js が初期化済み（イベント前にこのスクリプトが読むケース）へのフォールバック
	// まずは UI を出しておく（エンジン未準備でも可視化）
	if (window.__engine_for_devtools__) CURRENT_ENGINE = window.__engine_for_devtools__;
	if (ensureDevPanel()) injectTimeScaleSlider();
	else waitControlsAndInject();

	// DOM がまだ揃っていないタイミング対策（安全側の再試行）
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			if (!document.getElementById('dev-timescale')) {
				if (ensureDevPanel()) injectTimeScaleSlider();
				else waitControlsAndInject();
			}
		});
	} else {
		// すでに読み込み済みなら軽く再チェック
		if (!document.getElementById('dev-timescale')) {
			if (ensureDevPanel()) injectTimeScaleSlider();
			else waitControlsAndInject();
		}
	}
})();