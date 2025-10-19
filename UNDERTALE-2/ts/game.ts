// プレイヤー進路予測用の前回座標を保持
let prevPlayerPos: { x: number; y: number } | null = null;

/** ブラスターの連続出現を防ぐフラグ */
let canSpawnBlaster = true;

/**
 * 前回のプレイヤー位置からブラスターのoffsetRatioを計算します。
 * @param side ブラスターの出現側
 * @param prevPos 前回のプレイヤー位置
 * @param stageWidth ステージの幅
 * @param stageHeight ステージの高さ
 * @returns offsetRatio (0-1)
 */
const getOffsetRatioFromPrevPos = (
	side: "top" | "right" | "bottom" | "left",
	prevPos: { x: number; y: number } | null,
	stageWidth: number,
	stageHeight: number,
): number => {
	if (!prevPos) return Math.random(); // フォールバック
	if (side === "left" || side === "right") {
		return prevPos.y / stageHeight;
	} else {
		return prevPos.x / stageWidth;
	}
};

/**
 * このファイルは、ゲームのメインロジックと進行を管理します。
 * - ゲームループの開始と管理
 * - キーボード入力の処理
 * - エンティティの出現（スポーン）シナリオ
 * - 敵シンボルの表示管理
 */

import { BLASTER_CONFIG, ENTITY_CONFIG, SPAWN_CONFIG } from "./config.ts";
import { DIRECTION_MAP, PLAYFIELD_SIZE_STEP } from "./constants.ts";
import {
	changePlayfieldSize,
	clearDebugMarkers,
	currentPattern,
	isDebugEnabled,
	isSpawnMarkersEnabled,
	PATTERN_EDGE_MAP,
	refreshSpawnLines,
	type SpawnPattern,
	setActivePlayfield,
	setSpawnPattern,
	toggleDebug,
	toggleSpawnMarkers,
} from "./debug.ts";
import {
	clearAllEntities,
	detectCollisions,
	getEntities,
	getHomingEnabled,
	getRemoveBulletsOnHit,
	removeAllBlasters,
	setHomingEnabled,
	setRemoveBulletsOnHit,
	spawnBlasterAttack,
	spawnEntity,
	suppressBlasterSpawns,
	updateEntities,
} from "./entity.ts";
import {
	changeHeartColor,
	getPlayerPosition,
	updatePlayerPosition,
} from "./player.ts";
import type { EnemyData, EnemySymbol } from "./types.ts";

/** 前回のフレーム更新時刻のタイムスタンプ */
let lastTimestamp = performance.now();
/** 現在押されているキーを保持するセット */
const pressedKeys = new Set<string>();
/** エンティティを定期的に生成するタイマーのID */
let activeSpawnTimer: number | null = null;
/** 画面上部に表示される敵シンボルのリスト */
const enemySymbols: EnemySymbol[] = [];
/** 敵のデータを管理するマップ（敵ID -> 敵データ） */
const enemyDataMap = new Map<string, EnemyData>();

/**
 * ゲームのメインループを開始します。
 * この関数は、ゲームの初期化時に一度だけ呼び出されます。
 * @param {HTMLElement} playfield - ゲームのプレイフィールドとなるDOM要素。
 */
