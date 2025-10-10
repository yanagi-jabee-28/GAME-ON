/**
 * ゲーム全体の設定、材質、および物理相互作用のロジックを定義するファイル。
 * 設定値（データ）と、それに関連する単純なロジック（振る舞い）をこのファイルに集約しています。
 *'#ffffffff'
 */

// 静的アセットのURLをインポート
// 参照: https://ja.vite.dev/guide/assets
import objectsPresetsUrl from "../objects-presets/default.json?url";
import pegsPresetsUrl from "../pegs-presets/pegs4.json?url";

// ゲームに登場する材質を定義します。
// この定義は他のどのファイルよりも先に読み込まれる必要があります。
const GAME_MATERIALS = {
	METAL: "metal",
	METAL2: "metal2",
	TAMA: "tama",
	PLASTIC: "plastic",
	TOP_PLATE: "top_plate",
	GUIDE: "guide",
	DECOR: "decor",
};

/**
 * ゲーム全体の設定を管理するオブジェクト。
 * シンプルで再利用しやすい構造を目指しています。
 */
const GAME_CONFIG: any = {
	// ------------------ 基本設定 (表示・物理) ------------------
	// ゲームキャンバスの基準サイズと実際の描画領域
	dimensions: { width: 650, height: 900, baseWidth: 450, baseHeight: 675 }, // width/height: 描画用の論理サイズ

	// レンダラとデバッグ表示に関する設定
	render: {
		wireframes: false, // true でワイヤフレーム描画（デバッグ用）
		background: "hsl(220, 12%, 15%)", // キャンバス背景色
		showDebug: false, // デバッグ系をまとめてON/OFF
		showBroadphase: false, // 衝突検出領域の表示
		showPerformance: false, // FPS 等の統計表示
		showBounds: false, // 各ボディAABBを描画
		showVelocity: false, // 速度ベクトルを描画
		showCollisions: false, // 衝突点・法線の可視化
		showSeparations: false,
		showAxes: false,
		showPositions: false,
		showAngleIndicator: false,
	},

	// 物理エンジンの安定性/パフォーマンス設定
	physics: {
		positionIterations: 12, // 位置解決の反復回数 (安定性)
		velocityIterations: 8, // 速度解決の反復回数
		constraintIterations: 6,
		substeps: 4, // 1フレームを分割する物理サブステップ数
		fixedFps: 60, // 物理の基準FPS
		adaptiveSubsteps: true, // 実行時にサブステップを調整する
		paused: false, // 一時停止フラグ（UIで切替）
		timeScale: 1, // 世界時間倍率（スローモーション等に使用）
		gravityY: 1.5, // Y方向重力の強さ（正: 下向き）
	},

	// ------------------ UI / UX ------------------
	ui: { outerBackground: "#EDE8DB", labelColor: "#333" }, // ページ背景とラベル色

	// ------------------ 発射 (launch) 関連 ------------------
	// UI スライダーや長押し連射の挙動をまとめたセクション
	launch: {
		speedScale: 1, // スライダー -> px/s 変換の乗数
		speedPrecision: 2, // 速度表示の小数桁数
		minSpeed: 29, // スライダー最小レンジ（px/s ベース）
		maxSpeed: 39.3, // スライダー最大レンジ
		angleMin: 0, // 発射角度の下限（度）
		angleMax: 180, // 発射角度の上限（度）
		defaultAngle: 120, // スライダー未指定時の初期角度
		angleRandomness: 0.5, // 発射時の角度ランダム幅（度）
		holdToFireEnabled: true, // 長押しで連射を有効にするか
		holdIntervalMs: 250, // 連射間隔 (ms)
		holdFirstShotDelayMs: 10, // 長押し開始から初回発射までの遅延 (ms)
		ammo: 100, // デフォルト持ち玉（残弾）
		ammoGainOnSensor: 100, // センサー入賞で付与される玉数
		spawn: { x: -70, yOffsetFromBottom: 350 }, // 初期発射点（画面右下基準のオフセット）
		pad: {
			// 発射台の見た目設定（UI側で動的変更されることがある）
			visible: true,
			width: 15,
			height: 50,
			borderRadius: 8,
			background: "#2F3B45",
			borderColor: "#fff",
			layer: 2,
			offsetY: 25,
		},
	},

	// ------------------ エフェクト / ビジュアル ------------------
	effects: {
		floor: {
			removeBall: true, // 床での玉削除を行う
			particle: {
				enabled: true,
				mode: "ball",
				color: null,
				count: 12,
				lifeMs: 700,
			}, // 床ヒット時のパーティクル
		},
	},

	// ------------------ メトリクス / 報酬 ------------------
	metrics: { totalSpawned: 0 },
	rewards: {
		slotWinAmmoMultiplier: 10,
		slotWinMessageTemplate: "スロット当たり！ {adjusted}玉", // 表示テンプレート
		slotWinMessageMs: 2200,
		sensorEnterMessageTemplate: "入賞！{gain}玉",
	},

	// ------------------ 物体デフォルト定義 ------------------
	// 各オブジェクトの物理パラメータや描画デフォルトをここで定義
	objects: {
		ball: {
			radius: 6,
			label: "ball",
			material: GAME_MATERIALS.TAMA,
			options: { density: 0.01 },
			render: { fillStyle: "hsla(345, 100%, 85%, 1.00)", layer: 1 },
			randomColor: false,
		}, // ボール
		peg: {
			radius: 4,
			label: "peg",
			material: GAME_MATERIALS.METAL,
			options: { isStatic: true },
			render: { fillStyle: "#778899", layer: 1 },
		}, // 釘
		windmill: {
			rotationsPerSecond: 1,
			bladeColor: "hsl(210, 100%, 50%)",
			centerColor: "hsl(200, 19%, 18%)",
			defaults: {
				centerRadius: 6,
				numBlades: 4,
				bladeLength: 20,
				bladeWidth: 5,
			},
		}, // 風車
		wall: {
			label: "wall",
			material: GAME_MATERIALS.TOP_PLATE,
			options: { isStatic: true },
			render: { fillStyle: "#333", layer: 1 },
		},
		floor: {
			label: "floor",
			options: { isStatic: true },
			render: { fillStyle: "#333", layer: 1 },
		},
		topPlateBody: {
			label: "top-plate",
			material: GAME_MATERIALS.TOP_PLATE,
			options: { isStatic: true },
			render: { fillStyle: "#333", layer: 1 },
		},
		yakumono_blade: {
			label: "yakumono_blade",
			material: GAME_MATERIALS.PLASTIC,
			options: { density: 0.025 },
			render: { layer: 1 },
		},
		rect: {
			label: "guide_rect",
			material: GAME_MATERIALS.GUIDE,
			options: { isStatic: true },
			render: { fillStyle: "#B0C4DE", layer: 1 },
		},
		polygon: {
			label: "guide_polygon",
			material: GAME_MATERIALS.GUIDE,
			options: { isStatic: true },
			render: { fillStyle: "#66bb6a", layer: 1 },
		},
		decor: {
			label: "decor",
			material: GAME_MATERIALS.DECOR,
			options: { isSensor: true, isStatic: true },
			render: { fillStyle: "#9e9e9e", layer: 1 },
		},
		decorPolygon: {
			label: "decor_polygon",
			material: GAME_MATERIALS.DECOR,
			options: { isSensor: true, isStatic: true },
			render: { fillStyle: "#9e9e9e", layer: 1 },
		},
	},

	// ------------------ 埋め込みスロット音量 ------------------
	slotAudio: {
		masterVolume: 0.2,
		volumes: { spinStart: 1.0, reelStop: 0.6, win: 1.0 },
	}, // slot の音量倍率

	// ------------------ 開発者用設定 / プリセット ------------------
	dev: {
		enabled: true,
		hotkeys: { toggle: "F1", wire: "F2", collide: "F3", bounds: "F4" },
	},
	presets: { pegs: pegsPresetsUrl, objects: objectsPresetsUrl },
	sensorCounters: { enabled: true, counters: {} },

	// ------------------ 天板 (topPlate) の描画/形状設定 ------------------
	topPlate: {
		enabled: true, // true: 円弧天板を使う
		radius: 355, // 円弧の半径(px)
		segments: 60, // ポリゴン分割数（多いほど滑らか）
		thickness: 25, // 見た目の厚み
		slop: 0.007, // 衝突許容オーバーラップ
		centerOffsetX: 0,
		centerOffsetY: -15,
		color: "hsl(190,80%,70%)",
		useSinglePolygon: false,
		mode: "dome", // 'dome' or 'arc'
	},
};

