import { DIRECTION_MAP } from "./constants.js";
import debug from "./debug.js";
import {
	detectCollisions,
	getHomingEnabled,
	getRemoveBulletsOnHit,
	setHomingEnabled,
	setRemoveBulletsOnHit,
	spawnEntity,
	updateEntities,
} from "./entity.js";
import { changeHeartColor, updatePlayerPosition } from "./player.js";

/** 前回のフレーム更新時刻のタイムスタンプ */
let lastTimestamp = performance.now();
/** 現在押されているキーのセット */
const pressedKeys = new Set<string>();

/**
 * ゲームのメインループを開始する
 * @param {HTMLElement} playfield - プレイフィールドのHTML要素
 */
export const startGameLoop = (playfield: HTMLElement) => {
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
 */
export const startDemoScenario = (playfield?: HTMLElement) => {
	const pf = playfield ?? document.getElementById("playfield");
	if (!(pf instanceof HTMLElement)) return;

	// スポーンライン描画はデバッグ向けの補助機能
	const dbg = debug as unknown as {
		drawSpawnLines?: (pf: HTMLElement) => void;
	};
	if (typeof dbg.drawSpawnLines === "function") dbg.drawSpawnLines(pf);

	const width = pf.clientWidth;
	const height = pf.clientHeight;

	// 一定間隔でエンティティを生成
	setInterval(() => {
		const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
		const speed = 80 + Math.random() * 60;
		let position: { x: number; y: number };

		// 弾が向かう目標点をプレイフィールド中央周辺のランダム位置に設定
		const target = {
			x: width / 2 + (Math.random() - 0.5) * width * 0.6,
			y: height / 2 + (Math.random() - 0.5) * height * 0.6,
		};

		// プレイフィールドの外周からエンティティを出現させる
		switch (edge) {
			case 0: // Top
				position = { x: Math.random() * width, y: -60 };
				break;
			case 1: // Right
				position = { x: width + 60, y: Math.random() * height };
				break;
			case 2: // Bottom
				position = { x: Math.random() * width, y: height + 60 };
				break;
			default: // Left
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
	}, 1600);
};
