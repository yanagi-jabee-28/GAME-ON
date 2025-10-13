const playfield = document.getElementById("playfield");
const heart = document.getElementById("heart") as HTMLImageElement | null;

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

const centerHeart = () => {
	x = (playfield.clientWidth - heart.clientWidth) / 2;
	y = (playfield.clientHeight - heart.clientHeight) / 2;
	heart.style.transform = `translate(${x}px, ${y}px)`;
};

if (heart.complete) {
	centerHeart();
	requestAnimationFrame(loop);
} else {
	heart.addEventListener("load", () => {
		centerHeart();
		requestAnimationFrame(loop);
	});
}
