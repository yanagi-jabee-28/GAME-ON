/**
 * このファイルは、ゲームの開発およびデバッグを支援するための機能を提供します。
 * - スポーン位置の可視化 (マーカー)
 * - スポーン領域の可視化 (ライン)
 * - プレイフィールドの動的なリサイズ
 * - これらのデバッグ表示のオン/オフ切り替え
 *
 * これらの機能は、キーボードショートカットを通じて操作できます (game.ts を参照)。
 */
import {
	PLAYFIELD_INITIAL_HEIGHT,
	PLAYFIELD_INITIAL_WIDTH,
	PLAYFIELD_MAX_HEIGHT,
	PLAYFIELD_MAX_WIDTH,
	PLAYFIELD_MIN_HEIGHT,
	PLAYFIELD_MIN_WIDTH,
} from "./constants.js";

/** デバッグ情報を描画するための専用HTMLレイヤー */
let debugLayer: HTMLElement | null = null;

/**
 * スポーン位置に表示されるマーカーのDOM要素を保持する配列。
 * @type {HTMLElement[]}
 */
const markers: HTMLElement[] = [];

/**
 * エンティティが出現するプレイフィールドの辺を指定する型。
 * 'top': 上辺, 'right': 右辺, 'bottom': 下辺, 'left': 左辺
 */
export type SpawnEdge = "top" | "right" | "bottom" | "left";

/**
 * エンティティの出現パターンを定義する型。
 * 'omnidirectional': 全方向から出現
 * 'top-only': 上辺からのみ出現
 */
export type SpawnPattern = "omnidirectional" | "top-only";

/**
 * スポーンパターン名と、それに対応する出現辺のマッピング。
 * これにより、パターンを切り替えるだけで出現ロジックを変更できます。
 */
export const PATTERN_EDGE_MAP: Record<SpawnPattern, SpawnEdge[]> = {
	omnidirectional: ["top", "right", "bottom", "left"],
	"top-only": ["top"],
};

/** スポーンラインのDOM要素を保持する配列 */
const lines: HTMLElement[] = [];

/** デバッグ表示全体の有効/無効フラグ (デフォルト: 有効) */
let enabled = true;
/** スポーンライン表示の有効/無効フラグ (デフォルト: 有効) */
let spawnLinesEnabled = true;
/** スポーンマーカー表示の有効/無効フラグ (デフォルト: 無効) */
let spawnMarkersEnabled = false;

/** 現在のプレイフィールドの幅 (ピクセル) */
export let playfieldWidth = PLAYFIELD_INITIAL_WIDTH;
/** 現在のプレイフィールドの高さ (ピクセル) */
export let playfieldHeight = PLAYFIELD_INITIAL_HEIGHT;
/** 現在アクティブなプレイフィールドのDOM要素 */
export let activePlayfield: HTMLElement | null = null;
/** 現在選択されているスポーンパターン */
export let currentPattern: SpawnPattern = "omnidirectional";

/**
 * 現在のスポーンパターンに基づいてスポーンラインを再描画します。
 * プレイフィールドのサイズが変更された後などに呼び出されます。
 */
export const refreshSpawnLines = () => {
	if (!activePlayfield || typeof drawSpawnLines !== "function") return;
	drawSpawnLines(activePlayfield, PATTERN_EDGE_MAP[currentPattern]);
};

/**
 * スポーンパターンを新しいパターンに設定し、スポーンラインを更新します。
 * @param {SpawnPattern} pattern - 新しいスポーンパターン。
 */
export const setSpawnPattern = (pattern: SpawnPattern) => {
	currentPattern = pattern;
	refreshSpawnLines();
};

/**
 * 操作対象となるプレイフィールドのDOM要素を設定します。
 * ゲーム開始時に一度だけ呼び出されます。
 * @param {HTMLElement} pf - プレイフィールドのDOM要素。
 */
export const setActivePlayfield = (pf: HTMLElement) => {
	activePlayfield = pf;
	playfieldWidth = PLAYFIELD_INITIAL_WIDTH;
	playfieldHeight = PLAYFIELD_INITIAL_HEIGHT;
	applyPlayfieldSize();
};

/**
 * 与えられた値を最小値と最大値の間に収めます。
 * @param {number} value - 対象の値。
 * @param {number} min - 最小値。
 * @param {number} max - 最大値。
 * @returns {number} - 範囲内に収められた値。
 */
const clampSize = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(value, max));

/**
 * 現在の `playfieldWidth` と `playfieldHeight` の値に基づいて、
 * プレイフィールドDOM要素のスタイルを更新し、プレイヤーが範囲外に出ないように位置を調整します。
 */
