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

let lastTimestamp = performance.now();
const pressedKeys = new Set<string>();

export const startGameLoop = (playfield: HTMLElement) => {
	const loop = (timestamp: number) => {
		const delta = (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;
		updatePlayerPosition(delta, pressedKeys, playfield);
		updateEntities(delta, playfield);
		detectCollisions();
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
};

export const handleKeyDown = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (DIRECTION_MAP[key as keyof typeof DIRECTION_MAP]) {
		pressedKeys.add(key);
		event.preventDefault();
	} else if (key === " ") {
		changeHeartColor();
		event.preventDefault();
	} else if (key === "t") {
		const newValue = !getRemoveBulletsOnHit();
		setRemoveBulletsOnHit(newValue);
		console.log(`Bullet removal on hit: ${newValue ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "h") {
		const newValue = !getHomingEnabled();
		setHomingEnabled(newValue);
		console.log(`Homing: ${newValue ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "m") {
		debug.toggleDebug();
		console.log(`Debug markers: ${debug.isDebugEnabled() ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "M") {
		debug.clearDebugMarkers();
		event.preventDefault();
	}
};

export const handleKeyUp = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (pressedKeys.delete(key)) event.preventDefault();
};

export const clearKeys = () => pressedKeys.clear();

export const startDemoScenario = (playfield?: HTMLElement) => {
	const pf = playfield ?? document.getElementById("playfield");
	if (!(pf instanceof HTMLElement)) return;
	// draw spawn-line overlays for debugging
	// call drawSpawnLines if available on debug module
	const dbg = debug as unknown as {
		drawSpawnLines?: (pf: HTMLElement) => void;
	};
	if (typeof dbg.drawSpawnLines === "function") dbg.drawSpawnLines(pf);
	const width = pf.clientWidth;
	const height = pf.clientHeight;

	setInterval(() => {
		const edge = Math.floor(Math.random() * 4);
		const speed = 80 + Math.random() * 60;
		let position: { x: number; y: number };

		const target = {
			x: width / 2 + (Math.random() - 0.5) * width * 0.6,
			y: height / 2 + (Math.random() - 0.5) * height * 0.6,
		};

		switch (edge) {
			case 0:
				position = { x: Math.random() * width, y: -60 };
				break;
			case 1:
				position = { x: width + 60, y: Math.random() * height };
				break;
			case 2:
				position = { x: Math.random() * width, y: height + 60 };
				break;
			default:
				position = { x: -60, y: Math.random() * height };
		}

		const vector = {
			x: target.x - position.x,
			y: target.y - position.y,
		};
		const vectorLength = Math.hypot(vector.x, vector.y) || 1;
		const velocity = {
			x: (vector.x / vectorLength) * speed,
			y: (vector.y / vectorLength) * speed,
		};

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
