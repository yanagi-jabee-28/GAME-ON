/** デバッグ情報を描画するHTMLレイヤー */
let debugLayer: HTMLElement | null = null;
/** デバッグマーカー（エンティティのスポーン位置など）を格納する配列 */
const markers: HTMLElement[] = [];
/** スポーンラインに対応する方角 */
export type SpawnEdge = "top" | "right" | "bottom" | "left";

/** スポーンパターンの種類 */
export type SpawnPattern = "omnidirectional" | "top-only";

/** パターンごとに有効なスポーン辺を定義 */
export const PATTERN_EDGE_MAP: Record<SpawnPattern, SpawnEdge[]> = {
	omnidirectional: ["top", "right", "bottom", "left"],
	"top-only": ["top"],
};

/** デバッグ用のスポーンラインを格納する配列 */
const lines: HTMLElement[] = [];
/** デバッグ表示が有効かどうかのフラグ */
let enabled = true; // default ON
/** スポーンラインの表示が有効かどうかのフラグ */
let spawnLinesEnabled = true;
/** スポーンマーカーの表示が有効かどうかのフラグ */
let spawnMarkersEnabled = false;

/** プレイフィールドサイズ変更の定数 */
export const PLAYFIELD_MIN_WIDTH = 240;
export const PLAYFIELD_MAX_WIDTH = 720;
export const PLAYFIELD_MIN_HEIGHT = 240;
export const PLAYFIELD_MAX_HEIGHT = 720;
export const PLAYFIELD_SIZE_STEP = 40;

/** 現在のプレイフィールドサイズ */
export let playfieldWidth = PLAYFIELD_MIN_WIDTH;
export let playfieldHeight = PLAYFIELD_MIN_HEIGHT;
/** スポーン制御に利用するプレイフィールド要素 */
export let activePlayfield: HTMLElement | null = null;
/** 現在のスポーンパターン */
export let currentPattern: SpawnPattern = "omnidirectional";

/**
 * パターンに応じてデバッグラインを更新する
 */
export const refreshSpawnLines = () => {
	if (!activePlayfield || typeof drawSpawnLines !== "function") return;
	drawSpawnLines(activePlayfield, PATTERN_EDGE_MAP[currentPattern]);
};

/**
 * スポーンパターンを設定する
 * @param {SpawnPattern} pattern - 新しいパターン
 */
export const setSpawnPattern = (pattern: SpawnPattern) => {
	currentPattern = pattern;
	refreshSpawnLines();
};

/**
 * アクティブなプレイフィールドを設定する
 * @param {HTMLElement} pf - プレイフィールド要素
 */
export const setActivePlayfield = (pf: HTMLElement) => {
	activePlayfield = pf;
	playfieldWidth = pf.clientWidth;
	playfieldHeight = pf.clientHeight;
};

/**
 * サイズを範囲内に収める
 * @param {number} value - 対象値
 * @param {number} min - 最小値
 * @param {number} max - 最大値
 * @returns {number} 範囲内に収めた値
 */
const clampSize = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(value, max));

/**
 * プレイフィールドサイズを適用し、関連要素を更新する
 */
export const applyPlayfieldSize = () => {
	const playfield = document.getElementById("playfield");
	if (!(playfield instanceof HTMLElement)) return;
	playfield.style.width = `${Math.round(playfieldWidth)}px`;
	playfield.style.height = `${Math.round(playfieldHeight)}px`;
	// プレイヤー位置を補正
	import("./player.js").then(({ clampPlayerToBounds }) => {
		clampPlayerToBounds(playfield);
	});
	// スポーンラインを更新
	refreshSpawnLines();
};

/**
 * プレイフィールドサイズを変更する
 * @param {number} deltaWidth - 幅の増減量
 * @param {number} deltaHeight - 高さの増減量
 */