export const applyPlayfieldSize = () => {
	const playfield = document.getElementById("playfield");
	if (!(playfield instanceof HTMLElement)) return;
	playfield.style.width = `${Math.round(playfieldWidth)}px`;
	playfield.style.height = `${Math.round(playfieldHeight)}px`;
	// プレイヤーの位置をプレイフィールド内にクランプする
	import("./player.ts").then(({ clampPlayerToBounds }) => {
		clampPlayerToBounds(playfield);
	});
	// スポーンラインを新しいサイズに合わせて再描画
	refreshSpawnLines();
};

/**
 * プレイフィールドのサイズを指定された量だけ変更します。
 * @param {number} deltaWidth - 幅の変更量 (正の値で増加, 負の値で減少)。
 * @param {number} deltaHeight - 高さの変更量 (正の値で増加, 負の値で減少)。
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
		`Playfield size: ${Math.round(playfieldWidth)} x ${Math.round(
			playfieldHeight,
		)}`,
	);
};

/**
 * デバッグ描画用のレイヤーがなければ作成し、取得します。
 * @returns {HTMLElement | null} デバッグレイヤーのDOM要素、またはnull。
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

/** デバッグ表示が有効かどうかを返します。 */
export const isDebugEnabled = () => enabled;
/** スポーンマーカー表示が有効かどうかを返します。 */
export const isSpawnMarkersEnabled = () => spawnMarkersEnabled;

/**
 * デバッグ表示全体の表示/非表示を設定します。
 * @param {boolean} v - trueで表示、falseで非表示。
 */
export const setDebugEnabled = (v: boolean) => {
	enabled = v;
	const layer = ensureLayer();
	if (!layer) return;
	// マーカーとラインの表示状態を更新
	markers.forEach((m) => {
		m.style.display = enabled && spawnMarkersEnabled ? "block" : "none";
	});
	lines.forEach((l) => {
		l.style.display = enabled && spawnLinesEnabled ? "block" : "none";
	});
};

/** デバッグ表示のオン/オフを切り替えます。 */
export const toggleDebug = () => setDebugEnabled(!enabled);

/** 表示されているすべてのデバッグマーカーをクリアします。 */
export const clearDebugMarkers = () => {
	while (markers.length) {
		const m = markers.pop();
		m?.parentElement?.removeChild(m);
	}
};

/** 表示されているすべてのスポーンラインをクリアします。 */
export const clearSpawnLines = () => {
	while (lines.length) {
		const l = lines.pop();
		l?.parentElement?.removeChild(l);
	}
};

/**
 * プレイフィールドの指定された辺にスポーンラインを描画します。
 * @param {HTMLElement} playfield - 描画対象のプレイフィールド。
 * @param {SpawnEdge[]} [edges=["top", "right", "bottom", "left"]] - 描画する辺の配列。
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

	// 各辺に対応するラインを描画
	if (requested.has("top")) makeLine(0, -60, w, 2);
	if (requested.has("bottom")) makeLine(0, h + 60, w, 2);
	if (requested.has("left")) makeLine(-60, 0, 2, h);
	if (requested.has("right")) makeLine(w + 60, 0, 2, h);

	// 描画したラインの表示状態を更新
	lines.forEach((l) => {
		l.style.display = enabled && spawnLinesEnabled ? "block" : "none";
	});
};

/**
 * スポーンラインの表示/非表示を設定します。
 * @param {boolean} v - trueで表示、falseで非表示。
 */
export const setSpawnLinesEnabled = (v: boolean) => {
	spawnLinesEnabled = v;
	lines.forEach((l) => {
		l.style.display = enabled && spawnLinesEnabled ? "block" : "none";
	});
};

/** スポーンラインの表示オン/オフを切り替えます。 */
export const toggleSpawnLines = () => setSpawnLinesEnabled(!spawnLinesEnabled);

/**
 * スポーンマーカーの表示/非表示を設定します。
 * @param {boolean} v - trueで表示、falseで非表示。
 */
export const setSpawnMarkersEnabled = (v: boolean) => {
	spawnMarkersEnabled = v;
	const layer = ensureLayer();
	if (!layer) return;
	markers.forEach((m) => {
		m.style.display = enabled && spawnMarkersEnabled ? "block" : "none";
	});
};

/** スポーンマーカーの表示オン/オフを切り替えます。 */
export const toggleSpawnMarkers = () =>
	setSpawnMarkersEnabled(!spawnMarkersEnabled);

/**
 * 指定された位置にスポーンマーカーを描画します。
 * @param {{ x: number; y: number }} pos - マーカーの中心座標。
 * @param {string} [label] - マーカーに添えるラベルテキスト (例: 'id:1')。
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

/**
 * デバッグ関連の関数をまとめたデフォルトエクスポート。
 * `import debug from './debug.js'` のようにして利用できます。
 */
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