// Note: launch/spawn/pad/topPlate/dev/presets/sensorCounters
// have been consolidated into the main GAME_CONFIG object above.
// The duplicate assignments that used to appear here were removed
// to keep the configuration file single-sourced and easier to read.

/**
 * 材質ペアの相互作用を定義するマトリクス。
 * キーは材質名をアルファベット順にソートし、':'で結合したものです。
 */
const MATERIAL_INTERACTIONS = {
	// 装飾は常に非干渉（レンダリングのみ） - 明示的に定義しておく（getMaterialInteraction でもガードあり）
	"decor:decor": { restitution: 0, friction: 0 },
	"decor:guide": { restitution: 0, friction: 0 },
	"decor:metal": { restitution: 0, friction: 0 },
	"decor:metal2": { restitution: 0, friction: 0 },
	"decor:plastic": { restitution: 0, friction: 0 },
	"decor:tama": { restitution: 0, friction: 0 },
	"decor:top_plate": { restitution: 0, friction: 0 },

	// ガイド同士 / ガイドと各材質
	"guide:guide": { restitution: 0.1, friction: 0.6 }, // ガイドは摩擦高めでボールの速度を調整
	"guide:metal": { restitution: 0.2, friction: 0.2 },
	"guide:metal2": { restitution: 0.2, friction: 0.2 },
	"guide:plastic": { restitution: 0.15, friction: 0.4 },
	"guide:tama": { restitution: 0.4, friction: 0.3 },
	"guide:top_plate": { restitution: 0, friction: 0 }, // 境界扱い（非反発・非摩擦）

	// 金属系
	"metal:metal": { restitution: 0.7, friction: 0.1 },
	"metal:metal2": { restitution: 0.7, friction: 0 },
	"metal:plastic": { restitution: 0.5, friction: 0.3 },
	"metal:tama": { restitution: 0.5, friction: 0.1 },
	"metal:top_plate": { restitution: 0, friction: 0 },

	// metal2（準金属）関連
	"metal2:metal2": { restitution: 0.6, friction: 0.08 },
	"metal2:plastic": { restitution: 0.5, friction: 0.25 },
	"metal2:tama": { restitution: 0.3, friction: 0.05 },
	"metal2:top_plate": { restitution: 0, friction: 0 },

	// プラスチック系
	"plastic:plastic": { restitution: 0.4, friction: 0.4 },
	"plastic:tama": { restitution: 0.45, friction: 0.2 },
	"plastic:top_plate": { restitution: 0, friction: 0 },

	// 玉（ボール）関連（tama:tama は高反発）
	"tama:tama": { restitution: 0.9, friction: 0.05 },
	"tama:top_plate": { restitution: 0, friction: 0 },

	// 天板同士（冗長だが明示）
	"top_plate:top_plate": { restitution: 0, friction: 0 },

	// フォールバック（未定義の組み合わせ用）
	default: {
		restitution: 0,
		friction: 0,
	},
};

