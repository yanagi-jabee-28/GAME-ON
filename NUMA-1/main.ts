import * as CANNON from "cannon-es";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// --- 基本設定 ---
let shadowsEnabled = true; // 影の描画フラグ（UIで切替）
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
	75,
	window.innerWidth / window.innerHeight,
	0.1,
	1000,
);
camera.position.set(0, 30, 25);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- ライティング ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(10, 20, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 60;
directionalLight.shadow.camera.left = -15;
directionalLight.shadow.camera.right = 15;
directionalLight.shadow.camera.top = 15;
directionalLight.shadow.camera.bottom = -15;
directionalLight.shadow.bias = -0.0005;
directionalLight.shadow.normalBias = 0.02;
scene.add(directionalLight);

// 影の設定を一括で適用する関数
function setShadowsEnabled(enabled) {
	shadowsEnabled = enabled;
	renderer.shadowMap.enabled = enabled;
	directionalLight.castShadow = enabled;
	// 既存メッシュの影設定を反映
	scene.traverse((obj) => {
		// 型チェック：Object3D に対して isMesh がない場合があるため instanceof で絞る
		if (obj instanceof THREE.Mesh) {
			obj.castShadow = enabled;
			obj.receiveShadow = enabled;
		}
	});
}

// --- 物理ワールド ---
const world = new CANNON.World({
	gravity: new CANNON.Vec3(0, -30, 0),
});

// 物理シミュレーションの安定性を向上
world.defaultContactMaterial.contactEquationStiffness = 1e7;
world.defaultContactMaterial.contactEquationRelaxation = 3;
// cannon-es の型定義が完全でない場合があるため、一時的に any 経由で設定
(world.solver as any).iterations = 10;
(world.solver as any).tolerance = 0.01;

// --- マテリアル ---
const ballMaterial = new CANNON.Material("ballMaterial");
const wallMaterial = new CANNON.Material("wallMaterial");
const groundMaterial = new CANNON.Material("groundMaterial");

const ballWallContactMaterial = new CANNON.ContactMaterial(
	ballMaterial,
	wallMaterial,
	{
		friction: 0.2,
		restitution: 0.4,
		contactEquationStiffness: 1e7,
	},
);
world.addContactMaterial(ballWallContactMaterial);

const ballGroundContactMaterial = new CANNON.ContactMaterial(
	ballMaterial,
	groundMaterial,
	{
		friction: 0.4,
		restitution: 0.2,
		contactEquationStiffness: 1e7,
	},
);
world.addContactMaterial(ballGroundContactMaterial);

// --- 削除予定のオブジェクトを管理する配列 ---
const objectsToRemove = [];

// --- クルーンの作成 ---
const cruunRadius = 10;
const cruunThickness = 0.2;
const holeRadius = 0.8;
const numHoles = 10;
const cruunYPositions = [15, 7.5, 0];

cruunYPositions.forEach((yPos, index) => {
	createCruun(new THREE.Vector3(0, yPos, 0), index);
});

function createCruun(position, stageIndex) {
	const cruunGroup = new THREE.Group();
	scene.add(cruunGroup);

	const tiltAngle = -Math.PI / 6;
	const tiltQuaternion = new CANNON.Quaternion().setFromAxisAngle(
		new CANNON.Vec3(1, 0, 0),
		tiltAngle,
	);

	const holePositions = [];
	for (let i = 0; i < numHoles; i++) {
		const angle = (i / numHoles) * Math.PI * 2;
		const holeX = Math.cos(angle) * (cruunRadius * 0.65);
		const holeZ = Math.sin(angle) * (cruunRadius * 0.65);
		holePositions.push({ x: holeX, z: holeZ });
	}

	// 1. Create the visual mesh (見た目用のモデル)
	const cruunShape = new THREE.Shape();
	cruunShape.absarc(0, 0, cruunRadius, 0, Math.PI * 2, false);
	const holeShapes = [];
	for (const holePos of holePositions) {
		const holePath = new THREE.Path();
		holePath.absarc(holePos.x, holePos.z, holeRadius, 0, Math.PI * 2, true);
		holeShapes.push(holePath);
	}
	cruunShape.holes = holeShapes;

	const extrudeSettings = { depth: cruunThickness, bevelEnabled: false };
	const geometry = new THREE.ExtrudeGeometry(cruunShape, extrudeSettings);
	const material = new THREE.MeshPhongMaterial({
		color: "#888888",
		shininess: 10,
		specular: "#222222",
		side: THREE.DoubleSide,
	});
	const cruunMesh = new THREE.Mesh(geometry, material);
	cruunMesh.castShadow = shadowsEnabled;
	cruunMesh.receiveShadow = shadowsEnabled;
	cruunMesh.rotation.x = -Math.PI / 2;
	cruunGroup.add(cruunMesh);

	// 2. Create the physics body using a single smooth disk (段差のない物理面)
	const cruunBody = new CANNON.Body({ mass: 0, material: groundMaterial });
	const diskRadius = cruunRadius;
	const diskThickness = cruunThickness;
	// 薄い円柱を1枚置いて平滑な接触面にする
	const diskShape = new CANNON.Cylinder(
		diskRadius,
		diskRadius,
		diskThickness,
		32,
	);
	cruunBody.addShape(diskShape);

	world.addBody(cruunBody); // 3. 外壁 (物理ボディのみ) - クルーン縁に沿った連続壁を生成
	const wallHeight = cruunThickness + 1.2; // 壁の高さ（少し低く）
	const wallThickness = 0.5; // 壁の厚さ(半径方向)
	const numWallSegments = 12; // セグメント数をさらに増やして滑らかに
	const circumference = Math.PI * 2 * cruunRadius;
	const segmentLength = (circumference / numWallSegments) * 1.02; // わずかに重ねて隙間防止（最小限）

	// 見た目の壁（物理と完全一致）用マテリアル
	const wallVisMaterial = new THREE.MeshPhongMaterial({
		color: "#777777",
		shininess: 10,
		specular: "#222222",
	});

	for (let i = 0; i < numWallSegments; i++) {
		const angle = (i / numWallSegments) * Math.PI * 2;
		// 円周上の中心位置（ローカル平面）: 内側面がディスク端に一致するよう、中心を半径方向に 1/2 厚み分オフセット
		const halfRadial = wallThickness / 2;
		const radialCenter = cruunRadius + halfRadial;
		const wallX = Math.cos(angle) * radialCenter;
		const wallZ = Math.sin(angle) * radialCenter;

		// セグメント形状: 半径方向に薄く、接線方向に長い箱
		const halfHeight = wallHeight / 2;
		const halfTangent = segmentLength / 2;
		const wallShape = new CANNON.Box(
			new CANNON.Vec3(halfRadial, halfHeight, halfTangent),
		);

		const wallBody = new CANNON.Body({ mass: 0, material: wallMaterial });
		wallBody.addShape(wallShape);

		// 向き: まず円周方向に回し（接線方向合わせ）、その後クルーンの傾斜を適用
		const qY = new CANNON.Quaternion().setFromAxisAngle(
			new CANNON.Vec3(0, 1, 0),
			angle,
		);
		const qFinal = new CANNON.Quaternion();
		tiltQuaternion.mult(qY, qFinal); // qFinal = tilt * qY（qY→tilt の順で適用）
		wallBody.quaternion.copy(qFinal);

		// Three.js 側の回転（ローカルYaw。グループに傾斜と位置が入るため、ここではYawのみ）
		const qYThree = new THREE.Quaternion().setFromAxisAngle(
			new THREE.Vector3(0, 1, 0),
			angle,
		);

		// 位置にも傾斜を反映
		const localWallPos = new CANNON.Vec3(wallX, 0, wallZ);
		const rotatedWallPos = tiltQuaternion.vmult(localWallPos);
		wallBody.position.copy(position).vadd(rotatedWallPos, wallBody.position);

		// 見た目の壁は連続したリングメッシュで構築するため、ここでは追加しない

		world.addBody(wallBody);
	}

	// 見た目の壁（連続リング）を追加（物理の壁と寸法・傾斜を一致）
	const outerR = cruunRadius + wallThickness;
	const innerR = cruunRadius;
	const ringShape = new THREE.Shape();
	ringShape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
	const ringHole = new THREE.Path();
	ringHole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
	ringShape.holes = [ringHole];
	const ringGeom = new THREE.ExtrudeGeometry(ringShape, {
		depth: wallHeight,
		bevelEnabled: false,
		curveSegments: 128,
	});
	// 高さ中央を原点に合わせる
	ringGeom.translate(0, 0, -wallHeight / 2);
	const ringMesh = new THREE.Mesh(ringGeom, wallVisMaterial);
	ringMesh.castShadow = shadowsEnabled;
	ringMesh.receiveShadow = shadowsEnabled;
	// Extrudeは+Z方向に押し出されるため、-90度回転して高さをローカルYに揃える
	ringMesh.rotation.x = -Math.PI / 2;
	cruunGroup.add(ringMesh);

	// 4. Position and tilt everything
	cruunGroup.position.copy(position);
	cruunBody.position.copy(position);

	cruunGroup.quaternion.copy(tiltQuaternion);
	cruunBody.quaternion.copy(tiltQuaternion);

	// 5. 当たり判定用のトリガーを設置（シンプルで確実）
	for (let i = 0; i < holePositions.length; i++) {
		const holePos = holePositions[i];
		const triggerShape = new CANNON.Cylinder(holeRadius, holeRadius, 3, 16);
		const triggerBody = new CANNON.Body({ mass: 0 });
		// 物理反応を無効化してセンサー化（衝突イベントは受け取る）
		triggerBody.collisionResponse = false;
		triggerBody.addShape(triggerShape);

		// トリガーの位置を正確に計算
		const localHolePos = new CANNON.Vec3(holePos.x, 0, holePos.z);
		const rotatedHolePos = tiltQuaternion.vmult(localHolePos);
		triggerBody.position
			.copy(position)
			.vadd(rotatedHolePos, triggerBody.position);

		// トリガーの回転も合わせる
		triggerBody.quaternion.copy(tiltQuaternion);

		world.addBody(triggerBody);

		const isWinHole = i === 0;
		triggerBody.addEventListener("collide", (event) => {
			const ballBody = event.body;
			if (ballBody.isBall) {
				const alreadyMarked = objectsToRemove.some(
					(item) => item.body === ballBody,
				);
				if (!alreadyMarked) {
					objectsToRemove.push({ body: ballBody, mesh: ballBody.mesh });
					if (isWinHole) {
						if (stageIndex < cruunYPositions.length - 1) {
							addBall(cruunYPositions[stageIndex + 1] + 5);
						} else {
							showWinMessage();
						}
					}
				}
			}
		});
	}
}

// --- パチンコ玉 ---
const balls = [];
const ballRadius = 0.3; // 少し小さくして安定性向上
const ballGeometry = new THREE.SphereGeometry(ballRadius, 16, 16); // ポリゴン数を減らして軽量化
const ballThreeMaterial = new THREE.MeshStandardMaterial({
	color: 0xcccccc,
	metalness: 0.5,
	roughness: 0.1,
});

function addBall(startY = 22) {
	const ballMesh = new THREE.Mesh(ballGeometry, ballThreeMaterial);
	ballMesh.castShadow = shadowsEnabled;
	ballMesh.receiveShadow = shadowsEnabled;
	scene.add(ballMesh);

	const ballBody = new CANNON.Body({
		mass: 0.5, // 質量を軽くして安定性向上
		shape: new CANNON.Sphere(ballRadius),
		material: ballMaterial,
		linearDamping: 0.05, // 減衰を軽くして自然な動き
		angularDamping: 0.05,
	});
	const randomX = (Math.random() - 0.5) * 2; // さらに範囲を狭める
	const randomZ = (Math.random() - 0.5) * 2;
	ballBody.position.set(randomX, startY, randomZ);
	world.addBody(ballBody);

	// 型定義に存在しないランタイム拡張プロパティは any にキャストして扱う
	(ballBody as any).isBall = true;
	(ballBody as any).mesh = ballMesh;
	balls.push({ mesh: ballMesh, body: ballBody });
}

document
	.getElementById("add-ball-btn")
	.addEventListener("click", () => addBall());

// 影のオン/オフボタン
const shadowBtn = document.getElementById("toggle-shadow-btn");
shadowBtn.addEventListener("click", () => {
	setShadowsEnabled(!shadowsEnabled);
	shadowBtn.textContent = `影: ${shadowsEnabled ? "ON" : "OFF"}`;
});

// --- 大当たりメッセージ ---
const messageBox = document.getElementById("message-box");
function showWinMessage() {
	messageBox.style.display = "block";
	setTimeout(() => {
		messageBox.style.display = "none";
	}, 3000);
}

// --- アニメーションループ ---
const clock = new THREE.Clock();
function animate() {
	requestAnimationFrame(animate);
	const deltaTime = Math.min(clock.getDelta(), 0.016); // 60FPSに制限
	world.step(1 / 60, deltaTime, 3); // 標準的な設定

	while (objectsToRemove.length > 0) {
		const item = objectsToRemove.pop();
		world.removeBody(item.body);
		scene.remove(item.mesh);
		const ballIndex = balls.findIndex((b) => b.body === item.body);
		if (ballIndex > -1) {
			balls.splice(ballIndex, 1);
		}
	}

	balls.forEach((ball) => {
		ball.mesh.position.copy(ball.body.position);
		ball.mesh.quaternion.copy(ball.body.quaternion);

		// ボールが下に落ちすぎた場合の処理
		if (ball.body.position.y < -15) {
			const alreadyMarked = objectsToRemove.some(
				(item) => item.body === ball.body,
			);
			if (!alreadyMarked) {
				objectsToRemove.push({ body: ball.body, mesh: ball.mesh });
			}
		}

		// ボールが停止したか判定（デバッグ用）
		const velocity = ball.body.velocity;
		const speed = Math.sqrt(
			velocity.x * velocity.x +
			velocity.y * velocity.y +
			velocity.z * velocity.z,
		);
		if (speed < 0.1 && ball.body.position.y > -5) {
			// 停止したボールに少し力を加える
			ball.body.velocity.set(
				(Math.random() - 0.5) * 2,
				0,
				(Math.random() - 0.5) * 2,
			);
		}
	});

	controls.update();
	renderer.render(scene, camera);
}

// --- ウィンドウリサイズ対応 ---
window.addEventListener("resize", () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 初期化 ---
setShadowsEnabled(true); // 初期状態を適用
shadowBtn.textContent = `影: ${shadowsEnabled ? "ON" : "OFF"}`;
animate();
addBall();
