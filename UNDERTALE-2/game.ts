import { DIRECTION_MAP } from "./constants.js";
import {
	applyPlayfieldSize,
	changePlayfieldSize,
	clearDebugMarkers,
	currentPattern,
	isDebugEnabled,
	isSpawnMarkersEnabled,
	PATTERN_EDGE_MAP,
	PLAYFIELD_SIZE_STEP,
	refreshSpawnLines,
	type SpawnPattern,
	setActivePlayfield,
	setSpawnPattern,
	toggleDebug,
	toggleSpawnMarkers,
} from "./debug.js";
import {
	clearAllEntities,
	detectCollisions,
	getHomingEnabled,
	getRemoveBulletsOnHit,
	setHomingEnabled,
	setRemoveBulletsOnHit,
	spawnEntity,
	updateEntities,
} from "./entity.js";
import { changeHeartColor, updatePlayerPosition } from "./player.js";
import type { EnemySymbol } from "./types.js";

/** 前回のフレーム更新時刻のタイムスタンプ */
let lastTimestamp = performance.now();
/** 現在押されているキーのセット */
const pressedKeys = new Set<string>();
/** シナリオ用のスポーンinterval */
let activeSpawnTimer: number | null = null;
/** 敵シンボルの配列 */
const enemySymbols: EnemySymbol[] = [];

/**
 * ゲームのメインループを開始する
 * @param {HTMLElement} playfield - プレイフィールドのHTML要素
 */
export const startGameLoop = (playfield: HTMLElement) => {
	setActivePlayfield(playfield);

	// Log initial setting so it's visible on start (helpful during development)
	console.log(
		`Bullet removal on hit (default): ${getRemoveBulletsOnHit() ? "ON" : "OFF"}`,
	);

	let running = true;

	const loop = (timestamp: number) => {
		// 前フレームからの経過秒数を算出
		const delta = (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;

		// プレイヤーの移動 → エンティティ挙動 → 当たり判定の順に処理
		updatePlayerPosition(delta, pressedKeys, playfield);
		updateEntities(delta, playfield);
		detectCollisions();
		// 次フレームをスケジュールしてループを継続
		if (running) requestAnimationFrame(loop);
	};

	requestAnimationFrame(loop);

	// gamestop: immediately stop the loop and clear entities (fired before animation)
	const onGameStop = () => {
		running = false;
		if (activeSpawnTimer !== null) {
			window.clearInterval(activeSpawnTimer);
			activeSpawnTimer = null;
		}
		try {
			clearAllEntities();
		} catch (err) {
			console.error("Failed to clear entities on gamestop", err);
		}
		console.log("Game stop received - stopping loop and spawn timer");
	};
	document.addEventListener("gamestop", onGameStop, { once: true });

	// gameover: after animation completes - we don't need to stop loop again,
	// but keep a listener to perform any UI tasks if necessary
	const onGameOver = () => {
		console.log("Game over animation completed");
	};
	document.addEventListener("gameover", onGameOver, { once: true });
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
		toggleDebug();
		console.log(`Debug markers: ${isDebugEnabled() ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "p") {
		// P: スポーンマーカーの切り替え
		toggleSpawnMarkers();
		console.log(`Spawn markers: ${isSpawnMarkersEnabled() ? "ON" : "OFF"}`);
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
		clearDebugMarkers();
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

	setActivePlayfield(pf);
	setSpawnPattern(pattern);
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

/**
 * 敵シンボルを追加する
 * @param {string} id - 敵シンボルのID
 * @param {"emoji" | "image"} type - タイプ
 * @param {string} content - コンテンツ（絵文字または画像URL）
 */
export const addEnemySymbol = (
	id: string,
	type: "emoji" | "image",
	content: string,
) => {
	const enemyDisplay = document.getElementById("enemy-display");
	if (!(enemyDisplay instanceof HTMLElement)) return;

	// 既存のシンボルがある場合は削除
	removeEnemySymbol(id);

	const symbol: EnemySymbol = { id, type, content };

	if (type === "emoji") {
		// テキストノードではなく span を使って flex の子要素にする
		const span = document.createElement("span");
		span.className = "enemy-symbol";
		span.textContent = content;
		symbol.element = span;
		enemyDisplay.appendChild(span);
	} else if (type === "image") {
		const img = document.createElement("img");
		img.src = content;
		img.alt = `Enemy ${id}`;
		img.className = "enemy-symbol";
		symbol.element = img;
		enemyDisplay.appendChild(img);
	}

	enemySymbols.push(symbol);
};

/**
 * 敵シンボルを削除する
 * @param {string} id - 敵シンボルのID
 */
export const removeEnemySymbol = (id: string) => {
	const index = enemySymbols.findIndex((s) => s.id === id);
	if (index === -1) return;

	const symbol = enemySymbols[index];
	if (symbol.element?.parentElement) {
		symbol.element.parentElement.removeChild(symbol.element);
	}
	enemySymbols.splice(index, 1);
};

/**
 * すべての敵シンボルをクリアする
 */
export const clearEnemySymbols = () => {
	enemySymbols.forEach((symbol) => {
		if (symbol.element?.parentElement) {
			symbol.element.parentElement.removeChild(symbol.element);
		}
	});
	enemySymbols.length = 0;
};
