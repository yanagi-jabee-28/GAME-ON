// =================================================================================
// チンチロリン - 3D
//
// 伝統的な日本のゲーム「チンチロリン」を基にした3Dサイコロゲーム。
// レンダリングにThree.js、物理演算にcannon-es.js、音声にTone.jsを使用。
// =================================================================================

/// <reference types="three" />
/// <reference types="cannon-es" />

import * as CANNON from "cannon-es";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as Tone from "tone";

// =================================================================================
// DOM要素の取得 (型注釈を追加して .disabled/.value 等を安全に使えるようにする)
// =================================================================================
const canvasContainer = document.getElementById(
	"canvas-container",
) as HTMLElement; // キャンバスコンテナ要素
const rollButton = document.getElementById("rollButton") as HTMLButtonElement; // サイコロを振るボタン
const nudgeButton = document.getElementById("nudgeButton") as HTMLButtonElement; // サイコロを揺らすボタン
const rearrangeButton = document.getElementById(
	"rearrangeButton",
) as HTMLButtonElement; // サイコロを再配置するボタン
const diceTypeSelector = document.getElementById(
	"diceTypeSelector",
) as HTMLSelectElement; // サイコロの種類選択セレクタ
const resultTitle = document.getElementById("result-title") as HTMLElement; // 結果タイトルの表示要素
const resultDescription = document.getElementById(
	"result-description",
) as HTMLElement; // 結果説明の表示要素
const powerMeterContainer = document.getElementById(
	"power-meter-container",
) as HTMLElement; // パワーメーターコンテナ
const powerMeterBar = document.getElementById("power-meter-bar") as HTMLElement; // パワーメーターバー

type GameState = "initializing" | "ready" | "charging" | "rolling" | "checking";
type DiceType = "normal" | "shigoro" | "pinzoro" | "hifumi";

type DiceMaterial = THREE.MeshStandardMaterial;
type DiceMesh = THREE.Mesh<THREE.BoxGeometry, DiceMaterial[]>;

type CannonBodyWithCCD = CANNON.Body & {
	ccdSpeedThreshold?: number;
	ccdMotionThreshold?: number;
};

type WorldWithSleepSettings = CANNON.World & {
	sleepSpeedLimit: number;
	sleepTimeLimit: number;
};

type SolverWithIterations = CANNON.Solver & { iterations: number };

const DICE_TYPES: readonly DiceType[] = [
	"normal",
	"shigoro",
	"pinzoro",
	"hifumi",
];

function isDiceType(value: string): value is DiceType {
	return (DICE_TYPES as readonly string[]).includes(value);
}

function enableContinuousCollisionDetection(body: CANNON.Body): void {
	const ccdBody = body as CannonBodyWithCCD;
	ccdBody.ccdSpeedThreshold = 0.01;
	ccdBody.ccdMotionThreshold = diceSize / 4;
}

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let clock: THREE.Clock;
let world: CANNON.World;
const dice: DiceMesh[] = [];
const diceBodies: CANNON.Body[] = [];

const diceSize = 0.5; // サイコロのサイズ
const bowlRadius = 4; // 丼の半径
const bowlHeight = 2; // 丼の高さ

let gameState: GameState = "initializing"; // ゲームの状態（初期化中、準備中など）
let diceType: DiceType = "normal"; // サイコロの種類（通常、四五六、ピンゾロ）
let rollStartTime = 0; // ロール開始時刻

const STUCK_THRESHOLD_MS = 5000; // スタック判定の閾値（ミリ秒）
const SHONBEN_GRACE_PERIOD_MS = 100; // ションベン判定の猶予期間（ミリ秒）
const shonbenTimers: number[] = [0, 0, 0]; // 各サイコロのションベンタイマー

let power = 0; // 現在のパワー値
let powerDirection = 1; // パワーメーターのアニメーション方向
let powerAnimationId: number | null = null; // パワーメーターアニメーションのID

/**
 * @class SoundManager
 * @description Why: サウンド関連のすべてのロジックをこのクラスにカプセル化することで、
 * 音声システムの関心をゲームの主要なロジックから分離します。これにより、コードの整理、保守、拡張が容易になります。
 */
class SoundManager {
	private isInitialized = false;
	private clinkSynth: Tone.PolySynth<Tone.MetalSynth> | null = null;
	private winSynth: Tone.PolySynth<Tone.Synth> | null = null;
	private pairSynth: Tone.PolySynth<Tone.Synth> | null = null;
	private loseSynth: Tone.PolySynth<Tone.Synth> | null = null;
	private foulSynth: Tone.MonoSynth | null = null;
	private clickSynth: Tone.Synth | null = null;
	private readonly lastPlay = new Map<string, number>();
	private readonly MAX_IMPACT_VELOCITY_DICE = 20;
	private readonly MAX_IMPACT_VELOCITY_BOWL = 25;

	private now(): number {
		return Tone.now();
	}

	private canPlay(key: string, minIntervalSec = 0.03): boolean {
		const current = this.now();
		const last = this.lastPlay.get(key) ?? 0;
		if (current - last >= minIntervalSec) {
			this.lastPlay.set(key, current);
			return true;
		}
		return false;
	}

	async init(): Promise<void> {
		if (this.isInitialized) return;
		if (typeof Tone === "undefined" || !Tone) {
			console.warn("SoundManager: Tone.js not found; sound disabled.");
			this.isInitialized = true;
			return;
		}
		try {
			await Tone.start();
		} catch (error) {
			console.warn("SoundManager: Tone.start() failed.", error);
		}

		const clinkOptions: Partial<Tone.MetalSynthOptions> = {
			envelope: { attack: 0.001, decay: 0.1, release: 0.08 },
			harmonicity: 4.1,
			modulationIndex: 22,
			resonance: 3000,
			octaves: 1.2,
		};
		this.clinkSynth = new Tone.PolySynth(
			Tone.MetalSynth,
			clinkOptions,
		).toDestination();
		this.clinkSynth.volume.value = -9;

		const winOptions: Partial<Tone.SynthOptions> = {
			oscillator: { type: "triangle" },
			envelope: { attack: 0.01, decay: 0.2, sustain: 0.45, release: 1.2 },
		};
		this.winSynth = new Tone.PolySynth(Tone.Synth, winOptions).toDestination();
		this.winSynth.volume.value = -2;

		const pairOptions: Partial<Tone.SynthOptions> = {
			oscillator: { type: "sine" },
			envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.3 },
		};
		this.pairSynth = new Tone.PolySynth(
			Tone.Synth,
			pairOptions,
		).toDestination();
		this.pairSynth.volume.value = -6;