export const startGameLoop = (playfield: HTMLElement) => {
	// デバッグモジュールにプレイフィールドを登録
	setActivePlayfield(playfield);

	// デフォルトでホーミングを有効にする
	setHomingEnabled(true);
	console.log(`Homing default: ${getHomingEnabled() ? "ON" : "OFF"}`);
	console.log(
		`Bullet removal on hit (default): ${getRemoveBulletsOnHit() ? "ON" : "OFF"}`,
	);

	let running = true;

	/**
	 * 毎フレーム実行されるゲームループ関数。
	 * @param {number} timestamp - requestAnimationFrameから渡されるタイムスタンプ。
	 */
	const loop = (timestamp: number) => {
		// 経過時間を計算 (秒単位)
		const delta = (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;

		// プレイヤーの前回位置を更新
		const currentPlayerPos = getPlayerPosition();
		prevPlayerPos = currentPlayerPos ? { ...currentPlayerPos } : null;

		// 各要素の状態を更新
		updatePlayerPosition(delta, pressedKeys, playfield);
		updateEntities(delta, playfield);
		try {
			detectCollisions();
		} catch (err) {
			// 衝突判定中にエラーが起きてもゲームが停止しないようにする
			console.error("Error during collision detection:", err);
		}

		// runningフラグがtrueの間、次のフレームを予約
		if (running) requestAnimationFrame(loop);
	};

	// 最初のフレームを予約してループを開始
	requestAnimationFrame(loop);

	/** ゲームが停止したときの処理 */
	const onGameStop = () => {
		running = false;
		// スポーンタイマーを停止
		if (activeSpawnTimer !== null) {
			window.clearInterval(activeSpawnTimer);
			activeSpawnTimer = null;
			// UIにスポーンが停止したことを通知
			document.dispatchEvent(new CustomEvent("game:spawningStopped"));
		}
		// すべてのエンティティをクリア
		try {
			clearAllEntities();
		} catch (err) {
			console.error("Failed to clear entities on gamestop", err);
		}
		console.log("Game stop received - stopping loop and spawn timer");
	};

	// 'gamestop' および 'gameclear' でゲームループを停止する
	document.addEventListener("gamestop", onGameStop, { once: true });
	document.addEventListener("gameclear", onGameStop, { once: true });

	/** ゲームオーバーになったときの処理 */
	const onGameOver = () => {
		console.log("Game over animation completed");
	};
	document.addEventListener("gameover", onGameOver, { once: true });
};

/**
 * キーボードのキーが押されたときのイベントハンドラ。
 * @param {KeyboardEvent} event - キーボードイベントオブジェクト。
 */
export const handleKeyDown = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();

	// 移動キーが押された場合
	if (DIRECTION_MAP[key as keyof typeof DIRECTION_MAP]) {
		pressedKeys.add(key);
		event.preventDefault(); // ページのスクロールなどを防ぐ
	}
	// デバッグ用のショートカットキー
	else if (key === "t") {
		// 衝突時エンティティ削除の切り替え
		const newValue = !getRemoveBulletsOnHit();
		setRemoveBulletsOnHit(newValue);
		console.log(`Bullet removal on hit: ${newValue ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "h") {
		// ホーミングの切り替え
		const newValue = !getHomingEnabled();
		setHomingEnabled(newValue);
		console.log(`Homing: ${newValue ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "m") {
		// デバッグ表示全体の切り替え
		toggleDebug();
		console.log(`Debug markers: ${isDebugEnabled() ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "p") {
		// スポーンマーカー表示の切り替え
		toggleSpawnMarkers();
		console.log(`Spawn markers: ${isSpawnMarkersEnabled() ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "q") {
		// プレイフィールドの幅を縮小
		changePlayfieldSize(-PLAYFIELD_SIZE_STEP, 0);
		event.preventDefault();
	} else if (key === "e") {
		// プレイフィールドの幅を拡大
		changePlayfieldSize(PLAYFIELD_SIZE_STEP, 0);
		event.preventDefault();
	} else if (key === "r") {
		// プレイフィールドの高さを縮小
		changePlayfieldSize(0, -PLAYFIELD_SIZE_STEP);
		event.preventDefault();
	} else if (key === "f") {
		// プレイフィールドの高さを拡大
		changePlayfieldSize(0, PLAYFIELD_SIZE_STEP);
		event.preventDefault();
	} else if (key === "1") {
		// スポーンパターンを「全方向」に設定
		setSpawnPattern("omnidirectional");
		console.log("Spawn pattern: 1 (omnidirectional)");
		event.preventDefault();
	} else if (key === "2") {
		// スポーンパターンを「上からのみ」に設定
		setSpawnPattern("top-only");
		console.log("Spawn pattern: 2 (top-only)");
		event.preventDefault();
	} else if (key === "M") {
		// デバッグマーカーをすべてクリア
		clearDebugMarkers();
		event.preventDefault();
	} else if (key === "g") {
		// ハートの色を変更
		try {
			changeHeartColor();
		} catch (err) {
			console.error("changeHeartColor failed:", err);
		}
		event.preventDefault();
	}
};

/**
 * キーボードのキーが離されたときのイベントハンドラ。
 * @param {KeyboardEvent} event - キーボードイベントオブジェクト。
 */
export const handleKeyUp = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (pressedKeys.delete(key)) event.preventDefault();
};

/**
 * 押されているキーのセットをクリアします。
 * ウィンドウがフォーカスを失ったときなどに使用します。
 */
export const clearKeys = () => pressedKeys.clear();

/**
 * デモ用のエンティティ出現シナリオを開始します。
 * 一定間隔でランダムなエンティティを生成します。
 * @param {HTMLElement} [playfield] - プレイフィールドのDOM要素。
 * @param {SpawnPattern} [pattern="top-only"] - 使用するスポーンパターン。
 */
export const startDemoScenario = (
	playfield?: HTMLElement,
	pattern: SpawnPattern = "top-only",
) => {
	const pf = playfield ?? document.getElementById("playfield");
	if (!(pf instanceof HTMLElement)) return;

	// 戦闘開始時はブラスター生成抑止を解除
	try {
		suppressBlasterSpawns(false);
	} catch {}

	// スポーンパターンを設定し、ラインを再描画
	setSpawnPattern(pattern);
	refreshSpawnLines();

	// 既存のタイマーがあれば停止
	if (activeSpawnTimer !== null) {
		window.clearInterval(activeSpawnTimer);
	}

	/** 一体のエンティティを生成する関数 */
	const spawnOnce = () => {
		const width = pf.clientWidth;
		const height = pf.clientHeight;
		const edges = PATTERN_EDGE_MAP[currentPattern];
		const edgeLabel = edges[Math.floor(Math.random() * edges.length)] ?? "top";
		const speed =
			ENTITY_CONFIG.speedMin +
			Math.random() * (ENTITY_CONFIG.speedMax - ENTITY_CONFIG.speedMin);

		// ブラスター出現を SPAWN_CONFIG に従って判定
		if (
			canSpawnBlaster &&
			Math.random() < (SPAWN_CONFIG?.blasterChance ?? 0.18)
		) {
			const hue = Math.floor(Math.random() * 360);

			// 前回のプレイヤー位置を狙う
			const offsetRatio = getOffsetRatioFromPrevPos(
				edgeLabel as "top" | "right" | "bottom" | "left",
				prevPlayerPos,
				pf.clientWidth,
				pf.clientHeight,
			);

			spawnBlasterAttack({
				side: edgeLabel as "top" | "right" | "bottom" | "left",
				offsetRatio,
				color: `hsla(${hue} 92% 68% / 1)`,
				thickness: BLASTER_CONFIG.thickness,
				beamDurationMs: 1100,
			});

			// ブラスターの消滅後、次の出現まで待つ
			canSpawnBlaster = false;
			setTimeout(
				() => {
					canSpawnBlaster = true;
				},
				BLASTER_CONFIG.telegraphDurationMs +
					BLASTER_CONFIG.beamDurationMs +
					BLASTER_CONFIG.intervalMs,
			);

			return;
		}

		// 出現位置を決定
		let position: { x: number; y: number };
		// 狙うターゲット座標をプレイヤー位置とランダムのブレンドで設定
		const randomTarget = {
			x: width / 2 + (Math.random() - 0.5) * width * 0.6,
			y: height / 2 + (Math.random() - 0.5) * height * 0.6,
		};
		const playerTarget = prevPlayerPos ?? { x: width / 2, y: height / 2 };
		const accuracy = ENTITY_CONFIG.targetingAccuracy;
		const target = {
			x: playerTarget.x * accuracy + randomTarget.x * (1 - accuracy),
			y: playerTarget.y * accuracy + randomTarget.y * (1 - accuracy),
		};
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
			default: // "left"
				position = { x: -60, y: Math.random() * height };
		}

		// 速度ベクトルを計算
		const vector = {
			x: target.x - position.x,
			y: target.y - position.y,
		};
		const vectorLength = Math.hypot(vector.x, vector.y) || 1;
		const velocity = {
			x: (vector.x / vectorLength) * speed,
			y: (vector.y / vectorLength) * speed,
		};

		// 図形の重み付きサンプリングによる形状選択
		const weights = SPAWN_CONFIG?.entityShapeWeights ?? {
			circle: 40,
			square: 25,
			triangle: 20,
			star: 15,
		};
		const shape = (() => {
			const entries = Object.entries(weights);
			const total = entries.reduce((s, [, w]) => s + Number(w), 0);
			let r = Math.random() * total;
			for (const [k, w] of entries) {
				r -= Number(w);
				if (r <= 0) return k as "circle" | "square" | "triangle" | "star";
			}
			return entries[entries.length - 1][0] as
				| "circle"
				| "square"
				| "triangle"
				| "star";
		})();

		// ランダムなプロパティでエンティティを生成
		spawnEntity({
			position,
			velocity,
			size: 20 + Math.random() * 16,
			shape: shape,
			color: `hsl(${Math.floor(Math.random() * 360)} 80% 60%)`,
			rotationSpeed: (Math.random() - 0.5) * Math.PI,
		});
	};

	// 既存のブラスターが存在する場合、追加でブラスターが出現する可能性を追加
	const trySpawnAdditionalBlaster = () => {
		const activeBlasters = getEntities().filter(
			(ent) =>
				ent.shape === "beam" ||
				ent.element.classList.contains("entity--blaster"),
		);
		const blasterCount = activeBlasters.length;

		// 既存ブラスター数に応じて追加確率を設定（0個: 0%, 1個: 15%, 2個以上: 8%）
		let additionalChance = 0;
		if (blasterCount === 1) additionalChance = 0.15;
		else if (blasterCount >= 2) additionalChance = 0.08;

		if (canSpawnBlaster && Math.random() < additionalChance) {
			const edges = PATTERN_EDGE_MAP[currentPattern];
			const edgeLabel =
				edges[Math.floor(Math.random() * edges.length)] ?? "top";
			const hue = Math.floor(Math.random() * 360);

			// プレイヤー位置を取得してブラスターの狙いを計算
			// 前回のプレイヤー位置を狙う
			const offsetRatio = getOffsetRatioFromPrevPos(
				edgeLabel as "top" | "right" | "bottom" | "left",
				prevPlayerPos,
				pf.clientWidth,
				pf.clientHeight,
			);

			spawnBlasterAttack({
				side: edgeLabel as "top" | "right" | "bottom" | "left",
				offsetRatio,
				color: `hsla(${hue} 92% 68% / 1)`,
				thickness: BLASTER_CONFIG.thickness,
				beamDurationMs: 1100,
			});

			// ブラスターの消滅後、次の出現まで待つ
			canSpawnBlaster = false;
			setTimeout(
				() => {
					canSpawnBlaster = true;
				},
				BLASTER_CONFIG.telegraphDurationMs +
					BLASTER_CONFIG.beamDurationMs +
					BLASTER_CONFIG.intervalMs,
			);
		}
	};

	// 一定間隔で spawnOnce を呼び出すタイマーを設定
	activeSpawnTimer = window.setInterval(() => {
		spawnOnce();
		trySpawnAdditionalBlaster();
	}, SPAWN_CONFIG.spawnIntervalMs);
	// UIにスポーンが開始したことを通知
	document.dispatchEvent(new CustomEvent("game:spawningStarted"));
};

/**
 * Stop the active spawning timer and clear existing entities without stopping the game loop.
 */
export const stopSpawning = () => {
	if (activeSpawnTimer !== null) {
		window.clearInterval(activeSpawnTimer);
		activeSpawnTimer = null;
		document.dispatchEvent(new CustomEvent("game:spawningStopped"));
		try {
			clearAllEntities();
		} catch (err) {
			console.error("Failed to clear entities on stopSpawning", err);
		}
		// 攻撃時間終了時は、残存するブラスターを即時除去し、以降のブラスター生成を抑止
		try {
			removeAllBlasters();
		} catch {}
		try {
			suppressBlasterSpawns(true);
		} catch {}
	}
};

/**
 * 画面上部に敵のシンボル（絵文字または画像）を追加します。
 * @param {string} id - シンボルの一意のID。
 * @param {"emoji" | "image"} type - シンボルの種類。
 * @param {string} content - 絵文字の文字、または画像のURL。
 */
export const addEnemySymbol = (
	id: string,
	type: "emoji" | "image",
	content: string,
) => {
	const enemyDisplay = document.getElementById("enemy-display");
	if (!(enemyDisplay instanceof HTMLElement)) return;
	// 既存のシンボルがあれば削除
	removeEnemySymbol(id);

	const symbol: EnemySymbol = { id, type, content };
	if (type === "emoji") {
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
 * 指定されたIDの敵シンボルを削除します。
 * @param {string} id - 削除するシンボルのID。
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
 * すべての敵シンボルをクリアします。
 */
export const clearEnemySymbols = () => {
	enemySymbols.forEach((symbol) => {
		if (symbol.element?.parentElement) {
			symbol.element.parentElement.removeChild(symbol.element);
		}
	});
	enemySymbols.length = 0;
};

/**
 * 現在登録されているすべての敵シンボルの配列を取得します。
 * @returns {EnemySymbol[]} 敵シンボルの配列。
 */
export const getEnemySymbols = () => enemySymbols;

// ========================================
// 敵データ管理
// ========================================

/**
 * 敵のデータを登録または更新します。
 * @param {EnemyData} enemyData - 登録する敵のデータ。
 */
export const setEnemyData = (enemyData: EnemyData) => {
	enemyDataMap.set(enemyData.id, { ...enemyData });
};

/**
 * 指定されたIDの敵データを取得します。
 * @param {string} id - 敵のID。
 * @returns {EnemyData | undefined} 敵のデータ、存在しない場合はundefined。
 */
export const getEnemyData = (id: string): EnemyData | undefined => {
	return enemyDataMap.get(id);
};

/**
 * すべての敵データを取得します。
 * @returns {EnemyData[]} すべての敵データの配列。
 */
export const getAllEnemyData = (): EnemyData[] => {
	return Array.from(enemyDataMap.values());
};

/**
 * 指定されたIDの敵にダメージを与えます。
 * @param {string} id - 敵のID。
 * @param {number} damage - 与えるダメージ量。
 * @returns {boolean} ダメージが適用された場合はtrue、敵が存在しない場合はfalse。
 */
export const damageEnemy = (id: string, damage: number): boolean => {
	const enemy = enemyDataMap.get(id);
	if (!enemy) return false;

	enemy.currentHp = Math.max(0, enemy.currentHp - damage);

	// HPが0になったらイベントを発火（将来的なUI更新用）
	if (enemy.currentHp === 0) {
		document.dispatchEvent(
			new CustomEvent("enemy:defeated", {
				detail: { id, name: enemy.name },
			}),
		);
	}

	return true;
};

/**
 * 指定されたIDの敵のHPを回復します。
 * @param {string} id - 敵のID。
 * @param {number} amount - 回復量。
 * @returns {boolean} 回復が適用された場合はtrue、敵が存在しない場合はfalse。
 */
export const healEnemy = (id: string, amount: number): boolean => {
	const enemy = enemyDataMap.get(id);
	if (!enemy) return false;

	enemy.currentHp = Math.min(enemy.maxHp, enemy.currentHp + amount);
	return true;
};

/**
 * 指定されたIDの敵データを削除します。
 * @param {string} id - 削除する敵のID。
 */
export const removeEnemyData = (id: string) => {
	enemyDataMap.delete(id);
};

/**
 * すべての敵データをクリアします。
 */
export const clearAllEnemyData = () => {
	enemyDataMap.clear();
};
