(function () {
	window.CONFIG = {
		// General
		GAME_WIDTH: 450,
		GAME_HEIGHT: 700,
		ENABLE_WALL_MISS: true,

		// Physics / world
		GRAVITY_Y: 0.6,
		GLOBAL_X_OFFSET: 0,

		// Walls / guides
		GUIDE_WALL_OFFSET: 200, // 壁の左右間隔（中央からの距離）
		GUIDE_WALL_ANGLE: 0.2,

		// Gate timings / angles
		GATE_OPEN_MS: 600,
		GATE_CLOSED_MS: 400,
		// Angles: you can specify in degrees (recommended) using the *_DEG keys below.
		// For backward compatibility, the old radian keys remain supported.
		GATE_OPEN_ANGLE: 2.3,
		GATE_CLOSED_ANGLE: 0.3,
		// Whether to interpret gate angles using degree-based config keys
		// If true, *_DEG keys are used (and converted to radians). If false, the
		// legacy radian keys are used. Set to true to use human-friendly degrees.
		GATE_ANGLE_IN_DEGREES: true,
		// Preferred: human-friendly degree values. Example: 2.3 rad ≈ 132 deg
		GATE_OPEN_ANGLE_DEG: 132,
		GATE_CLOSED_ANGLE_DEG: 17.2,

		// Windmills: base speed magnitude + boolean direction flags
		WINDMILL: {
			baseSpeed: 0.1,
			leftCW: false,   // 左風車の回転方向: true=clockwise, false=counter
			rightCW: true,   // 右風車の回転方向
			centerCW: true,  // 中央風車の回転方向
			blades: 4,
			radius: 40,
			bladeW: 8,
			bladeH: 40,
			color: '#f39c12',
			hubColor: '#7f8c8d'
		},
		ENABLE_CENTER_WINDMILL: false,

		// Pegs
		PEG_SPACING: 35,
		PEG_RADIUS: 3,
		PEG_CLEARANCE: 2,

		// Balls
		BALL_RADIUS: 5,
		DROP_INTERVAL_MS: 50,
		BALLS_INTERACT: true,
		BALL_GROUP_ID: 1000,

		// Audio
		MASTER_VOLUME: 0.4,
		MUTED: false,
		SFX: {
			tulip: { gain: 0.9, freq: 880, type: 'sine', dur: 0.08 },
			chucker: { gain: 0.8, freq: 240, type: 'triangle', dur: 0.12 },
			windmill: { gain: 0.5, freq: 600, type: 'square', dur: 0.05 },
			miss: { gain: 0.28, freq: 120, type: 'sawtooth', dur: 0.08 },
			debris: { freq: 200, type: 'triangle', gain: 0.15, dur: 0.04 }
		},

		// Layout & Appearance
		LAYOUT: {
			walls: {
				guideY: 450,
				guideWidth: 10,
				guideHeight: 500,
				color: '#95a5a6'
			},
			missZones: {
				center: { y: 230, width: 40, height: 5, color: 'rgba(192,57,43,0.35)', stroke: 'rgba(192,57,43,0.7)' },
				floor: { y_offset: -20, color: 'rgba(192,57,43,0.12)', stroke: 'rgba(192,57,43,0.25)' }
			},
			windmills: {
				offsetX: 87.5,
				y: 320,
				centerY: 470
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
					{ type: 'circle', x_offset: -80, y: 320, r: 42 }, // left windmill
					{ type: 'circle', x_offset: 80, y: 320, r: 42 }, // right windmill
					{ type: 'circle', x_offset: 0, y: 565, r: 56 },      // chucker
					{ type: 'rect', x: 120, y: 430, w: 52, h: 46 }, // left tulip
					{ type: 'rect', x_right: 120, y: 430, w: 52, h: 46 } // right tulip
				]
			},
			ballColors: {
				default: '#ecf0f1',
				fromBlue: '#3498db',
				fromNavy: '#ffd700'
			}
		}
	};
})();