		const loseOptions: Partial<Tone.SynthOptions> = {
			oscillator: { type: "sawtooth" },
			envelope: { attack: 0.003, decay: 0.18, sustain: 0.06, release: 0.22 },
		};
		this.loseSynth = new Tone.PolySynth(
			Tone.Synth,
			loseOptions,
		).toDestination();
		this.loseSynth.volume.value = -10;

		const foulOptions: Partial<Tone.MonoSynthOptions> = {
			oscillator: { type: "square" },
			filter: { Q: 6, type: "lowpass", rolloff: -24 },
			envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 1 },
			filterEnvelope: {
				attack: 0.01,
				decay: 0.1,
				sustain: 1,
				release: 0.5,
				baseFrequency: 200,
				octaves: 2,
			},
		};
		this.foulSynth = new Tone.MonoSynth(foulOptions).toDestination();

		const clickOptions: Partial<Tone.SynthOptions> = {
			oscillator: { type: "sine" },
			envelope: { attack: 0.001, decay: 0.06, sustain: 0.02, release: 0.06 },
		};
		this.clickSynth = new Tone.Synth(clickOptions).toDestination();
		this.clickSynth.volume.value = -3;

		this.isInitialized = true;
		console.log("SoundManager initialized.");
	}

	private impactToLevel(
		velocity: number,
		maxVelocity: number,
		minLevel = 0.0,
		maxLevel = 1.0,
	): number {
		const norm = Math.min(1, Math.max(0, velocity / maxVelocity));
		const level = norm ** 2;
		return minLevel + level * (maxLevel - minLevel);
	}

	private playCollision(
		impactVelocity: number,
		maxVelocity: number,
		notePalette: string[],
		isBowl: boolean,
	): void {
		if (!this.isInitialized || !this.clinkSynth) return;
		const key = isBowl ? "bowl" : "dice";
		if (!this.canPlay(key, isBowl ? 0.08 : 0.07)) return;
		const baseLevel = this.impactToLevel(
			impactVelocity,
			maxVelocity,
			0.02,
			1.0,
		);
		const time = this.now();
		const clatterCount = 1 + Math.floor(baseLevel * 4);
		for (let i = 0; i < clatterCount; i++) {
			const clatterTime = time + i * 0.03 + Math.random() * 0.02;
			const clatterNote =
				notePalette[Math.floor(Math.random() * notePalette.length)];
			const clatterLevel = baseLevel * (0.5 + Math.random() * 0.5);
			this.clinkSynth.triggerAttackRelease(
				clatterNote,
				"16n",
				clatterTime,
				clatterLevel,
			);
		}
	}

	playDiceCollision(impactVelocity: number): void {
		this.playCollision(
			impactVelocity,
			this.MAX_IMPACT_VELOCITY_DICE,
			["A4", "C5", "D#5", "F#5", "A5"],
			false,
		);
	}

	playBowlCollision(impactVelocity: number): void {
		this.playCollision(
			impactVelocity,
			this.MAX_IMPACT_VELOCITY_BOWL,
			["C4", "E4", "G4", "A#4"],
			true,
		);
	}

	playWinSound(): void {
		const synth = this.winSynth;
		if (!this.isInitialized || !synth || !this.canPlay("win", 0.2)) return;
		const startTime = this.now();
		["E4", "G4", "C5", "E5"].forEach((note, index) => {
			synth.triggerAttackRelease(note, "8n", startTime + index * 0.06);
		});
	}

	playPairSound(): void {
		if (!this.isInitialized || !this.pairSynth || !this.canPlay("pair", 0.2))
			return;
		this.pairSynth.triggerAttackRelease(["C4", "E4", "G4"], "8n", this.now());
	}

	playLoseSound(): void {
		if (!this.isInitialized || !this.loseSynth || !this.canPlay("lose", 0.2))
			return;
		const time = this.now();
		this.loseSynth.triggerAttackRelease("C3", "16n", time);
		this.loseSynth.triggerAttackRelease("Bb2", "16n", time + 0.08);
	}

	playFoulSound(): void {
		if (!this.isInitialized || !this.foulSynth || !this.canPlay("foul", 0.5))
			return;
		this.foulSynth.triggerAttackRelease("C2", "0.5");
	}

	playClickSound(): void {
		if (!this.isInitialized || !this.clickSynth || !this.canPlay("click", 0.05))
			return;
		this.clickSynth.triggerAttackRelease("C5", "16n", this.now(), 0.5);
	}
}

let soundManager: SoundManager;

/**
 * @class ParticleEmitter
 * @description 視覚的なフィードバックのためのシンプルなパーティクル効果を作成します。
 */
type Particle = {
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	life: number;
};

class ParticleEmitter {
	private readonly particles: Particle[] = [];
	private readonly positions: Float32Array;
	private readonly colors: Float32Array;
	private readonly geometry: THREE.BufferGeometry;
	private readonly material: THREE.PointsMaterial;
	private readonly points: THREE.Points<
		THREE.BufferGeometry,
		THREE.PointsMaterial
	>;
	private readonly tempVec = new THREE.Vector3();

