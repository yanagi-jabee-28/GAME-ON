(function () {
	window.CONFIG = {
		// 全般設定
		// このセクションではゲーム画面や基本的な動作を決めます。
		// 単位: 位置・長さはピクセル、時間はミリ秒で指定します。
		GAME_WIDTH: 450, // ゲーム領域の横幅（px）
		GAME_HEIGHT: 700, // ゲーム領域の高さ（px）
		ENABLE_WALL_MISS: true, // 壁に当たった場合にミス判定を有効にするか

		// 物理設定 / ワールド
		// 重力係数などの物理系に関するパラメータ。
		// 注意: Matter.js の単位は任意ですが、見た目と安定性を考慮して値を微調整してください。
		GRAVITY_Y: 0.6, // 重力の強さ（下方向）
		GLOBAL_X_OFFSET: 0, // 全体の水平オフセット（px）

		// 壁 / ガイド配置
		// ガイドは画面内でボールの流れを制御する静的オブジェクトです。
		// GUIDE_WALL_OFFSET は中央から左右ガイドまでの水平距離(px)を指定します。
		GUIDE_WALL_OFFSET: 200, // 壁の左右間隔（中央からの距離）
		GUIDE_WALL_ANGLE: 0.2,

		// ゲートのタイミング / 角度
		// ゲートは交互に開閉してボールの流れを制御します。
		// GATE_OPEN_MS / GATE_CLOSED_MS はそれぞれ開いている時間、閉じている時間（ms）です。
		GATE_OPEN_MS: 300,
		GATE_CLOSED_MS: 300,
		// 角度: 以下の *_DEG キーで度数を指定できます（推奨）。
		// 下位互換のため、従来のラジアン指定も引き続きサポートしています。
		// ヒント: デバッグやチューニング時は度数で設定すると直感的です。
		GATE_OPEN_ANGLE: 2.3,
		GATE_CLOSED_ANGLE: 0.3,
		// ゲート角度を度数ベースの設定で解釈するかどうか。
		// true の場合は *_DEG キーの値を度として扱い、ラジアンに変換します。
		// false の場合は従来のラジアン値を使用します。度単位の指定を推奨します。
		GATE_ANGLE_IN_DEGREES: true,
		// 推奨: 人間に扱いやすい度数で指定してください。例: 2.3 ラジアン ≒ 132 度
		// 小さな角度変更でもゲートの挙動（ボールの流れ）が大きく変わるので注意してください。
		GATE_OPEN_ANGLE_DEG: 175,
		GATE_CLOSED_ANGLE_DEG: 110,

		// トップレベルでゲートのサイズを素早く調整するためのデフォルト値
		// これらは LAYOUT.gates の設定より優先されます。
		GATE_LENGTH: 45,
		GATE_WIDTH: 10,

		// 風車（ウィンドミル）: 基本回転速度と回転方向フラグ
		// 各風車は見た目のパーツとして静的に追加され、独自に Body 操作で回転させています。
		// baseSpeed は角速度に相当する値で、小さくするとゆっくり、大きくすると速く回転します。
		WINDMILL: {
			baseSpeed: 0.1, // 風車の基本回転速度（角速度に相当）
			// maxAngularStep: 1フレーム内での最大角度変化（ラジアン）。
			// 高速回転によるトンネリング（すり抜け）を抑えるために利用します。
			// 小さくするとより精密に回転しますが、見た目の速度は抑制されます。
			maxAngularStep: 0.08,
			leftCW: false,   // 左風車の回転方向: true=時計回り
			rightCW: true,   // 右風車の回転方向: true=時計回り
			centerCW: true,  // 中央風車の回転方向
			blades: 4, // ブレード枚数
			radius: 40, // 風車の半径（px）
			bladeW: 8, // ブレード幅（px）
			bladeH: 40, // ブレード長さ（px）
			color: '#f39c12', // ブレードの色
			hubColor: '#7f8c8d' // 中心ハブの色
		},
		ENABLE_CENTER_WINDMILL: false, // 中央に風車を追加するかどうか

		// ペグ（釘）配置設定
		// PEG_SPACING: 行間の横方向ステップ（px）。
		// PEG_RADIUS: ペグの半径（px）。
		// PEG_CLEARANCE: ボールとペグの最小クリアランスに使われます（見た目や衝突安定性の調整用）。
		PEG_SPACING: 35, // ペグの水平間隔（px）
		PEG_RADIUS: 3, // ペグ半径（px）
		PEG_CLEARANCE: 2, // ペグとボールのクリアランス（px）

		// ボール設定
		// BALL_RADIUS: ボール半径（px）。物理シミュレーションの安定性に影響します。
		// DROP_INTERVAL_MS: 連続ドロップ時の間隔（ms）
		// BALLS_INTERACT: true の場合、ボール同士が衝突します（パフォーマンスに影響する場合があります）。
		BALL_RADIUS: 5, // ボール半径（px）
		DROP_INTERVAL_MS: 50, // 自動連続ドロップ時の間隔（ms）
		BALLS_INTERACT: true, // ボール同士の衝突を有効にするか
		BALL_GROUP_ID: 1000, // ボール衝突グループID

		// エディタ: 実行時のエディタUIおよびAPIを有効/無効にするグローバルフラグ
		// 開発用に搭載したランタイムエディタを完全に無効化したい場合は false にしてください。
		// false にすると UI パネルと編集操作は読み込まれません（本番環境向け）。
		EDITOR_ENABLED: true, // ランタイムエディタを有効にするフラグ（開発時は true 推奨）

		// ボール落下の分布: 横方向の広がりとサンプリング方法を制御します。
		// - DROP.width: 中心位置を基準とした投下幅の合計（px）。例えば width:200 の場合、中心 ±100px の範囲が落下対象になります。
		// - DROP.std: 正規分布でサンプリングする場合の標準偏差（px）。小さくすると中心により集中します。
		//            指定が無い場合は幅に基づく安全なデフォルト値が使われます。
		// - DROP.useNormal: true=正規分布（中心寄り）、false=一様分布（均等）。デバッグや難易度調整で切り替えてください。
		// - showGraph: 開発用に分布カーブを画面上に表示します（負荷はほとんどありません）。
		DROP: {
			width: 250, // 投下範囲の合計幅（px）。中心 ± width/2 が有効範囲
			std: 60, // 正規分布の標準偏差（px）
			useNormal: true, // true で正規分布（中心寄せ）、false で一様分布
			// 開発用: true にすると画面上部に分布グラフを表示します
			showGraph: false
		},

		// プリセット読み込み時の挙動オプション
		// - preserveExact: true の場合、JSON プリセット内の座標をそのまま忠実に再現します（exclusion を無視）。
		//   false の場合は exclusion/proximity チェックを適用して安全に配置します。
		PRESETS: {
			preserveExact: true
		},

		// デバッグ: ペグとボールの衝突回数に基づくヒートマップ表示
		DEBUG: {
			PEGS_HEATMAP: false, // true にすると衝突回数に応じてペグ色をグラデーション表示する
			HEATMAP_MAX: 12, // 正規化に使う最大衝突回数（これを越えると最大色になる）
			HEATMAP_BASE_COLOR: [255, 255, 255], // デバッグ時のベースカラー（白）
			HEATMAP_TARGET_COLOR: [255, 60, 60], // 衝突回数が最大のときの色（赤系）
			// Rainbow test: enable automatic rainbow gradient across pegs at startup
			PEG_RAINBOW_ENABLED: false,
			PEG_RAINBOW_MS: 120
		},

		// オーディオ設定
		// MASTER_VOLUME は全体音量（0.0 - 1.0）。ミュート時は MUTED を true にします。
		// SFX: 細かな効果音設定（簡易的なパラメータでサイン波などを生成する想定）。
		MASTER_VOLUME: 0.4, // 全体音量 (0.0 - 1.0)
		MUTED: false, // true にすると音声を無効化
		SFX: {
			tulip: { gain: 0.9, freq: 880, type: 'sine', dur: 0.08 },
			chucker: { gain: 0.8, freq: 240, type: 'triangle', dur: 0.12 },
			windmill: { gain: 0.5, freq: 600, type: 'square', dur: 0.05 },
			miss: { gain: 0.28, freq: 120, type: 'sawtooth', dur: 0.08 },
			debris: { freq: 200, type: 'triangle', gain: 0.15, dur: 0.04 }
		},

		// レイアウトと見た目の設定
		// このセクションではステージ上のオブジェクト位置（風車、ゲート、チューリップ等）の
		// 初期配置と描画色を定義します。座標は画面左上を原点(0,0)とするピクセル単位です。
		LAYOUT: {
			walls: {
				guideY: 450, // ガイド壁の垂直位置（px）
				guideWidth: 10, // ガイド壁の幅（px）
				guideHeight: 500, // ガイド壁の高さ（px）
				color: '#95a5a6' // ガイド壁の色
			},
			missZones: {
				center: { y: 230, width: 40, height: 5, color: 'rgba(192,57,43,0.35)', stroke: 'rgba(192,57,43,0.7)' },
				floor: { y_offset: -20, color: 'rgba(192,57,43,0.12)', stroke: 'rgba(192,57,43,0.25)' }
			},
			windmills: {
				offsetX: 87.5, // 中央から風車までの水平オフセット（px）
				y: 320, // 風車の垂直位置（px）
				centerY: 470, // 中央風車の垂直位置（px）
				// items: ここに複数の風車／ギアを宣言できます。各アイテムは個別に設定を上書きできます。
				// 各アイテムは中央からの相対位置を示す `x_offset`、または絶対位置の `x` を指定できます。
				// 例: { x_offset: -87.5, y:320, blades:4 } のように指定すると、中央から左に 87.5px の位置に風車が置かれます。
				items: [
					{ x_offset: -87.5, y: 320, blades: 4, radius: 40, bladeW: 8, bladeH: 40, cw: false },
					{ x_offset: 87.5, y: 320, blades: 4, radius: 40, bladeW: 8, bladeH: 40, cw: true }
					// 下側に追加する歯車ペア（開発用）: 中央より下に小さめの風車を追加します
					, { x_offset: -130, y: 520, blades: 5, radius: 32, bladeW: 6, bladeH: 30, cw: true, speedMultiplier: 1.5 }
					, { x_offset: 130, y: 520, blades: 5, radius: 32, bladeW: 6, bladeH: 30, cw: false, speedMultiplier: 1.5 }
				]
			},
			gates: {
				y: 520, // ゲートの垂直位置（px）
				offsetX: 44, // ゲートのピボットの水平オフセット（px）
				length: 60, // ゲートの長さ（px）
				width: 10, // ゲートの幅（px）
				color: '#c0392b' // ゲートの色
			},
			features: {
				chucker: { y: 580, width: 36, height: 10, color: '#e67e22' }, // チャッカーの位置とサイズ
				tulip: { x: 120, y: 450, width: 32, height: 10, color: '#3498db' }, // チューリップの位置とサイズ
				// ガード: 設定で追加できる単純な矩形ガードです。
				// enabled フラグや座標を設定すれば、特定の位置に障害物を追加できます。
				// デフォルトでは空にしておき、起動時に予期せぬオブジェクトが出現しないようにしています。
				guards: [],
				fenceColor: '#7f8c8d', // フェンス色
				chuckerFence: { y: 560, height: 40, thickness: 6, offsetX: 26 }, // チャッカー周囲のフェンス
				tulipFence: { y: 450, height: 36, thickness: 6, offsetX: 22 } // チューリップ周囲のフェンス
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
					{ type: 'circle', x_offset: -80, y: 320, r: 42 }, // 左側風車の除外領域
					{ type: 'circle', x_offset: 80, y: 320, r: 42 }, // 右側風車の除外領域
					{ type: 'circle', x_offset: 0, y: 565, r: 56 },      // チャッカーの除外領域
					{ type: 'rect', x: 120, y: 430, w: 52, h: 46 }, // 左チューリップの除外領域
					{ type: 'rect', x_right: 120, y: 430, w: 52, h: 46 } // 右チューリップの除外領域
					// 上記 exclusionZones は pegs を生成する際にペグ配置を回避する領域です。
					// 例えば風車やチューリップの重なりを避けるために設定します。
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