let debugLayer: HTMLElement | null = null;
const markers: HTMLElement[] = [];
const lines: HTMLElement[] = [];
let enabled = true; // default ON
let spawnLinesEnabled = true;

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

export const setDebugEnabled = (v: boolean) => {
	enabled = v;
	const layer = ensureLayer();
	if (!layer) return;
	markers.forEach((m) => {
		m.style.display = enabled ? "block" : "none";
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

export const drawSpawnLines = (playfield: HTMLElement) => {
	clearSpawnLines();
	const layer = ensureLayer();
	if (!layer) return;
	const w = playfield.clientWidth;
	const h = playfield.clientHeight;
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
	makeLine(0, -60, w, 2);
	makeLine(0, h + 60, w, 2);
	makeLine(-60, 0, 2, h);
	makeLine(w + 60, 0, 2, h);
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
	dot.style.display = enabled ? "block" : "none";
};

export default {
	markSpawn,
	clearDebugMarkers,
	clearSpawnLines,
	drawSpawnLines,
	setSpawnLinesEnabled,
	toggleSpawnLines,
	toggleDebug,
	setDebugEnabled,
	isDebugEnabled,
};