	constructor(
		private readonly scene: THREE.Scene,
		count = 100,
	) {
		this.geometry = new THREE.BufferGeometry();
		this.material = new THREE.PointsMaterial({
			color: 0xf0ead6,
			size: 0.2,
			transparent: true,
			opacity: 1,
			blending: THREE.AdditiveBlending,
			vertexColors: true,
		});
		this.positions = new Float32Array(count * 3);
		this.colors = new Float32Array(count * 3);
		this.geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(this.positions, 3),
		);
		this.geometry.setAttribute(
			"color",
			new THREE.BufferAttribute(this.colors, 3),
		);
		this.points = new THREE.Points(this.geometry, this.material);
		this.points.frustumCulled = false;
		this.points.visible = false;
		this.scene.add(this.points);
		for (let i = 0; i < count; i++) {
			this.particles.push({
				position: new THREE.Vector3(),
				velocity: new THREE.Vector3(),
				life: 0,
			});
		}
	}

	trigger(origin: THREE.Vector3 | { x: number; y: number; z: number }): void {
		const particleColor = new THREE.Color(0xf0ead6);
		this.points.visible = true;
		const originVec =
			origin instanceof THREE.Vector3
				? origin
				: new THREE.Vector3(origin.x, origin.y, origin.z);
		for (let i = 0; i < this.particles.length; i++) {
			const particle = this.particles[i];
			particle.position.copy(originVec);
			const speed = 5 + Math.random() * 5;
			particle.velocity.set(
				(Math.random() - 0.5) * speed,
				Math.random() * 0.5 * speed,
				(Math.random() - 0.5) * speed,
			);
			particle.life = 1;
			this.positions[i * 3] = particle.position.x;
			this.positions[i * 3 + 1] = particle.position.y;
			this.positions[i * 3 + 2] = particle.position.z;
			this.colors[i * 3] = particleColor.r;
			this.colors[i * 3 + 1] = particleColor.g;
			this.colors[i * 3 + 2] = particleColor.b;
		}
		(
			this.geometry.getAttribute("position") as THREE.BufferAttribute
		).needsUpdate = true;
		(this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate =
			true;
	}

	update(deltaTime: number): void {
		if (!this.points.visible) return;
		let aliveParticles = 0;
		for (let i = 0; i < this.particles.length; i++) {
			const particle = this.particles[i];
			if (particle.life > 0) {
				particle.life -= deltaTime;
				particle.velocity.y -= 9.8 * deltaTime;
				this.tempVec.copy(particle.velocity).multiplyScalar(deltaTime);
				particle.position.add(this.tempVec);
				this.positions[i * 3] = particle.position.x;
				this.positions[i * 3 + 1] = particle.position.y;
				this.positions[i * 3 + 2] = particle.position.z;
				aliveParticles++;
			}
		}
		const leadingLife = this.particles[0]?.life ?? 0;
		this.material.opacity = Math.max(0, leadingLife);
		(
			this.geometry.getAttribute("position") as THREE.BufferAttribute
		).needsUpdate = true;
		(this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate =
			true;
		if (aliveParticles === 0) {
			this.points.visible = false;
		}
	}
}

let particleEmitter: ParticleEmitter;

/**
 * @function init
 * @description シーン全体、物理世界、オブジェクト、およびイベントリスナーを初期化します。
 */
function init() {
	// Three.js シーンのセットアップ
	scene = new THREE.Scene();
	// 背景色設定
	scene.background = new THREE.Color(0x2c3e50);
	// カメラの設定
	camera = new THREE.PerspectiveCamera(
		75,
		window.innerWidth / window.innerHeight,
		0.1,
		1000,
	);
	// カメラ位置の設定
	camera.position.set(0, 8, 6);
	// レンダラーの初期化
	renderer = new THREE.WebGLRenderer({ antialias: true });
	// ピクセル比の設定
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	// レンダラーサイズの設定
	renderer.setSize(window.innerWidth, window.innerHeight);
	// シャドウマップの有効化
	renderer.shadowMap.enabled = true;
	// DOM への追加
	canvasContainer.appendChild(renderer.domElement);
	// コントロールの設定
	controls = new OrbitControls(camera, renderer.domElement);
	// ダンピングの有効化
	controls.enableDamping = true;
	// クロックの初期化
	clock = new THREE.Clock();

	// 環境光の設定
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
	// シーンへの追加
	scene.add(ambientLight);
	// 指向性ライトの設定
	const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
	// ライト位置の設定
	directionalLight.position.set(5, 10, 7.5);
	// シャドウキャストの有効化
	directionalLight.castShadow = true;

	// Why: 影の計算範囲を丼の周辺に限定することで、描画負荷を軽減し、
	// フレームレートの安定化を図ります。これは、不要な領域のシャドウマップ計算を
	// 省略することによる最適化です。
	// シャドウカメラの上限設定
	directionalLight.shadow.camera.top = 5;
	// シャドウカメラの下限設定
	directionalLight.shadow.camera.bottom = -5;
	// シャドウカメラの左限設定
	directionalLight.shadow.camera.left = -5;
	// シャドウカメラの右限設定
	directionalLight.shadow.camera.right = 5;
	// シャドウカメラの近距離設定
	directionalLight.shadow.camera.near = 1;
	// シャドウカメラの遠距離設定
	directionalLight.shadow.camera.far = 25;
	// シャドウマップの幅設定
	directionalLight.shadow.mapSize.width = 1024;
	// シャドウマップの高さ設定
	directionalLight.shadow.mapSize.height = 1024;

	// シーンへのライト追加
	scene.add(directionalLight);

	// --- 物理世界のセットアップ ---
	// Why: 重力を-55から-40に調整。これにより、過度に「重い」感覚が緩和され、
	// より自然な落下速度になりますが、ゲームとしてのダイナミックさも維持されます。
	world = new CANNON.World({ gravity: new CANNON.Vec3(0, -40, 0) });
	world.allowSleep = true;
	const worldWithSleep = world as WorldWithSleepSettings;
	worldWithSleep.sleepSpeedLimit = 0.05;
	worldWithSleep.sleepTimeLimit = 0.5;

	// Why: ソルバーの反復回数を20から30に増やします。
	// これは、特に複数のサイコロが同時に衝突するような複雑な状況で、
	// 物理オブジェクト同士がめり込む（トンネリング）現象を防ぐための措置です。
	// 反復回数を増やすことで、衝突解決の精度が向上し、より安定した物理シミュレーションが実現されます。
	// パフォーマンスへの影響は軽微であると判断しました。
	// ソルバー反復回数の設定
	const solver = world.solver as SolverWithIterations;
	solver.iterations = 30;

	// 物理マテリアルの作成
	const dicePhysicsMaterial = new CANNON.Material("dice");
	// 丼床マテリアルの作成
	const bowlFloorMaterial = new CANNON.Material("bowlFloor");
	// 丼壁マテリアルの作成
	const bowlWallMaterial = new CANNON.Material("bowlWall");

	// 丼の作成
	createBowl(bowlFloorMaterial, bowlWallMaterial);
	// サイコロの作成
	createDice(dicePhysicsMaterial);
	// 接触マテリアルのセットアップ
	setupContactMaterials(
		dicePhysicsMaterial,
		bowlFloorMaterial,
		bowlWallMaterial,
	);

	// パーティクルエミッターの初期化
	particleEmitter = new ParticleEmitter(scene);
	// サウンドマネージャーの初期化
	soundManager = new SoundManager();

	// イベントリスナーのセットアップ
	setupEventListeners();
	// アニメーションループの開始
	animate();
	// 初期ロールの遅延実行
	setTimeout(() => {
		rollDice(0, true);
	}, 100);
}

/**
 * @function setupEventListeners
 * @description UIとサウンドの初期化に関するイベントリスナーをセットアップします。
 */
function setupEventListeners() {
	// 初期状態でロールボタンを無効化
	rollButton.disabled = true;

	// 初回インタラクションでサウンドを初期化する関数
	const initSoundOnFirstInteraction = async () => {
		// サウンドマネージャーの初期化
		await soundManager.init();
		// クリック音の再生
		soundManager.playClickSound();
		// イベントリスナーの削除
		canvasContainer.removeEventListener("click", initSoundOnFirstInteraction);
		rollButton.removeEventListener("click", initSoundOnFirstInteraction);
		nudgeButton.removeEventListener("click", initSoundOnFirstInteraction);
		rearrangeButton.removeEventListener("click", initSoundOnFirstInteraction);
	};

	// 初回クリックでサウンド初期化
	canvasContainer.addEventListener("click", initSoundOnFirstInteraction, {
		once: true,
	});
	// ロールボタンクリックでサウンド初期化
	rollButton.addEventListener("click", initSoundOnFirstInteraction, {
		once: true,
	});
	// ナッジボタンクリックでサウンド初期化
	nudgeButton.addEventListener("click", initSoundOnFirstInteraction, {
		once: true,
	});
	// リアレンジボタンクリックでサウンド初期化
	rearrangeButton.addEventListener("click", initSoundOnFirstInteraction, {
		once: true,
	});

	// ロールボタンクリックでチャージ開始
	rollButton.addEventListener("click", startCharging);
	// ナッジボタンクリックでサイコロをナッジ
	nudgeButton.addEventListener("click", nudgeDice);
	// リアレンジボタンクリックでサイコロをリセット
	rearrangeButton.addEventListener("click", resetDiceToStartPosition);
	// サイコロタイプ変更でマテリアル更新
	diceTypeSelector.addEventListener("change", (event: Event) => {
		// クリック音の再生
		soundManager.playClickSound();
		const target = event.target as HTMLSelectElement;
		const selectedType = target.value;
		if (isDiceType(selectedType)) {
			diceType = selectedType;
			updateDiceMaterials();
		} else {
			console.warn(`Unexpected dice type selected: ${selectedType}`);
		}
	});
	// キャンバスクリックでパワー決定
	canvasContainer.addEventListener("click", decidePower);
	// ウィンドウリサイズでサイズ調整
	window.addEventListener("resize", onWindowResize);
}

/**
 * @function createBowl
 * @description 視覚（Three.js）と物理（cannon-es）の丼を作成します。
 */
function createBowl(
	bowlFloorMaterial: CANNON.Material,
	bowlWallMaterial: CANNON.Material,
): void {
	// 丼壁の厚さ設定
	const bowlWallThickness = 0.2;
	// 物理壁の厚さ設定
	const physicsWallThickness = 0.4;
	// 丼マテリアルの作成
	const bowlMaterial = new THREE.MeshStandardMaterial({
		color: 0x6b4f3a,
		side: THREE.DoubleSide,
		metalness: 0.2,
		roughness: 0.7,
	});
	// 丼グループの作成
	const bowlGroup = new THREE.Group();

	// 底ジオメトリの作成
	const bottomGeometry = new THREE.CylinderGeometry(
		bowlRadius,
		bowlRadius,
		0.2,
		64,
	);
	// 底メッシュの作成
	const bottomMesh = new THREE.Mesh(bottomGeometry, bowlMaterial);
	// シャドウ受信の有効化
	bottomMesh.receiveShadow = true;
	// グループへの追加
	bowlGroup.add(bottomMesh);

	// 壁シェイプの作成
	const wallShape = new THREE.Shape();
	// 外側円弧の追加
	wallShape.absarc(0, 0, bowlRadius, 0, Math.PI * 2, false);
	// 穴パスの作成
	const holePath = new THREE.Path();
	// 内側円弧の追加
	holePath.absarc(0, 0, bowlRadius - bowlWallThickness, 0, Math.PI * 2, true);
	wallShape.holes.push(holePath);
	const extrudeSettings = { depth: bowlHeight, bevelEnabled: false };
	const wallGeometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
	const wallMesh = new THREE.Mesh(wallGeometry, bowlMaterial);
	wallMesh.rotation.x = -Math.PI / 2;
	wallMesh.receiveShadow = true;
	bowlGroup.add(wallMesh);
	scene.add(bowlGroup);

	const bowlFloorBody = new CANNON.Body({
		mass: 0,
		material: bowlFloorMaterial,
	});
	// Three.js の底ジオメトリ（高さ 0.2）に合わせて物理形状も高さ 0.2 に設定し、
	// オフセットを 0 に揃えて視覚と物理のトップ面を一致させます。
	const bottomShape = new CANNON.Cylinder(bowlRadius, bowlRadius, 0.2, 32);
	bowlFloorBody.addShape(bottomShape, new CANNON.Vec3(0, 0, 0));
	world.addBody(bowlFloorBody);

	const bowlWallBody = new CANNON.Body({ mass: 0, material: bowlWallMaterial });
	const wallSegments = 32;
	const segmentAngle = (Math.PI * 2) / wallSegments;
	const segmentWidth = 2 * bowlRadius * Math.tan(segmentAngle / 2);
	const wallShapeCannon = new CANNON.Box(
		new CANNON.Vec3(segmentWidth / 2, bowlHeight / 2, physicsWallThickness / 2),
	);
	const wallPlacementRadius = bowlRadius - physicsWallThickness / 2;

	for (let i = 0; i < wallSegments; i++) {
		const angle = i * segmentAngle;
		const position = new CANNON.Vec3(
			wallPlacementRadius * Math.cos(angle),
			bowlHeight / 2,
			wallPlacementRadius * Math.sin(angle),
		);
		const quaternion = new CANNON.Quaternion();
		quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
		bowlWallBody.addShape(wallShapeCannon, position, quaternion);
	}
	world.addBody(bowlWallBody);
}

/**
 * @function createDice
 * @description 3つのサイコロを視覚的および物理的に作成します。
 */
function createDice(dicePhysicsMaterial: CANNON.Material): void {
	// サイコロジオメトリの作成
	const diceGeometry = new THREE.BoxGeometry(diceSize, diceSize, diceSize);
	// 3つのサイコロを作成
	for (let i = 0; i < 3; i++) {
		const dieMaterials: DiceMaterial[] = [];
		const die: DiceMesh = new THREE.Mesh(diceGeometry, dieMaterials);
		// シャドウキャストの有効化
		die.castShadow = true;
		// シーンへの追加
		scene.add(die);
		// サイコロ配列への追加
		dice.push(die);

		// 物理ボディの作成
		const body = new CANNON.Body({
			mass: 1,
			shape: new CANNON.Box(
				new CANNON.Vec3(diceSize / 2, diceSize / 2, diceSize / 2),
			),
			material: dicePhysicsMaterial,
			// Why: 減衰値を上げることで、サイコロがエネルギーを失いやすくなり、
			// より早く、より自然に停止するようになります。これにより、停止直前の
			// 不自然な振動や動き（ジッター）を効果的に抑制します。
			// 角速度減衰の設定
			angularDamping: 0.5,
			// 線速度減衰の設定
			linearDamping: 0.5,
		});
		// 衝突応答の有効化
		body.collisionResponse = true;
		enableContinuousCollisionDetection(body);

		// 衝突イベントリスナーの追加
		body.addEventListener("collide", (event) => {
			// 衝突速度の取得
			const impactVelocity = event.contact.getImpactVelocityAlongNormal();
			if (impactVelocity > 0.5) {
				// 相手のマテリアル名を取得
				const otherBodyMaterialName = event.body.material
					? event.body.material.name
					: "";
				if (otherBodyMaterialName === "dice") {
					// サイコロ同士の衝突音再生
					soundManager.playDiceCollision(impactVelocity);
				} else if (
					otherBodyMaterialName === "bowlFloor" ||
					otherBodyMaterialName === "bowlWall"
				) {
					// 丼との衝突音再生
					soundManager.playBowlCollision(impactVelocity);
				}
			}
		});

		// 物理世界へのボディ追加
		world.addBody(body);
		// ボディ配列への追加
		diceBodies.push(body);
	}
	// サイコロマテリアルの更新
	updateDiceMaterials();
}

/**
 * @function setupContactMaterials
 * @description 異なるマテリアル間の物理的相互作用プロパティを定義します。
 * Why: 摩擦と反発の値を調整し、より自然な挙動を目指します。
 * 摩擦を上げることで、サイコロは滑るよりも転がりやすくなります。
 * 反発を微調整することで、硬い表面での現実的な跳ね返りを再現します。
 */
function setupContactMaterials(
	diceMat: CANNON.Material,
	floorMat: CANNON.Material,
	wallMat: CANNON.Material,
): void {
	// サイコロと丼の底の接触
	const diceBowlFloorContact = new CANNON.ContactMaterial(floorMat, diceMat, {
		friction: 0.3, // 摩擦を増加させ、転がりを促進
		restitution: 0.45, // 反発を少し減少させ、エネルギー損失を表現
		contactEquationStiffness: 1e8, // 接触の剛性を高め、めり込みを防止
		contactEquationRelaxation: 2, // 接触の緩和を減らし、反発を硬くする
	});
	world.addContactMaterial(diceBowlFloorContact);

	// サイコロと丼の壁の接触
	const diceBowlWallContact = new CANNON.ContactMaterial(wallMat, diceMat, {
		friction: 0.2, // 壁との摩擦も少し増加
		restitution: 0.6, // 壁との反発は高めに維持
		contactEquationStiffness: 1e8,
		contactEquationRelaxation: 2,
	});
	world.addContactMaterial(diceBowlWallContact);

	// サイコロ同士の接触
	const diceDiceContactMaterial = new CANNON.ContactMaterial(diceMat, diceMat, {
		friction: 0.2, // 摩擦を増加
		restitution: 0.35, // 反発を減少させ、衝突時のエネルギー吸収を表現
		contactEquationStiffness: 1e8,
		contactEquationRelaxation: 2,
	});
	world.addContactMaterial(diceDiceContactMaterial);
}

/**
 * @function updateDiceMaterials
 * @description 選択されたサイコロの種類に基づいて、テクスチャを適用します。
 */
function updateDiceMaterials(): void {
	let faceSet: number[];
	switch (diceType) {
		case "shigoro":
			faceSet = [4, 4, 5, 5, 6, 6];
			break;
		case "pinzoro":
			faceSet = [1, 1, 1, 1, 1, 1];
			break;
		case "hifumi":
			faceSet = [1, 1, 2, 2, 3, 3];
			break; // ヒフミ賽用の出目
		default:
			faceSet = [1, 6, 2, 5, 3, 4];
			break;
	}
	for (const die of dice) {
		for (const material of die.material) {
			material.dispose();
		}
		die.material = faceSet.map(
			(value) =>
				new THREE.MeshStandardMaterial({ map: createDiceTexture(value) }),
		);
	}
}

/**
 * @function createDiceTexture
 * @description サイコロの面のテクスチャを生成します。
 */
function createDiceTexture(value: number): THREE.CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = 128;
	canvas.height = 128;
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error(
			"2D rendering context is not available in this environment.",
		);
	}
	context.fillStyle = "#f0ead6";
	context.fillRect(0, 0, 128, 128);
	const dotRadius = 12;
	const positions: Record<number, Array<[number, number]>> = {
		1: [[0.5, 0.5]],
		2: [
			[0.25, 0.25],
			[0.75, 0.75],
		],
		3: [
			[0.25, 0.25],
			[0.5, 0.5],
			[0.75, 0.75],
		],
		4: [
			[0.25, 0.25],
			[0.75, 0.25],
			[0.25, 0.75],
			[0.75, 0.75],
		],
		5: [
			[0.25, 0.25],
			[0.75, 0.25],
			[0.5, 0.5],
			[0.25, 0.75],
			[0.75, 0.75],
		],
		6: [
			[0.25, 0.25],
			[0.75, 0.25],
			[0.25, 0.5],
			[0.75, 0.5],
			[0.25, 0.75],
			[0.75, 0.75],
		],
	};
	context.fillStyle = value === 1 ? "#c0392b" : "#2c3e50";
	const activePositions = positions[value];
	if (activePositions) {
		for (const [x, y] of activePositions) {
			context.beginPath();
			context.arc(x * 128, y * 128, dotRadius, 0, Math.PI * 2);
			context.fill();
		}
	}
	return new THREE.CanvasTexture(canvas);
}

