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
	getHomingEnabled,
	getRemoveBulletsOnHit,
	setHomingEnabled,
	setRemoveBulletsOnHit,
	spawnEntity,
	updateEntities,
} from "./entity.ts";
import { detectCollisionsSafe } from "./entity-compat.ts";
import { changeHeartColor, updatePlayerPosition } from "./player.ts";
import type { EnemySymbol } from "./types.ts";

let lastTimestamp = performance.now();
const pressedKeys = new Set<string>();
let activeSpawnTimer: number | null = null;
const enemySymbols: EnemySymbol[] = [];

export const startGameLoop = (playfield: HTMLElement) => {
	setActivePlayfield(playfield);

	// Default: enable homing so entities will pursue the player unless toggled
	setHomingEnabled(true);
	console.log(`Homing default: ${getHomingEnabled() ? "ON" : "OFF"}`);
	console.log(
		`Bullet removal on hit (default): ${getRemoveBulletsOnHit() ? "ON" : "OFF"}`,
	);
	let running = true;
	const loop = (timestamp: number) => {
		const delta = (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;
		updatePlayerPosition(delta, pressedKeys, playfield);
		updateEntities(delta, playfield);
		try {
			detectCollisionsSafe();
		} catch (err) {
			// If our safe wrapper still throws, log and continue - do not let the loop die.
			console.error("Error during collision detection (safe):", err);
		}
		if (running) requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
	const onGameStop = () => {
		running = false;
		if (activeSpawnTimer !== null) {
			window.clearInterval(activeSpawnTimer);
			activeSpawnTimer = null;
			// Notify UI that spawning has stopped
			document.dispatchEvent(new CustomEvent("game:spawningStopped"));
		}
		try {
			clearAllEntities();
		} catch (err) {
			console.error("Failed to clear entities on gamestop", err);
		}
		console.log("Game stop received - stopping loop and spawn timer");
	};
	document.addEventListener("gamestop", onGameStop, { once: true });
	const onGameOver = () => {
		console.log("Game over animation completed");
	};
	document.addEventListener("gameover", onGameOver, { once: true });
};

export const handleKeyDown = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (DIRECTION_MAP[key as keyof typeof DIRECTION_MAP]) {
		pressedKeys.add(key);
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
		toggleDebug();
		console.log(`Debug markers: ${isDebugEnabled() ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "p") {
		toggleSpawnMarkers();
		console.log(`Spawn markers: ${isSpawnMarkersEnabled() ? "ON" : "OFF"}`);
		event.preventDefault();
	} else if (key === "q") {
		changePlayfieldSize(-PLAYFIELD_SIZE_STEP, 0);
		event.preventDefault();
	} else if (key === "e") {
		changePlayfieldSize(PLAYFIELD_SIZE_STEP, 0);
		event.preventDefault();
	} else if (key === "r") {
		changePlayfieldSize(0, -PLAYFIELD_SIZE_STEP);
		event.preventDefault();
	} else if (key === "f") {
		changePlayfieldSize(0, PLAYFIELD_SIZE_STEP);
		event.preventDefault();
	} else if (key === "1") {
		setSpawnPattern("omnidirectional");
		console.log("Spawn pattern: 1 (omnidirectional)");
		event.preventDefault();
	} else if (key === "2") {
		setSpawnPattern("top-only");
		console.log("Spawn pattern: 2 (top-only)");
		event.preventDefault();
	} else if (key === "M") {
		clearDebugMarkers();
		event.preventDefault();
	} else if (key === "g") {
		// debug: change heart color
		try {
			changeHeartColor();
		} catch (err) {
			console.error("changeHeartColor failed:", err);
		}
		event.preventDefault();
	}
};

export const handleKeyUp = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (pressedKeys.delete(key)) event.preventDefault();
};

export const clearKeys = () => pressedKeys.clear();

export const startDemoScenario = (
	playfield?: HTMLElement,
	pattern: SpawnPattern = "top-only",
) => {
	const pf = playfield ?? document.getElementById("playfield");
	if (!(pf instanceof HTMLElement)) return;

	// Do not override active playfield size here. The playfield should be
	// configured by the caller (e.g. main.ts). Only update the spawn pattern
	// and spawn lines based on the already-active playfield.
	setSpawnPattern(pattern);
	refreshSpawnLines();

	if (activeSpawnTimer !== null) {
		window.clearInterval(activeSpawnTimer);
	}

	const spawnOnce = () => {
		const width = pf.clientWidth;
		const height = pf.clientHeight;
		const edges = PATTERN_EDGE_MAP[currentPattern];
		const edgeLabel = edges[Math.floor(Math.random() * edges.length)] ?? "top";
		const speed = 80 + Math.random() * 60;
		let position: { x: number; y: number };
		const target = {
			x: width / 2 + (Math.random() - 0.5) * width * 0.6,
			y: height / 2 + (Math.random() - 0.5) * height * 0.6,
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
	};

	activeSpawnTimer = window.setInterval(spawnOnce, 1600);
	// Notify UI that spawning has started
	document.dispatchEvent(new CustomEvent("game:spawningStarted"));
};

export const addEnemySymbol = (
	id: string,
	type: "emoji" | "image",
	content: string,
) => {
	const enemyDisplay = document.getElementById("enemy-display");
	if (!(enemyDisplay instanceof HTMLElement)) return;
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

export const removeEnemySymbol = (id: string) => {
	const index = enemySymbols.findIndex((s) => s.id === id);
	if (index === -1) return;
	const symbol = enemySymbols[index];
	if (symbol.element?.parentElement) {
		symbol.element.parentElement.removeChild(symbol.element);
	}
	enemySymbols.splice(index, 1);
};

export const clearEnemySymbols = () => {
	enemySymbols.forEach((symbol) => {
		if (symbol.element?.parentElement) {
			symbol.element.parentElement.removeChild(symbol.element);
		}
	});
	enemySymbols.length = 0;
};
