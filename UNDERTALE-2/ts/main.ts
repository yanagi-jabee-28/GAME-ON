import {
	ACTION_BUTTON_FONT_SIZE,
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
import { centerPlayer, loadSvg } from "./player.ts";

const playfield = document.getElementById("playfield");
const heart = document.getElementById("heart");
const entityLayer = document.getElementById("entity-layer");
const enemyDisplay = document.getElementById("enemy-display");

// When true, the click handler requested the heart be shown after the
// playfield transition completes.
let pendingShowHeart = false;

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
		document.documentElement.style.setProperty(
			"--action-button-font-size",
			ACTION_BUTTON_FONT_SIZE,
		);
	} catch {}
	try {
		document.documentElement.style.setProperty("--heart-size", HEART_SIZE);
	} catch {
		// ignore
	}
	// DO NOT start spawning automatically; start when user presses FIGHT
	startGameLoop(playfield);

	// Wire the on-screen Fight button to center the heart and begin spawning
	const fightBtn = document.querySelector(
		"#action-menu .action-button:first-of-type",
	) as HTMLButtonElement | null;
	if (fightBtn) {
		fightBtn.addEventListener("click", () => {
			try {
				// request the heart to be shown after the resize finishes
				pendingShowHeart = true;
				// hide player overlay text when fight begins
				try {
					const overlay = document.getElementById("player-overlay");
					if (overlay instanceof HTMLElement)
						overlay.style.visibility = "hidden";
				} catch {}
				// resize playfield to 240x240 on fight and update debug module state
				playfield.style.width = "240px";
				playfield.style.height = "240px";
				import("./debug.ts").then((dbg) => {
					try {
						dbg.playfieldWidth = 240;
						dbg.playfieldHeight = 240;
						if (typeof dbg.applyPlayfieldSize === "function")
							dbg.applyPlayfieldSize();
					} catch {}
				});
				// center after the resize finishes (transitionend will re-center)
			} catch {}
			// Start the spawn loop with the current pattern
			startDemoScenario(playfield);
		});
	}
});

// When the playfield transition finishes, refresh spawn lines and recenter the heart
playfield.addEventListener("transitionend", (ev) => {
	if (ev.propertyName === "width" || ev.propertyName === "height") {
		import("./debug.ts").then((dbg) => {
			try {
				if (typeof dbg.refreshSpawnLines === "function")
					dbg.refreshSpawnLines();
			} catch {}
		});
		try {
			centerPlayer(playfield);
		} catch {}
		// If a click requested the heart to be shown, show it now.
		try {
			if (pendingShowHeart) {
				pendingShowHeart = false;
				heart.style.visibility = "visible";
				// Notify UI that heart is now visible so selection images can be suppressed
				document.dispatchEvent(new CustomEvent("player:heartShown"));
			}
		} catch {}
	}
});