/**
 * @function resetDiceToStartPosition
 * @description サイコロを初期位置にリセットします。
 */
function resetDiceToStartPosition() {
	soundManager.playClickSound();
	// 初期位置をわずかに上げて、物理的なめり込みを防止します（Y 座標を +0.2 ほど上げる）。
	const startPositions = [
		new CANNON.Vec3(0, 4.7, 0.3),
		new CANNON.Vec3(-0.3, 4.9, -0.2),
		new CANNON.Vec3(0.3, 5.1, -0.2),
	];
	diceBodies.forEach((body, i) => {
		body.velocity.set(0, 0, 0);
		body.angularVelocity.set(0, 0, 0);
		body.position.copy(startPositions[i]);
		const randomAxis = new CANNON.Vec3(
			Math.random(),
			Math.random(),
			Math.random(),
		).unit();
		const randomAngle = Math.random() * Math.PI * 2;
		body.quaternion.setFromAxisAngle(randomAxis, randomAngle);
		dice[i].position.copy(body.position);
		dice[i].quaternion.copy(body.quaternion);
		dice[i].visible = true;
	});
}

/**
 * @function startCharging
 * @description パワーチャージシーケンスを開始します。
 */
function startCharging() {
	if (gameState !== "ready") return;
	soundManager.playClickSound();
	resetDiceToStartPosition();
	rearrangeButton.style.display = "block";
	diceTypeSelector.disabled = true;
	gameState = "charging";
	resultTitle.textContent = "…";
	resultDescription.textContent = "画面をクリックしてパワーを決定";
	rollButton.style.display = "none";
	powerMeterContainer.style.display = "block";
	power = 0;
	powerDirection = 1;
	powerAnimationId = requestAnimationFrame(updatePowerMeter);
}

