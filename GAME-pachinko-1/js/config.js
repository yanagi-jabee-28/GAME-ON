/**
 * ゲーム全体の設定を管理するオブジェクト。
 * このファイルは、ゲームの「設計図」や「仕様書」の役割を果たします。
 * オブジェクトの物理特性、見た目、ゲームエリアのサイズなど、
 * 調整が必要になりそうな値はここに集約します。
 */
const GAME_CONFIG = {
	// ▼▼▼ ゲーム全体の基本設定 ▼▼▼
	width: 450,  // ゲームエリアの描画幅 (px)
	height: 600, // ゲームエリアの描画高 (px)
	renderOptions: {
		wireframes: false, // falseにするとオブジェクトが塗りつぶされる (trueだと線画)
		background: '#ffffff', // 背景色
	},

	// ▼▼▼ オブジェクトの定義 ▼▼▼
	// 将来新しいオブジェクトを追加する場合は、このセクションに定義を追加します。
	objects: {
		// --- ボールの定義 ---
		ball: {
			radius: 6,     // ボールの半径
			label: 'ball', // 衝突判定などで使用する識別子
			options: {
				restitution: 0.8, // 反発係数 (0に近いほど弾まず、1に近いほどよく弾む)
				friction: 0.05,   // 摩擦 (0に近いほど滑りやすい)
				density: 0.01,    // 密度 (値が大きいほど重くなる)
			},
			render: {
				// fillStyleは動的に変わるため、ここでは定義しない
			}
		},
		// --- 釘の定義 ---
		peg: {
			radius: 5,
			label: 'peg',
			options: {
				isStatic: true,   // trueにするとその場に固定される
				restitution: 0.5, // 釘の反発係数
				friction: 0.1,    // 釘の摩擦
			},
			render: {
				fillStyle: '#555' // 塗りつぶしの色
			}
		},
		// --- 壁の定義 ---
		wall: {
			label: 'wall',
			options: {
				isStatic: true,
			},
			render: {
				fillStyle: '#333'
			}
		},
		// --- 床の定義 ---
		// 壁と基本は同じだが、衝突判定のためにラベルを分けて管理
		floor: {
			label: 'floor',
			options: {
				isStatic: true,
			},
			render: {
				fillStyle: '#333'
			}
		}
	}
};