export const changePlayfieldSize = (
	deltaWidth: number,
	deltaHeight: number,
) => {
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
 * デバッグレイヤーがなければ作成し、取得する
 * @returns {HTMLElement | null} デバッグレイヤーのHTML要素
 */
const ensureLayer = (): HTMLElement | null => {
	if (debugLayer) return debugLayer;
	const playfield = document.getElementById("playfield");
	if (!(playfield instanceof HTMLElement)) return null;
	const existing = document.getElementById("debug-layer");
	if (existing instanceof HTMLElement) {
		debugLayer = existing;
		return debugLayer;
	}
	const layer = document.createElement("div");
	layer.id = "debug-layer";
	layer.className = "layer";
	layer.style.zIndex = "4";
	layer.style.pointerEvents = "none";
	playfield.appendChild(layer);
	debugLayer = layer;
	return debugLayer;
};

/**
 * デバッグ表示が有効かどうかを返す
 * @returns {boolean} 有効な場合はtrue
 */
export const isDebugEnabled = () => enabled;

/**
 * スポーンマーカーの表示が有効かどうかを返す
 * @returns {boolean} 有効な場合はtrue
 */
export const isSpawnMarkersEnabled = () => spawnMarkersEnabled;

/**
 * デバッグ表示の有効/無効を設定する
 * @param {boolean} v - 有効にする場合はtrue
 */
export const setDebugEnabled = (v: boolean) => {
	enabled = v;
	const layer = ensureLayer();
	if (!layer) return;
	markers.forEach((m) => {
		m.style.display = enabled && spawnMarkersEnabled ? "block" : "none";
	});
	lines.forEach((l) => {
		l.style.display = enabled && spawnLinesEnabled ? "block" : "none";
	});
};

/**
 * デバッグ表示の有効/無効を切り替える
 */
export const toggleDebug = () => setDebugEnabled(!enabled);

/**
 * すべてのデバッグマーカーをクリアする
 */
export const clearDebugMarkers = () => {
	while (markers.length) {
		const m = markers.pop();
		m?.parentElement?.removeChild(m);
	}
};

/**
 * すべてのスポーンラインをクリアする
 */
export const clearSpawnLines = () => {
	while (lines.length) {
		const l = lines.pop();
		l?.parentElement?.removeChild(l);
	}
};

/**
 * エンティティのスポーン領域を示すデバッグ用のラインを描画する
 * @param {HTMLElement} playfield - プレイフィールドのHTML要素
 */
export const drawSpawnLines = (
	playfield: HTMLElement,
	edges: SpawnEdge[] = ["top", "right", "bottom", "left"],
) => {
	clearSpawnLines();
	const layer = ensureLayer();
	if (!layer) return;
	const w = playfield.clientWidth;
	const h = playfield.clientHeight;
	const requested = new Set(edges);
	const makeLine = (
		left: number,
		top: number,
		width: number,
		height: number,
	) => {
		const div = document.createElement("div");
		div.className = "debug-spawn-line";
		div.style.position = "absolute";
		div.style.left = `${left}px`;
		div.style.top = `${top}px`;
		div.style.width = `${width}px`;
		div.style.height = `${height}px`;
		div.style.background = "rgba(0,255,0,0.9)";
		div.style.zIndex = "5";
		div.style.pointerEvents = "none";
		layer.appendChild(div);
		lines.push(div);
	};
	// スポーンラインをプレイフィールドの外枠より外側に描画
	if (requested.has("top")) makeLine(0, -60, w, 2);
	if (requested.has("bottom")) makeLine(0, h + 60, w, 2);
	if (requested.has("left")) makeLine(-60, 0, 2, h);
	if (requested.has("right")) makeLine(w + 60, 0, 2, h);
	lines.forEach((l) => {
		l.style.display = enabled && spawnLinesEnabled ? "block" : "none";
	});
};

/**
 * スポーンライン表示の有効/無効を設定する
 * @param {boolean} v - 有効にする場合はtrue
 */
export const setSpawnLinesEnabled = (v: boolean) => {
	spawnLinesEnabled = v;
	lines.forEach((l) => {
		l.style.display = enabled && spawnLinesEnabled ? "block" : "none";
	});
};

/**
 * スポーンライン表示の有効/無効を切り替える
 */
export const toggleSpawnLines = () => setSpawnLinesEnabled(!spawnLinesEnabled);

/**
 * スポーンマーカーの表示の有効/無効を設定する
 * @param {boolean} v - 有効にする場合はtrue
 */
export const setSpawnMarkersEnabled = (v: boolean) => {
	spawnMarkersEnabled = v;
	const layer = ensureLayer();
	if (!layer) return;
	markers.forEach((m) => {
		m.style.display = enabled && spawnMarkersEnabled ? "block" : "none";
	});
};

/**
 * スポーンマーカーの表示の有効/無効を切り替える
 */
export const toggleSpawnMarkers = () =>
	setSpawnMarkersEnabled(!spawnMarkersEnabled);

/**
 * 指定した位置にデバッグマーカー（ドット）を配置する
 * @param {{ x: number; y: number }} pos - マーカーを配置する座標
 * @param {string} [label] - マーカーに表示するラベル
 */
export const markSpawn = (pos: { x: number; y: number }, label?: string) => {
	const layer = ensureLayer();
	if (!layer) return;
	const dot = document.createElement("div");
	dot.className = "debug-marker";
	dot.style.position = "absolute";
	dot.style.left = `${pos.x - 6}px`;
	dot.style.top = `${pos.y - 6}px`;
	dot.style.width = "12px";
	dot.style.height = "12px";
	dot.style.borderRadius = "50%";
	dot.style.border = "2px solid rgba(255,0,0,0.9)";
	dot.style.background = "rgba(255,0,0,0.25)";
	dot.style.zIndex = "5";
	dot.style.pointerEvents = "none";
	if (label) {
		const span = document.createElement("span");
		span.textContent = label;
		span.style.position = "absolute";
		span.style.left = "14px";
		span.style.top = "-6px";
		span.style.color = "white";
		span.style.fontSize = "10px";
		span.style.textShadow = "0 0 4px rgba(0,0,0,0.8)";
		dot.appendChild(span);
	}
	markers.push(dot);
	layer.appendChild(dot);
	dot.style.display = enabled && spawnMarkersEnabled ? "block" : "none";
};

/** デバッグ関連の関数をまとめたオブジェクト */
export default {
	markSpawn,
	clearDebugMarkers,
	clearSpawnLines,
	drawSpawnLines,
	setSpawnLinesEnabled,
	toggleSpawnLines,
	toggleSpawnMarkers,
	toggleDebug,
	setDebugEnabled,
	isDebugEnabled,
	isSpawnMarkersEnabled,
};