/**
 * @function updatePowerMeter
 * @description パワーメーターバーをアニメーション化します。
 */
function updatePowerMeter() {
	power += powerDirection * 2.0;
	if (power >= 100) {
		power = 100;
		powerDirection = -1;
	} else if (power <= 0) {
		power = 0;
		powerDirection = 1;
	}
	powerMeterBar.style.width = `${power}%`;
	if (gameState === "charging")
		powerAnimationId = requestAnimationFrame(updatePowerMeter);
}

/**
 * @function decidePower
 * @description パワーメーターを停止し、ロールを開始します。
 */
function decidePower() {
	if (gameState !== "charging") return;
	soundManager.playClickSound();
	if (powerAnimationId !== null) {
		cancelAnimationFrame(powerAnimationId);
		powerAnimationId = null;
	}
	rearrangeButton.style.display = "none";
	rollDice(power);
}

/**
 * @function rollDice
 * @description 指定されたパワーでサイコロを投げます。
 * Why: この関数は、より物理的に正確なアプローチを採用するために完全に再設計されました。
 * 速度と角速度を個別に計算する代わりに、`applyImpulse` を使用します。
 * サイコロの表面上のランダムな点にインパルス（力積）を適用することで、直線運動と回転運動が
 * 自然かつ同時に発生し、よりリアルで予測不可能な転がり方が生まれます。
 * これは、手の中でサイコロを振って投げる実際の物理現象を忠実に模倣しています。
 */
