import { DIRECTION_MAP } from "./constants.js";
import debug, { type SpawnEdge } from "./debug.js";
import {
	detectCollisions,
	getHomingEnabled,
	getRemoveBulletsOnHit,
	setHomingEnabled,
	setRemoveBulletsOnHit,
	spawnEntity,
	updateEntities,
} from "./entity.js";
import {
	changeHeartColor,
	clampPlayerToBounds,
	updatePlayerPosition,
} from "./player.js";

/** 前回のフレーム更新時刻のタイムスタンプ */
let lastTimestamp = performance.now();
/** 現在押されているキーのセット */
const pressedKeys = new Set<string>();
/** スポーンパターンの種類 */
export type SpawnPattern = "omnidirectional" | "top-only";

/** パターンごとに有効なスポーン辺を定義 */
const PATTERN_EDGE_MAP: Record<SpawnPattern, SpawnEdge[]> = {
	omnidirectional: ["top", "right", "bottom", "left"],
	"top-only": ["top"],
};

const PLAYFIELD_MIN_WIDTH = 240;
const PLAYFIELD_MAX_WIDTH = 720;
const PLAYFIELD_MIN_HEIGHT = 240;
const PLAYFIELD_MAX_HEIGHT = 720;
const PLAYFIELD_SIZE_STEP = 40;

/** 現在のスポーンパターン */
let currentPattern: SpawnPattern = "omnidirectional";
/** スポーン制御に利用するプレイフィールド要素 */
let activePlayfield: HTMLElement | null = null;
/** シナリオ用のスポーンinterval */
let activeSpawnTimer: number | null = null;
let playfieldWidth = 360;
let playfieldHeight = 360;

/** パターンに応じてデバッグラインを更新する */
const refreshSpawnLines = () => {
	if (!activePlayfield || typeof debug.drawSpawnLines !== "function") return;
	debug.drawSpawnLines(activePlayfield, PATTERN_EDGE_MAP[currentPattern]);
};

const clampSize = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(value, max));

const applyPlayfieldSize = () => {
	if (!activePlayfield) return;
	activePlayfield.style.width = `${Math.round(playfieldWidth)}px`;
	activePlayfield.style.height = `${Math.round(playfieldHeight)}px`;
	clampPlayerToBounds(activePlayfield);
	refreshSpawnLines();
};

const changePlayfieldSize = (deltaWidth: number, deltaHeight: number) => {
	if (!activePlayfield) return;
	playfieldWidth = clampSize(
		playfieldWidth + deltaWidth,
		PLAYFIELD_MIN_WIDTH,
		PLAYFIELD_MAX_WIDTH,
	);
	playfieldHeight = clampSize(
		playfieldHeight + deltaHeight,
		PLAYFIELD_MIN_HEIGHT,
		PLAYFIELD_MAX_HEIGHT,
	);
	applyPlayfieldSize();
	console.log(
		`Playfield size: ${Math.round(playfieldWidth)} x ${Math.round(playfieldHeight)}`,
	);
};

/**
 * ゲームのメインループを開始する
 * @param {HTMLElement} playfield - プレイフィールドのHTML要素
 */
