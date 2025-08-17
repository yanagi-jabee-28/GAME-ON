(function () {
	window.CONFIG = {
		// Physics / world
		GRAVITY_Y: 0.6,
		GLOBAL_X_OFFSET: 0,
		// Walls / guides
		GUIDE_WALL_OFFSET: 200, // 壁の左右間隔（中央からの距離）
		GUIDE_WALL_ANGLE: 0.2,
		// Gate timings / angles
		GATE_OPEN_MS: 600,
		GATE_CLOSED_MS: 400,
		GATE_OPEN_ANGLE: 2.3,
		GATE_CLOSED_ANGLE: 0.3,
		// Windmills: base speed magnitude + boolean direction flags
		WINDMILL: {
			baseSpeed: 0.08,
			leftCW: false,   // 左風車の回転方向: true=clockwise, false=counter
			rightCW: true,   // 右風車の回転方向
			centerCW: true,  // 中央風車の回転方向
			blades: 4,
			radius: 40,
			bladeW: 8,
			bladeH: 40,
			color: '#f39c12'
		},
		ENABLE_CENTER_WINDMILL: false,
		// Pegs
		PEG_SPACING: 35,
		PEG_ROWS: 18,
		TOP_ROW_YS: [20, 50],
		// Balls
		BALL_RADIUS: 5,
		DROP_INTERVAL_MS: 80,
		// Audio
		MASTER_VOLUME: 0.4,
		MUTED: false,
		SFX: {
			tulip: { gain: 0.9, freq: 880, type: 'sine', dur: 0.08 },
			chucker: { gain: 0.8, freq: 240, type: 'triangle', dur: 0.12 },
			windmill: { gain: 0.5, freq: 600, type: 'square', dur: 0.05 },
			miss: { gain: 0.5, freq: 120, type: 'sawtooth', dur: 0.08 }
		}
	};
})();