function rollDice(throwPower: number, isInitialSetup = false): void {
	gameState = isInitialSetup ? "initializing" : "rolling";
	if (!isInitialSetup) {
		rollStartTime = performance.now();
	}
	nudgeButton.style.display = "none";
	shonbenTimers.fill(0);

	const powerRatio = (throwPower / 100) ** 1.5;

	if (isInitialSetup) {
		// 初期セットアップ：サイコロを優しく落とす
		// 初期ドロップ位置を少し上げ、底との衝突でめり込まないようにする
		const startPositions = [
			new CANNON.Vec3(0, 4.2, 0.6),
			new CANNON.Vec3(-0.6, 4.7, -0.3),
			new CANNON.Vec3(0.6, 5.2, -0.3),
		];
		diceBodies.forEach((body, i) => {
			dice[i].visible = true;
			body.wakeUp();
			body.position.copy(startPositions[i]);
			const randomAxis = new CANNON.Vec3(
				Math.random(),
				Math.random(),
				Math.random(),
			).unit();
			body.quaternion.setFromAxisAngle(randomAxis, Math.random() * Math.PI * 2);
			body.velocity.set(0, 0, 0);
			body.angularVelocity.set(
				(Math.random() - 0.5) * 3,
				(Math.random() - 0.5) * 3,
				(Math.random() - 0.5) * 3,
			);
		});
	} else {
		// プレイヤーによる投擲：インパルスを適用
		diceBodies.forEach((body, i) => {
			dice[i].visible = true;
			body.wakeUp();
			const meshPosition = dice[i].position;
			body.position.set(meshPosition.x, meshPosition.y, meshPosition.z);
			const meshQuaternion = dice[i].quaternion;
			body.quaternion.set(
				meshQuaternion.x,
				meshQuaternion.y,
				meshQuaternion.z,
				meshQuaternion.w,
			);

			// インパルスの大きさを計算
			const minImpulse = 4.5;
			const maxImpulse = 8.0;
			const impulseMagnitude =
				minImpulse + (maxImpulse - minImpulse) * powerRatio;

			// 丼の中心付近を狙う、わずかにランダムな方向ベクトルを生成
			const targetPoint = new CANNON.Vec3(
				(Math.random() - 0.5) * bowlRadius * 0.3,
				-bowlHeight * 0.5, // 少し下向きに
				(Math.random() - 0.5) * bowlRadius * 0.3,
			);
			const impulseDirection = targetPoint.vsub(body.position).unit();
			const impulse = impulseDirection.scale(impulseMagnitude);

			// サイコロの中心からずれたランダムな点にインパルスを適用し、自然な回転を生み出す
			const pointOfApplication = new CANNON.Vec3(
				(Math.random() - 0.5) * diceSize * 0.8,
				(Math.random() - 0.5) * diceSize * 0.8,
				(Math.random() - 0.5) * diceSize * 0.8,
			);

			body.applyImpulse(impulse, pointOfApplication);
		});
	}
}

