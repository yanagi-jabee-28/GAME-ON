import { COLORS, DIRECTION_MAP, SPEED } from "./constants.js";

let x = 0;
let y = 0;
let heartSvg: SVGSVGElement | null = null;
let heartPath: SVGGeometryElement | null = null;
let currentIndex = 6;
let currentColor = COLORS[currentIndex];

export const getPlayerPosition = () => ({ x, y });
export const getHeartElement = (): HTMLElement => {
	const el = document.getElementById("heart");
	if (!el) throw new Error("#heart が見つかりません");
	return el as HTMLElement;
};
export const getHeartSvg = () => heartSvg;
export const getHeartPath = () => heartPath;

export const updatePlayerPosition = (
	deltaSeconds: number,
	pressedKeys: Set<string>,
	playfield: HTMLElement,
) => {
	let dx = 0;
	let dy = 0;
	pressedKeys.forEach((key) => {
		const direction = DIRECTION_MAP[key as keyof typeof DIRECTION_MAP];
		if (direction) {
			dx += direction[0];
			dy += direction[1];
		}
	});

	if (dx !== 0 || dy !== 0) {
		const length = Math.hypot(dx, dy) || 1;
		dx /= length;
		dy /= length;
		x += dx * SPEED * deltaSeconds;
		y += dy * SPEED * deltaSeconds;

		const maxX = playfield.clientWidth - getHeartElement().clientWidth;
		const maxY = playfield.clientHeight - getHeartElement().clientHeight;
		x = Math.max(0, Math.min(x, maxX));
		y = Math.max(0, Math.min(y, maxY));

		getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
	}
};

export const changeHeartColor = () => {
	currentIndex = (currentIndex + 1) % COLORS.length;
	currentColor = COLORS[currentIndex];
	if (heartPath) {
		heartPath.style.fill = currentColor;
	} else if (heartSvg) {
		const path = heartSvg.querySelector("path");
		if (path instanceof SVGGeometryElement) {
			heartPath = path;
			heartPath.style.fill = currentColor;
		}
	}
};

export const setHeartOpacity = (wasHit: boolean) => {
	getHeartElement().style.opacity = wasHit ? `${0.3}` : "1";
};

export const loadSvg = async () => {
	try {
		const response = await fetch("./assets/heart-shape-svgrepo-com.svg");
		const svgText = await response.text();
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
		heartSvg = svgDoc.documentElement as unknown as SVGSVGElement;
		heartSvg.style.width = "100%";
		heartSvg.style.height = "100%";
		getHeartElement().appendChild(heartSvg);
		const path = heartSvg.querySelector("path");
		if (path instanceof SVGGeometryElement) {
			heartPath = path;
			heartPath.style.fill = currentColor;
		}
		const playfield = document.getElementById("playfield");
		if (!playfield) throw new Error("#playfield が見つかりません");
		x = (playfield.clientWidth - getHeartElement().clientWidth) / 2;
		y = (playfield.clientHeight - getHeartElement().clientHeight) / 2;
		getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
	} catch (error) {
		console.error("SVG の読み込みに失敗しました:", error);
	}
};
