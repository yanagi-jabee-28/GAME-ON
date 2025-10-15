import { PLAYER_STATUS_FONT_SIZE } from "./constants.js";
import {
	addEnemySymbol,
	clearKeys,
	handleKeyDown,
	handleKeyUp,
	startDemoScenario,
	startGameLoop,
} from "./game.js";
import { loadSvg } from "./player.js";

// 主要DOMノードをキャッシュしておき、ゲーム開始時の初期化に利用する
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

addEnemySymbol("skull", "emoji", "☠");
addEnemySymbol("fish", "emoji", "🐟️");
// Resolve image path relative to this module to work under bundlers / GH Pages
addEnemySymbol(
	"papyrus",
	"image",
	new URL("./assets/icons8-パピルス-100.png", import.meta.url).href,
);

document.addEventListener("keydown", handleKeyDown, { passive: false });
document.addEventListener("keyup", handleKeyUp, { passive: false });
window.addEventListener("blur", clearKeys);

loadSvg().then(() => {
	// プレイヤーステータスのフォントサイズを定数から適用
	try {
		const status = document.getElementById("player-status");
		if (status instanceof HTMLElement) {
			status.style.setProperty("--player-font-size", PLAYER_STATUS_FONT_SIZE);
		}
	} catch {
		// ignore
	}
	startDemoScenario(playfield);
	startGameLoop(playfield);
});