export const startGameLoop = (playfield: HTMLElement) => {
	activePlayfield = playfield;
	playfieldWidth = playfield.clientWidth;
	playfieldHeight = playfield.clientHeight;
	applyPlayfieldSize();

	const loop = (timestamp: number) => {
		// 前フレームからの経過秒数を算出
		const delta = (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;

		// プレイヤーの移動 → エンティティ挙動 → 当たり判定の順に処理
		updatePlayerPosition(delta, pressedKeys, playfield);
		updateEntities(delta, playfield);
		detectCollisions();

		// 次フレームをスケジュールしてループを継続
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
};

/**
 * キーが押されたときのイベントハンドラ
 * @param {KeyboardEvent} event - キーボードイベント
 */
export const handleKeyDown = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();

	if (DIRECTION_MAP[key as keyof typeof DIRECTION_MAP]) {
		// 移動系キー
		pressedKeys.add(key);
		event.preventDefault();
	} else if (key === " ") {
		// スペースキー: ハート色を変更
		changeHeartColor();
		event.preventDefault();
	} else if (key === "t") {
		// T: 衝突時に弾を消すモードを切り替え
		const newValue = !getRemoveBulletsOnHit();
		setRemoveBulletsOnHit(newValue);
		console.log(`Bullet removal on hit: ${newValue ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "h") {
		// H: ホーミング挙動の切り替え
		const newValue = !getHomingEnabled();
		setHomingEnabled(newValue);
		console.log(`Homing: ${newValue ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "m") {
		// M: デバッグ表示の切り替え
		debug.toggleDebug();
		console.log(`Debug markers: ${debug.isDebugEnabled() ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "p") {
		// P: スポーンマーカーの切り替え
		debug.toggleSpawnMarkers();
		console.log(
			`Spawn markers: ${debug.isSpawnMarkersEnabled() ? "ON" : "OFF"}`,
		);
		event.preventDefault();
	} else if (key === "q") {
		// Q: プレイフィールド幅を縮小
		changePlayfieldSize(-PLAYFIELD_SIZE_STEP, 0);
		event.preventDefault();
	} else if (key === "e") {
		// E: プレイフィールド幅を拡張
		changePlayfieldSize(PLAYFIELD_SIZE_STEP, 0);
		event.preventDefault();
	} else if (key === "r") {
		// R: プレイフィールド高さを縮小
		changePlayfieldSize(0, -PLAYFIELD_SIZE_STEP);
		event.preventDefault();
	} else if (key === "f") {
		// F: プレイフィールド高さを拡張
		changePlayfieldSize(0, PLAYFIELD_SIZE_STEP);
		event.preventDefault();
	} else if (key === "1") {
		// 1: スポーンパターン1（全方向）
		setSpawnPattern("omnidirectional");
		console.log("Spawn pattern: 1 (omnidirectional)");
		event.preventDefault();
	} else if (key === "2") {
		// 2: スポーンパターン2（上からのみ）
		setSpawnPattern("top-only");
		console.log("Spawn pattern: 2 (top-only)");
		event.preventDefault();
	} else if (key === "M") {
		// Shift+M: 配置済みマーカーを一括クリア
		debug.clearDebugMarkers();
		event.preventDefault();
	}
};

/**
 * キーが離されたときのイベントハンドラ
 * @param {KeyboardEvent} event - キーボードイベント
 */
export const handleKeyUp = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (pressedKeys.delete(key)) event.preventDefault();
};

/**
 * 押されているキーのセットをクリアする（ウィンドウがフォーカスを失ったときなどに使用）
 */
export const clearKeys = () => pressedKeys.clear();

/**
 * デモ用のシナリオを開始し、定期的にエンティティを生成する
 * @param {HTMLElement} [playfield] - プレイフィールドのHTML要素
 * @param {SpawnPattern} [pattern] - 使用するスポーンパターン
 */
export const startDemoScenario = (
	playfield?: HTMLElement,
	pattern: SpawnPattern = "omnidirectional",
) => {
	const pf = playfield ?? document.getElementById("playfield");
	if (!(pf instanceof HTMLElement)) return;

	activePlayfield = pf;
	currentPattern = pattern;
	playfieldWidth = pf.clientWidth;
	playfieldHeight = pf.clientHeight;
	applyPlayfieldSize();
	refreshSpawnLines();

	if (activeSpawnTimer !== null) {
		window.clearInterval(activeSpawnTimer);
	}

	const spawnOnce = () => {
		const width = pf.clientWidth;
		const height = pf.clientHeight;
		const edges = PATTERN_EDGE_MAP[currentPattern];
		const edgeLabel = edges[Math.floor(Math.random() * edges.length)] ?? "top";
		const speed = 80 + Math.random() * 60;
		let position: { x: number; y: number };

		// 弾が向かう目標点をプレイフィールド中央周辺のランダム位置に設定
		const target = {
			x: width / 2 + (Math.random() - 0.5) * width * 0.6,
			y: height / 2 + (Math.random() - 0.5) * height * 0.6,
		};

		// プレイフィールドの外周からエンティティを出現させる
		switch (edgeLabel) {
			case "top":
				position = { x: Math.random() * width, y: -60 };
				break;
			case "right":
				position = { x: width + 60, y: Math.random() * height };
				break;
			case "bottom":
				position = { x: Math.random() * width, y: height + 60 };
				break;
			default:
				position = { x: -60, y: Math.random() * height };
		}

		// 初速計算: 現在位置→目標への単位ベクトルに速度スカラーを乗算
		const vector = {
			x: target.x - position.x,
			y: target.y - position.y,
		};
		const vectorLength = Math.hypot(vector.x, vector.y) || 1;
		const velocity = {
			x: (vector.x / vectorLength) * speed,
			y: (vector.y / vectorLength) * speed,
		};

		// エンティティを生成
		spawnEntity({
			position,
			velocity,
			size: 20 + Math.random() * 16,
			shape:
				Math.random() > 0.5
					? "circle"
					: Math.random() > 0.5
						? "square"
						: Math.random() > 0.5
							? "star"
							: "triangle",
			color: `hsl(${Math.floor(Math.random() * 360)} 80% 60%)`,
			rotationSpeed: (Math.random() - 0.5) * Math.PI,
		});
	};

	activeSpawnTimer = window.setInterval(spawnOnce, 1600);
};

/** スポーンパターンを切り替える */
export const setSpawnPattern = (pattern: SpawnPattern) => {
	if (currentPattern === pattern) return;
	currentPattern = pattern;
	refreshSpawnLines();
};
