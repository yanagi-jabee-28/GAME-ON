/**
 * ゲーム全体の設定、材質、および物理相互作用のロジックを定義するファイル。
 * 設定値（データ）と、それに関連する単純なロジック（振る舞い）をこのファイルに集約しています。
 */

// ゲームに登場する材質を定義します。
// この定義は他のどのファイルよりも先に読み込まれる必要があります。
const GAME_MATERIALS = {
	METAL: 'metal',
	PLASTIC: 'plastic',
};

/**
 * ゲーム全体の設定を管理するオブジェクト。
 */
const GAME_CONFIG = {
	// ▼▼▼ ゲーム全体の基本設定 ▼▼▼
	width: 650,  // ゲームエリアの描画幅 (px)
	// デザイン時の基準幅。width を変更した際、この値との差分で水平オフセットを計算します。
	baseWidth: 450,
	// デザイン時の基準高さ。height を変更した際、この値との差分で垂直オフセットを計算します。
	baseHeight: 600,
	height: 900, // ゲームエリアの描画高 (px)
	renderOptions: {
		wireframes: false, // falseにするとオブジェクトが塗りつぶされる (trueだと線画)
		background: '#ffffff', // 背景色
	},

	// ▼▼▼ オブジェクトの定義 ▼▼▼
	objects: {
		// --- ボールの定義 ---
		ball: {
			radius: 6,     // ボールの半径
			label: 'ball', // 衝突判定などで使用する識別子
			material: GAME_MATERIALS.METAL, // 材質を金属に設定
			options: {
				// restitutionとfrictionは材質ペアで定義するため、ここでは設定しない
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
			material: GAME_MATERIALS.METAL, // 材質を金属に設定
			options: {
				isStatic: true,
			},
			render: {
				fillStyle: '#555' // 塗りつぶしの色
			}
		},
		// --- 風車の定義 ---
		windmill: {
			rotationsPerSecond: 1, // 毎秒の回転数
			render: {
				fillStyle: '#ff0000' // デフォルトの色は赤（羽根）
			},
			// 歯車の中心円の塗り色（デフォルト）
			centerFill: '#333',
			// 形状のデフォルト値（ここを変えれば全体のデフォルト挙動が変わる）
			defaults: {
				centerRadius: 6,
				numBlades: 4,
				bladeLength: 20,
				bladeWidth: 5
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
		floor: {
			label: 'floor',
			options: {
				isStatic: true,
			},
			render: {
				fillStyle: '#333'
			}
		},
		// --- 役物パーツの共通定義 ---
		yakumono_blade: {
			label: 'yakumono_blade',
			material: GAME_MATERIALS.METAL,
			options: {
				density: 0.01 // ボールと同じ密度
			}
		}
	}
};

// 発射関連の調整パラメータ（UI の速度値を実際の初速に変換するためのスケール等）
GAME_CONFIG.launch = {
	// UI の px/s 値に乗じる係数。値を上げると速くなる。
	// 0.6 にして、スライダーの値がより力強い初速になるよう調整しました。
	speedScale: 0.6,
	// スライダーと一致させたい最小/最大（ここで maxSpeed を下げて上限を制御します）
	minSpeed: 30,
	maxSpeed: 50,
	// angle control: min/max degrees and default
	angleMin: 75,
	angleMax: 90,
	defaultAngle: 70
};

// 発射の初期位置設定（config で制御可能にする）
// - x: 発射点の x 座標（ピクセル、ゲームコンテナ左端を 0 とする）
// - y: 発射点の明示的な y 座標（ピクセル）を指定する場合はこちらを使います
// - yOffsetFromBottom: 明示的な y を指定しない場合、ゲーム領域の下端からのオフセットで指定します
GAME_CONFIG.launch.spawn = {
	x: -100,
	// デフォルトはコンテナ下端から 40px 上
	yOffsetFromBottom: 300
};

// 天板（上部の板）設定 - 円弧で作る場合のパラメータ
GAME_CONFIG.topPlate = {
	// 有効化フラグ。false の場合は従来どおり長方形の上壁を使います。
	enabled: true,
	// 円の半径(px)。大きいほど浅い弧になります。
	// 注意: radius が画面幅 / 2 より小さいと円弧が作成できず矩形にフォールバックします。
	//       デフォルトを画面幅に基づいて設定しておく（起動時に main.js でも再調整されます）。
	radius: Math.round((GAME_CONFIG.width || 650) * 0.6),
	// 厚み（板の高さ）
	thickness: 20,
	// 分割数（多いほど滑らか）。パフォーマンスを考慮して 24 程度が良い。
	segments: 48,
	// 板の厚み。見た目をわかりやすくするために増やす。
	thickness: 28
};

// 表示モード: 'arc'（幅に合わせた弧）または 'dome'（左右対称の半円ドーム）
GAME_CONFIG.topPlate.mode = 'dome';

// topPlate の中心オフセット（画面中央からの差分、px）
GAME_CONFIG.topPlate.centerOffsetX = 0; // 水平オフセット
GAME_CONFIG.topPlate.centerOffsetY = 0; // 垂直オフセット（正なら下に移動）


// --- 物理相互作用の定義 ---

/**
 * 材質ペアの相互作用を定義するマトリクス。
 * キーは材質名をアルファベット順にソートし、':'で結合したものです。
 */
const MATERIAL_INTERACTIONS = {
	// --- 金属同士の衝突 ---
	'metal:metal': {
		restitution: 0.8, // 挙動を安定させつつ、よく弾むように調整
		friction: 0.2     // 表面が滑らかなので摩擦は比較的小さい
	},

	// --- プラスチック同士の衝突 ---
	'plastic:plastic': {
		restitution: 0.4, // やや弾性が低い
		friction: 0.4
	},

	// --- 金属とプラスチックの衝突 ---
	'metal:plastic': {
		restitution: 0.5,
		friction: 0.3
	},

	// デフォルト値：万が一、定義されていない組み合わせがあった場合のフォールバック
	default: {
		restitution: 0.5,
		friction: 0.3
	}
};

/**
 * 二つの材質から、適用すべき物理特性（反発係数など）を取得します。
 * @param {string} materialA - 一つ目の材質名 (e.g., GAME_MATERIALS.METAL)
 * @param {string} materialB - 二つ目の材質名
 * @returns {object} {restitution, friction} のプロパティを持つオブジェクト
 */
function getMaterialInteraction(materialA, materialB) {
	// キーを生成するために、材質名をアルファベット順にソートします。
	const key = [materialA, materialB].sort().join(':');
	return MATERIAL_INTERACTIONS[key] || MATERIAL_INTERACTIONS.default;
}
