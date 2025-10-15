import {
	HEART_SIZE,
	PLAYER_STATUS_FONT_SIZE,
	PLAYFIELD_INITIAL_HEIGHT,
	PLAYFIELD_INITIAL_WIDTH,
} from "./constants.ts";
import {
	addEnemySymbol,
	clearKeys,
	handleKeyDown,
	handleKeyUp,
	startDemoScenario,
	startGameLoop,
} from "./game.ts";
import { loadSvg } from "./player.ts";

const playfield = document.getElementById("playfield");
const heart = document.getElementById("heart");
const entityLayer = document.getElementById("entity-layer");
const enemyDisplay = document.getElementById("enemy-display");

if (
	!(playfield instanceof HTMLElement) ||
	!(heart instanceof HTMLElement) ||
	!(entityLayer instanceof HTMLElement) ||
	!(enemyDisplay instanceof HTMLElement)
) {
	throw new Error("必要な要素が見つかりませんでした。");
}

playfield.style.width = `${PLAYFIELD_INITIAL_WIDTH}px`;
playfield.style.height = `${PLAYFIELD_INITIAL_HEIGHT}px`;

addEnemySymbol("skull", "emoji", "\u2620");
addEnemySymbol("fish", "emoji", "\ud83d\udc1f\ufe0f");
addEnemySymbol(
	"papyrus",
	"image",
	new URL("../assets/icons8-\u30d1\u30d4\u30eb\u30b9-100.png", import.meta.url)
		.href,
);

document.addEventListener("keydown", handleKeyDown, { passive: false });
document.addEventListener("keyup", handleKeyUp, { passive: false });
window.addEventListener("blur", clearKeys);

loadSvg().then(() => {
	try {
		const status = document.getElementById("player-status");
		if (status instanceof HTMLElement) {
			status.style.setProperty("--player-font-size", PLAYER_STATUS_FONT_SIZE);
		}
	} catch {
		// ignore
	}
	try {
		document.documentElement.style.setProperty("--heart-size", HEART_SIZE);
	} catch {
		// ignore
	}
	startDemoScenario(playfield);
	startGameLoop(playfield);
});
