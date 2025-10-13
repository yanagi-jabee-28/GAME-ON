import {
	clearKeys,
	handleKeyDown,
	handleKeyUp,
	startDemoScenario,
	startGameLoop,
} from "./game.js";
import { loadSvg } from "./player.js";

const playfield = document.getElementById("playfield");
const heart = document.getElementById("heart");
const entityLayer = document.getElementById("entity-layer");

if (
	!(playfield instanceof HTMLElement) ||
	!(heart instanceof HTMLElement) ||
	!(entityLayer instanceof HTMLElement)
) {
	throw new Error("必要な要素が見つかりませんでした。");
}

document.addEventListener("keydown", handleKeyDown, { passive: false });
document.addEventListener("keyup", handleKeyUp, { passive: false });
window.addEventListener("blur", clearKeys);

loadSvg().then(() => {
	startDemoScenario(playfield);
	startGameLoop(playfield);
});
