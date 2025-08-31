// アプリ設定（挙動調整用）
window.AppConfig = window.AppConfig || {
	physics: {
		gravity: { x: 0, y: -19.82, z: 0 }, // 重力加速度（m/s^2）
		solverIterations: 40, // 物理ソルバの反復回数（↑で安定/重い）
		maxSubSteps: 5, // 1フレーム内の最大サブステップ
		// 後方互換（contacts.* 未設定時に参照）
		contact: { friction: 0.3, restitution: 0.08 },
		// ペア別の接触設定
		contacts: {
			default: { friction: 0.25, restitution: 0.06 }, // ペア設定がない場合の基準
			diceVsBowl: { friction: 0.0004, restitution: 0.005 }, // サイコロ×お椀
			diceVsDice: { friction: 0.0005, restitution: 0.0004 } // サイコロ×サイコロ
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
			radius: 4, // 平面の半径
			thickness: 0.1 // 物理コライダの厚み
		},
		// 球殻でお椀を表現する場合の設定
		sphere: {
			enabled: true, // 有効化
			radius: 6.0, // 外半径
			openingY: 0.0, // 開口高さ（0=赤道）
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
		angularVelocityScale: 15, // 初期角速度スケール
		linearDamping: 0.01, // 線形減衰
		angularDamping: 0.01, // 角減衰
		cornerRadius: 0.12, // 物理ボディの角丸半径
		edgeSegments: 8 // 角丸エッジの円柱分割数（滑らかさ）
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
