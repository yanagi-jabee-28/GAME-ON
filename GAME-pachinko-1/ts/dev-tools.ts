import { GAME_CONFIG } from "../ts/config";

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
	function waitControlsAndInject(engineRef?: any) {
		if (!devEnabled()) return;
		if (ensureDevPanel()) { injectTimeScaleSlider(); return; }
		const obs = new MutationObserver(() => {
			if (ensureDevPanel()) {
				try { injectTimeScaleSlider(); } catch (_) { /* no-op */ }
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

		// 停止前のタイムスケールを保存
		let lastTimeScale = Number((getCfg()?.physics?.timeScale) ?? 1);

		// 共通関数: timeScale更新
		function updateTimeScale(value, unpause = true) {
			const cfg = getCfg();
			if (cfg && cfg.physics) {
				cfg.physics.timeScale = value;
				if (unpause && value > 0) cfg.physics.paused = false;
			}
		}

		// 共通関数: スライダー同期
		function syncSlider(value) {
			input.value = value.toString();
			val.textContent = ` ${value.toFixed(2)}`;
		}

		const row = document.createElement('div');
		const label = document.createElement('label');
		label.textContent = 'タイムスケール:';
		label.style.marginRight = '8px';
		/** @type {HTMLInputElement} */
		const input = /** @type {HTMLInputElement} */ (document.createElement('input'));
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
			updateTimeScale(v);
			syncSlider(v);
			// スライダー操作時はlastTimeScaleを更新（停止前の状態を維持）
			lastTimeScale = v;
		});
		row.appendChild(label);
		row.appendChild(input);
		row.appendChild(val);
		panel.appendChild(row);

		// ボタン行を追加
		const buttonRow = document.createElement('div');
		buttonRow.style.marginTop = '6px';
		buttonRow.style.display = 'flex';
		buttonRow.style.gap = '4px';
		buttonRow.style.flexWrap = 'wrap';

		// 停止ボタン
		const pauseBtn = document.createElement('button');
		pauseBtn.textContent = '停止';
		pauseBtn.style.padding = '4px 8px';
		pauseBtn.style.fontSize = '11px';
		pauseBtn.style.border = 'none';
		pauseBtn.style.borderRadius = '4px';
		pauseBtn.style.background = '#d32f2f';
		pauseBtn.style.color = '#fff';
		pauseBtn.style.cursor = 'pointer';
		pauseBtn.addEventListener('click', () => {
			// 現在のtimeScaleを保存
			lastTimeScale = Number(input.value);
			const cfg = getCfg();
			if (cfg && cfg.physics) {
				cfg.physics.paused = true;
				cfg.physics.timeScale = 0;
			}
			// スライダーは変更しない
		});
		buttonRow.appendChild(pauseBtn);

		// 再生ボタン
		const playBtn = document.createElement('button');
		playBtn.textContent = '再生';
		playBtn.style.padding = '4px 8px';
		playBtn.style.fontSize = '11px';
		playBtn.style.border = 'none';
		playBtn.style.borderRadius = '4px';
		playBtn.style.background = '#4caf50';
		playBtn.style.color = '#fff';
		playBtn.style.cursor = 'pointer';
		playBtn.addEventListener('click', () => {
			updateTimeScale(lastTimeScale);
			syncSlider(lastTimeScale);
		});
		buttonRow.appendChild(playBtn);

		// プリセットボタン
		const presets = [0.5, 1, 1.5, 2];
		presets.forEach(preset => {
			const btn = document.createElement('button');
			btn.textContent = preset.toString();
			btn.style.padding = '4px 8px';
			btn.style.fontSize = '11px';
			btn.style.border = 'none';
			btn.style.borderRadius = '4px';
			btn.style.background = '#1976d2';
			btn.style.color = '#fff';
			btn.style.cursor = 'pointer';
			btn.addEventListener('click', () => {
				updateTimeScale(preset);
				syncSlider(preset);
				// プリセット設定時はlastTimeScaleを更新
				lastTimeScale = preset;
			});
			buttonRow.appendChild(btn);
		});

		panel.appendChild(buttonRow);

		// 役物（パドル）一括ON/OFF 切替
		const paddleRow = document.createElement('div');
		paddleRow.style.marginTop = '8px';
		const paddleLabel = document.createElement('label');
		paddleLabel.style.display = 'inline-flex';
		paddleLabel.style.alignItems = 'center';
		const cb = document.createElement('input');
		cb.type = 'checkbox';
		cb.id = 'dev-toggle-paddles';
		cb.style.marginRight = '6px';
		paddleLabel.appendChild(cb);
		paddleLabel.appendChild(document.createTextNode('パドルを動かす（2つ一括）'));
		paddleRow.appendChild(paddleLabel);
		panel.appendChild(paddleRow);
		// 初期状態: 現在の rotators の paddle が全て enabled ならチェックON
		try {
			const list = (typeof window.getRotatorsSummary === 'function') ? window.getRotatorsSummary() : [];
			const paddles = list.filter(r => r.kind === 'paddle');
			const allOn = paddles.length ? paddles.every(r => r.enabled) : false;
			cb.checked = allOn;
		} catch (_) { cb.checked = false; }
		cb.addEventListener('change', () => {
			try {
				if (typeof window.setRotatorsEnabledByKind === 'function') {
					window.setRotatorsEnabledByKind('paddle', cb.checked);
				}
			} catch (_) { /* no-op */ }
		});

		// 初期反映（エンジンが既にあれば値を適用）
		const eng0 = getEngine();
		if (eng0 && eng0.timing) {
			const v0 = Number(input.value);
			updateTimeScale(v0);
		}
	}

	// main.js から Engine/Render が準備できたら受け取ってバインド
	window.addEventListener('devtools:engine-ready', (e) => {
		const ce = /** @type {CustomEvent} */ (e);
		const engine = ce?.detail?.engine;
		CURRENT_ENGINE = engine || CURRENT_ENGINE;
		// UI が未生成なら生成
		if (!document.getElementById('dev-timescale')) injectTimeScaleSlider();
		// 現在のUI値をエンジンへ反映
		const input = /** @type {HTMLInputElement | null} */ (document.getElementById('dev-timescale'));
		if (input && engine && engine.timing) {
			const v = Number(input.value);
			const cfgNow = getCfg();
			if (cfgNow && cfgNow.physics) {
				if (v > 0) cfgNow.physics.paused = false;
				cfgNow.physics.timeScale = v;
			}
			const val = document.getElementById('dev-timescale-val');
			if (val) val.textContent = ` ${v.toFixed(2)}`;
		}
	});

	// センサー通過カウント表示を開発者パネルに追加
	function injectSensorCounters() {
		const cfg = getCfg();
		if (!cfg || !cfg.sensorCounters || !cfg.sensorCounters.enabled) return;

		const panel = ensureDevPanel();
		if (!panel) return;

		// 既存のセンサー表示をクリア
		const existing = document.getElementById('dev-sensor-counters');
		if (existing) existing.remove();

		const container = document.createElement('div');
		container.id = 'dev-sensor-counters';
		container.style.marginTop = '8px';
		container.style.padding = '6px';
		container.style.borderRadius = '4px';
		container.style.background = 'rgba(255,255,255,0.1)';
		container.style.fontSize = '11px';

		const title = document.createElement('div');
		title.textContent = 'センサー通過カウント';
		title.style.fontWeight = '600';
		title.style.marginBottom = '4px';
		container.appendChild(title);

		const counters = cfg.sensorCounters.counters || {};
		const counterIds = Object.keys(counters);

		if (counterIds.length === 0) {
			const noData = document.createElement('div');
			noData.textContent = 'データなし';
			noData.style.color = '#ccc';
			container.appendChild(noData);
		} else {
			counterIds.forEach(id => {
				const data = counters[id];
				// 上段: カウント表示（簡潔に）
				const countsRow = document.createElement('div');
				countsRow.style.marginBottom = '2px';
				countsRow.style.fontSize = '12px';
				countsRow.innerHTML = `<span style="color:#ffeb3b">${id}:</span> 進入:${data.enterCount} 退出:${data.exitCount} 現在:${data.currentInside} 総通過:${data.totalPassed}`;
				container.appendChild(countsRow);

				// 下段: コントロール群（横並びだが折り返す）
				const controlsRow = document.createElement('div');
				controlsRow.style.display = 'flex';
				controlsRow.style.gap = '6px';
				controlsRow.style.flexWrap = 'wrap';
				controlsRow.style.marginBottom = '8px';
				controlsRow.style.alignItems = 'center';
				// small label to associate
				const lbl = document.createElement('div'); lbl.textContent = id; lbl.style.width = '80px'; lbl.style.color = '#ddd'; lbl.style.fontSize = '11px';
				controlsRow.appendChild(lbl);

				// 削除トリガー選択: none / enter / exit
				const sel = document.createElement('select');
				sel.style.minWidth = '80px';
				sel.title = 'ボール削除のトリガー: none/enter/exit';
				const optNone = document.createElement('option'); optNone.value = ''; optNone.text = 'none';
				const optEnter = document.createElement('option'); optEnter.value = 'enter'; optEnter.text = 'enter';
				const optExit = document.createElement('option'); optExit.value = 'exit'; optExit.text = 'exit';
				sel.appendChild(optNone); sel.appendChild(optEnter); sel.appendChild(optExit);
				const cur = (data && data.removeOn) ? String(data.removeOn) : (data && data.removeOnPass ? 'exit' : '');
				sel.value = cur;
				sel.addEventListener('change', () => {
					try {
						if (!counters[id]) counters[id] = {};
						const v = sel.value || null;
						counters[id].removeOn = v;
						counters[id].removeOnPass = (v === 'exit');
						if (typeof window !== 'undefined' && window.dispatchEvent) {
							window.dispatchEvent(new CustomEvent('devtools:sensor-updated', { detail: { id, type: 'config', counter: Object.assign({}, counters[id]) } }));
						}
					} catch (_) { /* no-op */ }
				});
				controlsRow.appendChild(sel);

				// パーティクルモード選択
				const pmSel = document.createElement('select');
				pmSel.style.minWidth = '140px';
				const pmOptBall = document.createElement('option'); pmOptBall.value = 'ball'; pmOptBall.text = 'particle: ball';
				const pmOptCustom = document.createElement('option'); pmOptCustom.value = 'custom'; pmOptCustom.text = 'particle: custom';
				const pmOptDefault = document.createElement('option'); pmOptDefault.value = 'default'; pmOptDefault.text = 'particle: default';
				pmSel.appendChild(pmOptBall); pmSel.appendChild(pmOptCustom); pmSel.appendChild(pmOptDefault);
				const curPm = (data && data.particleMode) ? String(data.particleMode) : (data && data.particleColor ? 'custom' : 'ball');
				pmSel.value = curPm;
				pmSel.addEventListener('change', () => {
					try {
						if (!counters[id]) counters[id] = {};
						counters[id].particleMode = pmSel.value || null;
						if (typeof window !== 'undefined' && window.dispatchEvent) {
							window.dispatchEvent(new CustomEvent('devtools:sensor-updated', { detail: { id, type: 'config', counter: Object.assign({}, counters[id]) } }));
						}
					} catch (_) { /* no-op */ }
				});
				controlsRow.appendChild(pmSel);

				// カラー入力（テキストだが幅を小さく）
				const colorInput = document.createElement('input');
				colorInput.type = 'text';
				colorInput.placeholder = '#rrggbb or css color';
				colorInput.style.minWidth = '120px';
				colorInput.value = (data && data.particleColor) ? data.particleColor : '';
				colorInput.addEventListener('change', () => {
					try {
						if (!counters[id]) counters[id] = {};
						const v = colorInput.value ? String(colorInput.value) : null;
						counters[id].particleColor = v;
						if (typeof window !== 'undefined' && window.dispatchEvent) {
							window.dispatchEvent(new CustomEvent('devtools:sensor-updated', { detail: { id, type: 'config', counter: Object.assign({}, counters[id]) } }));
						}
					} catch (_) { /* no-op */ }
				});
				controlsRow.appendChild(colorInput);

				container.appendChild(controlsRow);
			});
		}

		// 更新ボタン
		const updateBtn = document.createElement('button');
		updateBtn.textContent = '更新';
		updateBtn.style.marginTop = '4px';
		updateBtn.style.padding = '2px 6px';
		updateBtn.style.fontSize = '10px';
		updateBtn.style.border = 'none';
		updateBtn.style.borderRadius = '3px';
		updateBtn.style.background = '#2196f3';
		updateBtn.style.color = '#fff';
		updateBtn.style.cursor = 'pointer';
		updateBtn.addEventListener('click', () => {
			injectSensorCounters(); // 再描画
		});
		container.appendChild(updateBtn);

		panel.appendChild(container);
	}

	// 総発射数 (totalSpawned) を開発者パネルに追加
	function injectTotalSpawned() {
		const cfg = getCfg();
		if (!cfg || !cfg.metrics) return;

		const panel = ensureDevPanel();
		if (!panel) return;

		const existing = document.getElementById('dev-total-spawned');
		if (existing) existing.remove();

		const container = document.createElement('div');
		container.id = 'dev-total-spawned';
		container.style.marginTop = '6px';
		container.style.padding = '4px 6px';
		container.style.borderRadius = '4px';
		container.style.background = 'rgba(255,255,255,0.03)';
		container.style.fontSize = '11px';

		const title = document.createElement('div');
		title.textContent = '総発射数';
		title.style.fontWeight = '600';
		title.style.marginBottom = '4px';
		container.appendChild(title);

		const value = document.createElement('div');
		value.id = 'dev-total-spawned-val';
		value.textContent = String((cfg.metrics.totalSpawned) ?? 0);
		value.style.color = '#ffeb3b';
		container.appendChild(value);

		panel.appendChild(container);
		// 値の自動更新を容易にするため、ここで短いヘルパーを提供
		function refresh() {
			const cfgNow = getCfg();
			const el = document.getElementById('dev-total-spawned-val');
			if (el && cfgNow && cfgNow.metrics) el.textContent = String(cfgNow.metrics.totalSpawned ?? 0);
		}
		// 最初の表示反映
		refresh();
		// 1秒更新サイクルとは別に、小さなタイムアウトで初回反映を確実にする
		setTimeout(refresh, 100);
	}

	// センサー通過カウント表示とその他メトリクスを更新するヘルパー関数
	function updateSensorCounters() {
		const cfg = getCfg();
		// センサー情報の更新
		if (cfg && cfg.sensorCounters && cfg.sensorCounters.enabled) injectSensorCounters();
		// 総発射数の更新
		if (cfg && cfg.metrics) injectTotalSpawned();
	}

	// 既に main.js が初期化済み（イベント前にこのスクリプトが読むケース）へのフォールバック
	// まずは UI を出しておく（エンジン未準備でも可視化）
	if (window.__engine_for_devtools__) CURRENT_ENGINE = window.__engine_for_devtools__;
	if (ensureDevPanel()) {
		injectTimeScaleSlider();
		injectTotalSpawned();
		injectSensorCounters();
	} else {
		waitControlsAndInject();
	}

	// DOM がまだ揃っていないタイミング対策（安全側の再試行）
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			if (!document.getElementById('dev-timescale')) {
				if (ensureDevPanel()) {
					injectTimeScaleSlider();
					injectTotalSpawned();
					injectSensorCounters();
				} else {
					waitControlsAndInject();
				}
			}
		});
	} else {
		// すでに読み込み済みなら軽く再チェック
		if (!document.getElementById('dev-timescale')) {
			if (ensureDevPanel()) {
				injectTimeScaleSlider();
				injectTotalSpawned();
				injectSensorCounters();
			} else {
				waitControlsAndInject();
			}
		}
	}

	// ポーリングを廃止し、イベント駆動のみで更新する
	// 発射イベント・センサー更新イベントを受けて UI を更新する
	window.addEventListener('devtools:ball-spawned', () => {
		try { updateSensorCounters(); } catch (_) { /* no-op */ }
	});

	window.addEventListener('devtools:sensor-updated', (e) => {
		try { updateSensorCounters(); } catch (_) { /* no-op */ }
	});
})();
