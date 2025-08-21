const GAME_CONFIG = {
	// ▼▼▼ ゲーム全体の基本設定 ▼▼▼
	// ゲームエリアの描画サイズ（ピクセル単位）
	width: 450,
	height: 600,

	// ▼▼▼ オブジェクトの寸法設定 ▼▼▼
	// ボールの半径（直径はこの値の2倍になります）
	ballRadius: 6,
	// 釘の半径
	pegRadius: 5,

	// ▼▼▼ 物理挙動に関する設定 ▼▼▼
	// ボールの物理特性
	ballOptions: {
		restitution: 0.8, // 反発係数 (0に近いほど弾まず、1に近いほどよく弾む)
		friction: 0.05,   // 摩擦 (0に近いほど滑りやすい)
		density: 0.01,    // 密度 (値が大きいほど重くなる)
	},
	// 釘の物理特性
	pegOptions: {
		isStatic: true,   // trueにするとその場に固定される
		restitution: 0.5, // 釘の反発係数
		friction: 0.1,    // 釘の摩擦
	},
	// 壁の物理特性
	wallOptions: {
		isStatic: true,   // 壁を固定する
	},

	// ▼▼▼ 描画に関する設定 ▼▼▼
	// レンダリング全体のオプション
	renderOptions: {
		wireframes: false, // falseにするとオブジェクトが塗りつぶされる (trueだと線画)
		background: '#ffffff', // 背景色
	},
	// 釘の見た目
	pegRender: {
		fillStyle: '#555' // 塗りつぶしの色
	},
	// 壁の見た目
	wallRender: {
		fillStyle: '#333' // 塗りつぶしの色
	}
};