// MATERIAL_INTERACTIONS のキーは 'a:b' (アルファベット順) を想定します。
// 未定義の組み合わせについては default を返します。

/**
 * 二つの材質から、適用すべき物理特性（反発係数など）を取得します。
 * @param {string} materialA - 一つ目の材質名 (e.g., GAME_MATERIALS.METAL)
 * @param {string} materialB - 二つ目の材質名
 * @returns {object} {restitution, friction} のプロパティを持つオブジェクト
 */
function getMaterialInteraction(materialA, materialB) {
	// キーを生成するために、材質名をアルファベット順にソートします。
	const a = (materialA || "").toString().toLowerCase();
	const b = (materialB || "").toString().toLowerCase();
	// 装飾（decor）は常に非干渉（摩擦0・反発0）
	if (
		a === GAME_MATERIALS.DECOR ||
		b === GAME_MATERIALS.DECOR ||
		a === "decor" ||
		b === "decor"
	) {
		return { restitution: 0, friction: 0 };
	}
	const key = [materialA, materialB].sort().join(":"); // 例: ['metal','tama'] -> 'metal:tama'
	return MATERIAL_INTERACTIONS[key] || MATERIAL_INTERACTIONS.default; // フォールバック
}

export { GAME_CONFIG, GAME_MATERIALS, getMaterialInteraction };
