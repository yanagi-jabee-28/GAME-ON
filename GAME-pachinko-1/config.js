const GAME_CONFIG = {
	// 寸法設定 (px)
	width: 450,
	height: 600,
	ballRadius: 6, // ボールの半径（直径はこの2倍）
	pegRadius: 3,  // 釘の半径

	// 物理設定
	ballOptions: {
		restitution: 0.8, // 反発係数
		friction: 0.05,   // 摩擦
		density: 0.01,    // 密度
	},
	pegOptions: {
		isStatic: true,
		restitution: 0.5,
		friction: 0.1,
	},
	wallOptions: {
		isStatic: true,
	},

	// 描画設定
	renderOptions: {
		wireframes: false, // ワイヤーフレーム表示を無効化
		background: '#ffffff',
	},
	pegRender: {
		fillStyle: '#555' // 釘の色
	},
	wallRender: {
		fillStyle: '#333' // 壁の色
	}
};