/**
 * @function nudgeDice
 * @description スタックしたサイコロに小さなランダムなインパルスを適用します。
 */
function nudgeDice() {
	if (gameState !== "rolling") return;
	soundManager.playClickSound();
	const nudgeForce = 5;
	diceBodies.forEach((body) => {
		body.wakeUp();
		const force = new CANNON.Vec3(
			(Math.random() - 0.5) * nudgeForce,
			Math.random() * nudgeForce,
			(Math.random() - 0.5) * nudgeForce,
		);
		const point = new CANNON.Vec3(
			(Math.random() - 0.5) * diceSize * 0.5,
			(Math.random() - 0.5) * diceSize * 0.5,
			(Math.random() - 0.5) * diceSize * 0.5,
		);
		body.applyImpulse(force, point);
	});
	nudgeButton.style.display = "none";
}

/**
 * @function getDiceFace
 * @description サイコロのどの面が上を向いているかを決定します。
 */
function getDiceFace(body: CANNON.Body): number {
	const up = new CANNON.Vec3(0, 1, 0);
	let maxDot = -1,
		topFace = -1;
	const faceVectors = [
		new CANNON.Vec3(1, 0, 0),
		new CANNON.Vec3(-1, 0, 0),
		new CANNON.Vec3(0, 1, 0),
		new CANNON.Vec3(0, -1, 0),
		new CANNON.Vec3(0, 0, 1),
		new CANNON.Vec3(0, 0, -1),
	];
	let faceValues: number[];
	switch (diceType) {
		case "shigoro":
			faceValues = [4, 4, 5, 5, 6, 6];
			break;
		case "pinzoro":
			faceValues = [1, 1, 1, 1, 1, 1];
			break;
		case "hifumi":
			faceValues = [1, 1, 2, 2, 3, 3];
			break; // ヒフミ賽用の値マッピング
		default:
			faceValues = [1, 6, 2, 5, 3, 4];
			break;
	}
	for (let i = 0; i < faceVectors.length; i++) {
		const worldVector = body.quaternion.vmult(faceVectors[i]);
		const dot = worldVector.dot(up);
		if (dot > maxDot) {
			maxDot = dot;
			topFace = faceValues[i];
		}
	}
	return topFace;
}

/**
 * @function finishRoll
 * @description 結果をUIに更新し、ゲーム状態をリセットします。
 */
function finishRoll(result: string, desc: string): void {
	resultTitle.textContent = result;
	resultDescription.textContent = desc;
	nudgeButton.style.display = "none";
	rearrangeButton.style.display = "none";
	diceTypeSelector.disabled = false;
	gameState = "ready";
	rollButton.style.display = "block";
	rollButton.disabled = false;
}

/**
 * @function areAllDiceStable
 * @description サイコロが平らな面に落ち着いているかチェックします。
 */
