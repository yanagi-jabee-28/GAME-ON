import {
	PLAYFIELD_INITIAL_HEIGHT,
	PLAYFIELD_INITIAL_WIDTH,
	PLAYFIELD_MAX_HEIGHT,
	PLAYFIELD_MAX_WIDTH,
	PLAYFIELD_MIN_HEIGHT,
	PLAYFIELD_MIN_WIDTH,
} from "./constants.js";

/** デバッグ情報を描画するHTMLレイヤー */
let debugLayer: HTMLElement | null = null;
/** デバッグマーカー（エンティティのスポーン位置など）を格納する配列 */
const markers: HTMLElement[] = [];
/** スポーンラインに対応する方向 */
export type SpawnEdge = "top" | "right" | "bottom" | "left";

/** スポーンパターン */
export type SpawnPattern = "omnidirectional" | "top-only";

export const PATTERN_EDGE_MAP: Record<SpawnPattern, SpawnEdge[]> = {
	omnidirectional: ["top", "right", "bottom", "left"],
	"top-only": ["top"],
};

const lines: HTMLElement[] = [];
let enabled = true; // default ON
let spawnLinesEnabled = true;
let spawnMarkersEnabled = false;

export let playfieldWidth = PLAYFIELD_INITIAL_WIDTH;
export let playfieldHeight = PLAYFIELD_INITIAL_HEIGHT;
export let activePlayfield: HTMLElement | null = null;
export let currentPattern: SpawnPattern = "omnidirectional";

export const refreshSpawnLines = () => {
	if (!activePlayfield || typeof drawSpawnLines !== "function") return;
	drawSpawnLines(activePlayfield, PATTERN_EDGE_MAP[currentPattern]);
};

export const setSpawnPattern = (pattern: SpawnPattern) => {
	currentPattern = pattern;
	refreshSpawnLines();
};

export const setActivePlayfield = (pf: HTMLElement) => {
	activePlayfield = pf;
	playfieldWidth = PLAYFIELD_INITIAL_WIDTH;
	playfieldHeight = PLAYFIELD_INITIAL_HEIGHT;
	applyPlayfieldSize();
};

const clampSize = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(value, max));

export const applyPlayfieldSize = () => {
	const playfield = document.getElementById("playfield");
	if (!(playfield instanceof HTMLElement)) return;
	playfield.style.width = `${Math.round(playfieldWidth)}px`;
	playfield.style.height = `${Math.round(playfieldHeight)}px`;
	import("./player.ts").then(({ clampPlayerToBounds }) => {
		clampPlayerToBounds(playfield);
	});
	refreshSpawnLines();
};

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

export const isDebugEnabled = () => enabled;
export const isSpawnMarkersEnabled = () => spawnMarkersEnabled;

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

export const toggleDebug = () => setDebugEnabled(!enabled);

export const clearDebugMarkers = () => {
	while (markers.length) {
		const m = markers.pop();
		m?.parentElement?.removeChild(m);
	}
};

export const clearSpawnLines = () => {
	while (lines.length) {
		const l = lines.pop();
		l?.parentElement?.removeChild(l);
	}
};

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
	if (requested.has("top")) makeLine(0, -60, w, 2);
	if (requested.has("bottom")) makeLine(0, h + 60, w, 2);
	if (requested.has("left")) makeLine(-60, 0, 2, h);
	if (requested.has("right")) makeLine(w + 60, 0, 2, h);
	lines.forEach((l) => {
		l.style.display = enabled && spawnLinesEnabled ? "block" : "none";
	});
};

export const setSpawnLinesEnabled = (v: boolean) => {
	spawnLinesEnabled = v;
	lines.forEach((l) => {
		l.style.display = enabled && spawnLinesEnabled ? "block" : "none";
	});
};

export const toggleSpawnLines = () => setSpawnLinesEnabled(!spawnLinesEnabled);

export const setSpawnMarkersEnabled = (v: boolean) => {
	spawnMarkersEnabled = v;
	const layer = ensureLayer();
	if (!layer) return;
	markers.forEach((m) => {
		m.style.display = enabled && spawnMarkersEnabled ? "block" : "none";
	});
};

export const toggleSpawnMarkers = () =>
	setSpawnMarkersEnabled(!spawnMarkersEnabled);

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
