const playfield = document.getElementById("playfield");
const heart = document.getElementById("heart") as HTMLElement | null;

if (!(playfield instanceof HTMLElement) || !heart) {
	throw new Error("必要な要素が見つかりませんでした。");
}

const pressedKeys = new Set<string>();
const speed = 180; // pixels per second
const directionMap: Record<string, Readonly<[number, number]>> = {
	arrowup: [0, -1],
	w: [0, -1],
	arrowdown: [0, 1],
	s: [0, 1],
	arrowleft: [-1, 0],
	a: [-1, 0],
	arrowright: [1, 0],
	d: [1, 0],
};

let x = 0;
let y = 0;
let lastTimestamp = performance.now();
let heartSvg: SVGSVGElement | null = null;
// ソウルカラーを HSL で定義（順序は切り替わる順）
const colors: string[] = [
	"hsl(180 100% 50%)", // 水色: 忍耐
	"hsl(30 100% 50%)", // オレンジ: 勇気
	"hsl(220 100% 50%)", // 青: 誠実
	"hsl(285 100% 50%)", // 紫: 不屈
	"hsl(120 100% 50%)", // 緑: 親切
	"hsl(60 100% 50%)", // 黄: 正義
	"hsl(0 100% 50%)", // 赤: 決意
	"hsl(0 0% 100%)", // 白: モンスター
];

// 現在の色インデックス（初期は赤 = 決意）。colors 配列のインデックスで管理します。
let currentIndex = 6;
let currentColor = colors[currentIndex];

const clamp = (value: number, min: number, max: number) => {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
};

const updatePosition = (deltaSeconds: number) => {
	let dx = 0;
	let dy = 0;

	pressedKeys.forEach((key) => {
		const direction = directionMap[key];
		if (direction) {
			dx += direction[0];
			dy += direction[1];
		}
	});

	if (dx !== 0 || dy !== 0) {
		const length = Math.hypot(dx, dy) || 1;
		dx /= length;
		dy /= length;

		x += dx * speed * deltaSeconds;
		y += dy * speed * deltaSeconds;

		const maxX = playfield.clientWidth - heart.clientWidth;
		const maxY = playfield.clientHeight - heart.clientHeight;
		x = clamp(x, 0, maxX);
		y = clamp(y, 0, maxY);

		heart.style.transform = `translate(${x}px, ${y}px)`;
	}
};

const loop = (timestamp: number) => {
	const delta = (timestamp - lastTimestamp) / 1000;
	lastTimestamp = timestamp;
	updatePosition(delta);
	requestAnimationFrame(loop);
};

const handleKeyDown = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (directionMap[key]) {
		pressedKeys.add(key);
		event.preventDefault();
	} else if (key === " ") {
		changeHeartColor();
		event.preventDefault();
	}
};

const changeHeartColor = () => {
	currentIndex = (currentIndex + 1) % colors.length;
	currentColor = colors[currentIndex];
	if (heartSvg) {
		const path = heartSvg.querySelector("path");
		if (path) {
			path.style.fill = currentColor;
		}
	}
};

const handleKeyUp = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (pressedKeys.delete(key)) {
		event.preventDefault();
	}
};

document.addEventListener("keydown", handleKeyDown, { passive: false });
document.addEventListener("keyup", handleKeyUp, { passive: false });
window.addEventListener("blur", () => pressedKeys.clear());

const loadSvg = async () => {
	try {
		const response = await fetch("./assets/heart-shape-svgrepo-com.svg");
		const svgText = await response.text();
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
		heartSvg = svgDoc.documentElement as unknown as SVGSVGElement;
		heartSvg.style.width = "100%";
		heartSvg.style.height = "100%";
		heart.appendChild(heartSvg);
		// 初期色を設定
		const path = heartSvg.querySelector("path");
		if (path) {
			path.style.fill = currentColor;
		}
		centerHeart();
		requestAnimationFrame(loop);
	} catch (error) {
		console.error("SVG の読み込みに失敗しました:", error);
	}
};

const centerHeart = () => {
	x = (playfield.clientWidth - heart.clientWidth) / 2;
	y = (playfield.clientHeight - heart.clientHeight) / 2;
	heart.style.transform = `translate(${x}px, ${y}px)`;
};

loadSvg();