function areAllDiceStable(): boolean {
	const STABILITY_THRESHOLD = 0.99;
	for (let i = 0; i < diceBodies.length; i++) {
		if (!dice[i].visible) continue;
		const body = diceBodies[i];
		let isStable = false;
		const localAxes = [
			new CANNON.Vec3(1, 0, 0),
			new CANNON.Vec3(0, 1, 0),
			new CANNON.Vec3(0, 0, 1),
		];
		for (const axis of localAxes) {
			const worldAxis = body.quaternion.vmult(axis);
			const dotProduct = Math.abs(worldAxis.dot(new CANNON.Vec3(0, 1, 0)));
			if (dotProduct > STABILITY_THRESHOLD) {
				isStable = true;
				break;
			}
		}
		if (!isStable) return false;
	}
	return true;
}

/**
 * @function checkAndDisplayResult
 * @description サイコロの値をチェックし、結果を表示します。
 */
function checkAndDisplayResult(): void {
	rollButton.disabled = true;
	const visibleDiceBodies = diceBodies.filter(
		(_, index) => dice[index].visible,
	);

	if (visibleDiceBodies.length < 3) {
		soundManager.playFoulSound();
		finishRoll("ションベン！", "サイコロが丼から出てしまいました。");
		return;
	}

	const values = visibleDiceBodies.map(getDiceFace).sort((a, b) => a - b);
	let title = "";
	const description = `出目: ${values.join(", ")}`;
	const counts = new Map<number, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	const countValues = [...counts.values()];
	let hasWon = false;
	if (countValues.some((count) => count === 3)) {
		title = values[0] === 1 ? "ピンゾロ" : "アラシ";
		hasWon = true;
	} else if (countValues.some((count) => count === 2)) {
		const singleEntry = [...counts.entries()].find(([, count]) => count === 1);
		if (singleEntry) {
			const diceFaceKanji = ["", "一", "二", "三", "四", "五", "六"] as const;
			const singleValue = singleEntry[0];
			title = `${diceFaceKanji[singleValue] ?? singleValue.toString()}の目`;
		} else {
			title = "目なし";
		}
	} else if (values.join("") === "123") {
		title = "ヒフミ";
	} else if (values.join("") === "456") {
		title = "シゴロ";
		hasWon = true;
	} else {
		title = "目なし";
	}

	if (title === "ヒフミ") {
		soundManager.playFoulSound();
	} else if (hasWon) {
		soundManager.playWinSound();
	} else if (title === "目なし") {
		soundManager.playLoseSound();
	} else if (title.includes("の目")) {
		soundManager.playPairSound();
	}

	finishRoll(title, description);
}

let lastCheckTime = 0;
/**
 * @function animate
 * @description メインのアニメーションループ。
 */
function animate() {
	requestAnimationFrame(animate);
	const deltaTime = clock.getDelta();

	if (gameState === "rolling" || gameState === "initializing") {
		world.step(1 / 60, deltaTime, 20);
		for (let i = 0; i < dice.length; i++) {
			dice[i].position.copy(diceBodies[i].position);
			dice[i].quaternion.copy(diceBodies[i].quaternion);
		}
	}

	particleEmitter.update(deltaTime);
	controls.update();
	renderer.render(scene, camera);

	if (gameState === "charging") {
		const elapsedTime = clock.getElapsedTime();
		const orbitRadius = 0.4;
		const orbitSpeed = 60.0;
		const rotationSpeed = 40.0;
		dice.forEach((die, i) => {
			const angle = elapsedTime * orbitSpeed + (i * 2 * Math.PI) / 3;
			const bodyPos = diceBodies[i].position;
			die.position.x = bodyPos.x + Math.cos(angle) * orbitRadius;
			die.position.z = bodyPos.z + Math.sin(angle) * orbitRadius;
			die.position.y =
				bodyPos.y + Math.sin(elapsedTime * (orbitSpeed * 1.5) + i) * 0.1;
			const q = new THREE.Quaternion().setFromAxisAngle(
				new THREE.Vector3(1, 1, 1).normalize(),
				(rotationSpeed + i * 0.5) * deltaTime,
			);
			die.quaternion.premultiply(q);
		});
	}

	if (gameState === "rolling" || gameState === "initializing") {
		const now = performance.now();

		for (let i = 0; i < diceBodies.length; i++) {
			const body = diceBodies[i];
			if (!dice[i].visible) continue;
			const horizontalDistSq =
				body.position.x * body.position.x + body.position.z * body.position.z;
			const isOutside = horizontalDistSq > bowlRadius * bowlRadius;
			const isBelow = body.position.y < -0.5;
			if (isOutside && isBelow) {
				if (shonbenTimers[i] === 0) shonbenTimers[i] = now;
				else if (now - shonbenTimers[i] > SHONBEN_GRACE_PERIOD_MS) {
					dice[i].visible = false;
					body.sleep();
					body.position.set(0, -100 - i, 0);
					particleEmitter.trigger(dice[i].position);
				}
			} else {
				shonbenTimers[i] = 0;
			}
		}

		const isStill = diceBodies.every(
			(body) =>
				body.sleepState === CANNON.Body.SLEEPING ||
				!dice[diceBodies.indexOf(body)].visible,
		);

		if (isStill) {
			if (areAllDiceStable()) {
				if (gameState === "initializing") {
					gameState = "ready";
					rollButton.disabled = false;
				} else if (gameState === "rolling") {
					if (lastCheckTime === 0) lastCheckTime = now;
					else if (now - lastCheckTime > 200) {
						lastCheckTime = 0;
						gameState = "checking";
						checkAndDisplayResult();
					}
				}
			} else {
				lastCheckTime = 0;
			}
		} else {
			lastCheckTime = 0;
		}

		if (gameState === "rolling") {
			const elapsedTime = now - rollStartTime;
			if (elapsedTime > STUCK_THRESHOLD_MS) {
				nudgeButton.style.display = "block";
			}
		} else {
			nudgeButton.style.display = "none";
		}
	}
}

/**
 * @function onWindowResize
 * @description ウィンドウリサイズイベントを処理します。
 */
function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
