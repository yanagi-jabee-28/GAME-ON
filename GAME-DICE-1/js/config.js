// アプリ設定（挙動調整用）
window.AppConfig = window.AppConfig || {
	physics: {
		gravity: { x: 0, y: -30, z: 0 }, // 重力加速度（m/s^2）
		solverIterations: 80, // 物理ソルバの反復回数（安定性優先で増やす）
		solverTolerance: 1e-7, // ソルバ許容誤差（小さいほど安定だがコスト増）
		maxSubSteps: 6, // 1フレーム内の最大サブステップ（不規則なdt対策）
		// 後方互換（contacts.* 未設定時に参照）
		contact: { friction: 0.08, restitution: 0.08 },
		// ペア別の接触設定
		contacts: {
			default: { friction: 0.08, restitution: 0.06 }, // ペア設定がない場合の基準（全体的に摩擦を低めに）
			diceVsBowl: { friction: 0.08, restitution: 0.03 }, // サイコロ×お椀（自然に滑って底へ落ちる）
			diceVsDice: { friction: 0.06, restitution: 0.02 } // サイコロ×サイコロ（接触時の自然な摩擦）
		},
		// 安定化パラメータ（必要に応じて調整）
		contactEquationStiffness: 5e7, // 接触剛性（硬めにして沈み込みを抑える）
		contactEquationRelaxation: 1, // 接触緩和（小さくして解を締める）
		frictionEquationStiffness: 5e7, // 摩擦剛性
		frictionEquationRelaxation: 1, // 摩擦緩和
		// 賢い安定化: 角立ち抑制のための追加パラメータ
		adaptiveDamping: {
			enabled: true, // 適応ダンピング有効化
			angularThreshold: 0.3, // 角速度しきい値（高回転でのみ強化する）
			boostFactor: 1.5 // 強化倍率（過剰抑制を避ける）
		}
	},
	bowl: {
		profilePoints: [{ r: 0.0, y: -2.2 }, { r: 3.0, y: -1.5 }, { r: 6.0, y: 2.0 }], // お椀の断面（r:半径, y:高さ）
		maxR: 6.0, // 断面の最大半径
		radialSlices: 16, // 物理コライダの放射方向分割
		angularSegments: 48, // 角度方向分割
		tileHalfY: 0.25, // 物理タイルの半厚み
		// 底面の一部を平面にする設定
		flatBottom: {
			enabled: true, // 平面を有効化
			radius: 3, // 平面の半径
			thickness: 0.1 // 物理コライダの厚み
		},
		// 球殻でお椀を表現する場合の設定
		sphere: {
			enabled: true, // 有効化
			radius: 4, // 外半径
			openingY: 0, // 開口高さ（0=赤道）
			sampleCount: 72, // 縦方向の分割密度の目安
			thickness: 0.3 // 殻の厚み
		},
		// centerCover: 中心の穴を隠すカバー（見た目/物理）
		centerCover: {
			enabled: true, // カバー全体の有効/無効
			visual: {
				enabled: true, // 見た目のカバー
				radius: 0.5, // 見た目の半径
				color: 0xA1887F // 色
			},
			physics: {
				enabled: true, // 物理のカバー
				size: 0.3 // 中央ボックスの半辺長
			}
		}
	},
	dice: {
		count: 3, // サイコロ個数
		size: 1, // 一辺の長さ
		spacing: 1.6, // 初期配置の間隔
		initialHeight: 5, // 初期高さ
		jitterX: 0.2, // X方向のランダム位置
		jitterZ: 0.6, // Z方向のランダム位置
		initialVelocityScale: 4, // 初期速度スケール
		// 初速・最大速度の保護設定（吹き飛び防止）
		maxInitialLinearVelocity: 6.0, // 投擲時の初速上限
		maxInitialAngularVelocity: 20.0, // 投擲時の角速度上限
		maxLinearVelocity: 12.0, // フレーム中の速度上限
		maxAngularVelocity: 40.0, // フレーム中の角速度上限
		angularVelocityScale: 15, // 初期角速度スケール
		linearDamping: 0.01, // 線形減衰
		linearDamping: 0.02, // 線形減衰（転がりの自然な減衰）
		angularDamping: 0.02, // 角減衰
		rollingFrictionTorque: 0.03, // 疑似転がり摩擦トルク（自然な回転減衰）
		sleepSpeedLimit: 0.06, // スリープ判定: 速度（小さくして早期sleepを防ぐ）
		sleepTimeLimit: 1.5, // スリープ判定: 継続時間[s]
		sleepSpeedLimit: 0.06, // スリープ判定: 速度（小さくして早期sleepを防ぐ）
		sleepTimeLimit: 1.5, // スリープ判定: 継続時間[s]
		cornerRadius: 0.26, // 物理ボディの角丸半径（やや大きめにして角立ちを抑制）
		edgeSegments: 8, // 角丸エッジの円柱分割数（滑らかさ）
		// 任意: 内部バラストで重心を下げる（外観・当たり判定は変えず安定化）
		ballast: {
			enabled: false, // 有効化すると角立ちがさらに減りやすい
			offsetY: 0.15, // バラストの下方向オフセット量
			radius: 0.2, // バラスト球の半径（サイコロサイズ基準）
			layers: 3 // 体積を稼ぐための重ね個数（内側に重ねる）
		},
		// 角で止まりそうなときに軽く揺り動かして倒す補助（物理ステップ内で実行）
		tipNudge: {
			enabled: true,
			linearThreshold: 0.06, // これ以下の線速度で揺り動かし候補
			angularThreshold: 0.06, // これ以下の角速度で揺り動かし候補
			faceAlignThreshold: 0.92, // 最も近い面と上方向のdotがこれ以下なら不安定
			nudgeStrength: 0.02 // 揺り動かしトルクの強さ（小さめ）
		},
		// 任意: 疑似転がり摩擦（微小トルクで回転を減衰）
		rollingFrictionTorque: 0.0 // 0で無効。0.02〜0.08程度で調整
	},
	render: {
		cameraPosition: { x: 8, y: 9, z: 8 } // 初期カメラ位置
	},
	debug: {
		enabled: false, // デバッグ用カメラ操作
		rotateSpeed: 0.005, // 回転速度
		zoomSpeed: 1.0 // ズーム速度
	},
	ui: {
		autoThrowDelay: 50, // 起動後の自動スロー遅延[ms]
		resultCheckDelay: 2000, // 結果判定までの待機[ms]
		resultVelocityThreshold: 0.1, // 静止判定: 速度しきい値
		resultAngularThreshold: 0.1 // 静止判定: 角速度しきい値
	}
};
