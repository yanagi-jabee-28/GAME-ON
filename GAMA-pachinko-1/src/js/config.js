(function () {
	window.CONFIG = {
		// 全般設定
		GAME_WIDTH: 450,
		GAME_HEIGHT: 700,
		ENABLE_WALL_MISS: true,

		// 物理設定 / ワールド
		GRAVITY_Y: 1,
		GLOBAL_X_OFFSET: 0,

		// 壁 / ガイド配置
		GUIDE_WALL_OFFSET: 200,
		GUIDE_WALL_ANGLE: 0.2,

		// ゲートのタイミング / 角度
		GATE_OPEN_MS: 300,
		GATE_CLOSED_MS: 300,
		GATE_ANGLE_IN_DEGREES: true,
		GATE_OPEN_ANGLE_DEG: 157.5,
		GATE_CLOSED_ANGLE_DEG: 110,
		GATE_LENGTH: 45,
		GATE_WIDTH: 10,
		GATE_RESTITUTION: 0.6,

		// 風車（ウィンドミル）
		WINDMILL: {
			baseSpeed: 0.1,
			leftCW: false,
			rightCW: true,
			centerCW: true,
			blades: 4,
			radius: 40,
			bladeW: 8,
			bladeH: 40,
			color: '#f39c12',
			hubColor: '#7f8c8d'
		},
		ENABLE_CENTER_WINDMILL: false,

		// ペグ（釘）配置設定
		PEG_SPACING: 35,
		PEG_RADIUS: 3,
		PEG_CLEARANCE: 2,

		// ボール設定
		BALL_RADIUS: 5, // ボール半径（px）
		BALL_RESTITUTION: 0.85, // ボールの反発係数（<=1 を推奨）
		BALL_AIR_FRICTION: 0.02, // ボールの空気抵抗
		PEG_RESTITUTION: 0.6, // ペグの反発係数（<=1 を推奨）
		GUARD_RESTITUTION: 0.5,
		WINDMILL_RESTITUTION: 0.98,
		DROP_INTERVAL_MS: 100,
		BALLS_INTERACT: true,
		BALL_GROUP_ID: 1000,

		// エディタ
		EDITOR_ENABLED: true,

		// ボール落下の分布
		DROP: {
			width: 250,
			std: 60,
			useNormal: true,
			showGraph: false
		},

		// プリセット読み込み
		PRESETS: {
			preserveExact: true
		},

		// オーディオ設定
		MASTER_VOLUME: 0.4,
		MUTED: false,
		SFX: {
			tulip: { gain: 0.9, freq: 880, type: 'sine', dur: 0.08 },
			chucker: { gain: 0.8, freq: 240, type: 'triangle', dur: 0.12 },
			windmill: { gain: 0.5, freq: 600, type: 'square', dur: 0.05 },
			miss: { gain: 0.28, freq: 120, type: 'sawtooth', dur: 0.08 },
			debris: { freq: 200, type: 'triangle', gain: 0.15, dur: 0.04 }
		},

		// レイアウトと見た目の設定
		LAYOUT: {
			walls: {
				guideY: 450,
				guideWidth: 10,
				guideHeight: 500,
				color: '#95a5a6'
			},
			missZones: {
				center: { y: 230, width: 40, height: 5, color: 'rgba(192,57,43,0.35)', stroke: 'rgba(192,57,43,0.7)' },
				floor: { y_offset: -20, color: 'rgba(192, 58, 43, 0)', stroke: 'rgba(192, 58, 43, 0)' }
			},
			windmills: {
				offsetX: 87.5,
				y: 320,
				centerY: 470,
				items: [
					{ x_offset: -87.5, y: 320, blades: 5, radius: 36, bladeW: 8, bladeH: 40, cw: false },
					{ x_offset: 87.5, y: 320, blades: 5, radius: 36, bladeW: 8, bladeH: 40, cw: true },
					{ x_offset: -120, y: 540, blades: 4, radius: 32, bladeW: 6, bladeH: 30, cw: true, speedMultiplier: 1.5 },
					{ x_offset: 120, y: 540, blades: 4, radius: 32, bladeW: 6, bladeH: 30, cw: false, speedMultiplier: 1.5 }
				]
			},
			gates: {
				y: 520,
				offsetX: 44,
				length: 60,
				width: 10,
				color: '#c0392b'
			},
			features: {
				chucker: { y: 580, width: 36, height: 10, color: '#e67e22' },
				tulip: { x: 120, y: 450, width: 32, height: 10, color: '#3498db' },
				guards: [],
				fenceColor: '#7f8c8d',
				chuckerFence: { y: 560, height: 40, thickness: 6, offsetX: 26 },
				tulipFence: { y: 450, height: 36, thickness: 6, offsetX: 22 }
			},
			pegs: {
				color: '#bdc3c7',
				y_start: 90,
				y_end: 470,
				y_step: 28,
				x_margin: 24,
				y_margin_top: 40,
				y_margin_bottom: 560,
				exclusionZones: [
					{ type: 'circle', x_offset: -80, y: 320, r: 42 },
					{ type: 'circle', x_offset: 80, y: 320, r: 42 },
					{ type: 'circle', x_offset: 0, y: 565, r: 56 },
					{ type: 'rect', x: 120, y: 430, w: 52, h: 46 },
					{ type: 'rect', x_right: 120, y: 430, w: 52, h: 46 }
				]
			},
			ballColors: {
				default: '#ffffffff',
				fromBlue: '#3498db',
				fromNavy: '#ffd700'
			}
		}
	};
})();