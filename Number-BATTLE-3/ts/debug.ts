// debug.ts removed: export a minimal no-op initDebug so any dynamic import is harmless
// debug.ts
// Debug helper: allow the human player to control the AI during the AI's turn.
// Behavior:
// - When Game.currentPlayer === 'ai', clicking AI hands will allow the player
//   to select an AI attacker hand and then click a player hand to perform
//   the AI attack (using existing UI animations and game.applyAttack).
// - When Game.currentPlayer === 'ai', clicking the Split button will open
//   the split modal (reusing UI.openSplitModal) and allow choosing a split
//   to apply to the AI (animating with performAiSplitAnim then applySplit).
// Implementation notes: handlers are installed in the capture phase so they
// can intercept clicks before the normal player handlers in main.ts.

import type { AttackMove, SplitMove } from "./ai";
import { getAIMovesAnalysisFromPlayerView } from "./ai";
import CONFIG from "./config";
import * as Game from "./game";
import type { UiState } from "./ui";
import * as UI from "./ui";

let debugSelected: number | null = null; // index of selected AI hand or null

/**
 * @returns {HTMLInputElement | null}
 */
function getAiControlToggle(): HTMLInputElement | null {
	const el = document.getElementById("toggle-ai-control-cb");
	return el instanceof HTMLInputElement ? el : null;
}

function clearSelectionVisual(): void {
	if (debugSelected !== null) {
		const prev = document.getElementById(`ai-hand-${debugSelected}`);
		if (prev) prev.classList.remove("selected");
	}
	debugSelected = null;
}

function handleContainerClick(e: Event) {
	// Only active when AI's turn and game not over
	try {
		if (Game.gameOver) return;
	} catch {
		return;
	}
	// Check the UI toggle: only intercept when allowed
	if (!CONFIG.SHOW_AI_MANUAL_TOGGLE) return;
	const aiToggle = getAiControlToggle();
	const enabled = !!aiToggle?.checked;
	if (!enabled) return;
	try {
		if (Game.currentPlayer !== "ai") return;
	} catch {
		return;
	}

	const eventTarget = e.target instanceof Element ? e.target : null;
	const rawTarget = eventTarget ? eventTarget.closest("[data-hand]") : null;
	const target = rawTarget instanceof HTMLElement ? rawTarget : null;
	if (!target) return; // not a hand click

	// Intercept and prevent main.ts player handler from running
	e.stopPropagation();
	e.preventDefault();

	const owner = target.dataset.owner;
	const indexAttr = target.dataset.index;
	if (!owner || typeof indexAttr === "undefined") return;
	const index = Number(indexAttr);
	if (!Number.isFinite(index)) return;

	// If clicked an AI hand
	if (owner === "ai") {
		// ignore dead hands
		if (Game.aiHands[index] === 0) return;
		// toggle selection
		if (debugSelected === index) {
			clearSelectionVisual();
			UI.updateMessage("AIの手の選択をキャンセルしました。");
			try {
				UI.clearActionHighlights();
			} catch {}
			return;
		}
		// select new
		clearSelectionVisual();
		debugSelected = index;
		const el = document.getElementById(`ai-hand-${index}`);
		if (el) el.classList.add("selected");
		UI.updateMessage(
			`AIの${index === 0 ? "左手" : "右手"}を選択しました。攻撃先のあなたの手を選んでください、または分配を選んでください。`,
		);

		// Show manual hints for AI: color player's target hands by player's outcome after AI acts
		try {
			const analysis = getAIMovesAnalysisFromPlayerView({
				playerHands: Game.playerHands,
				aiHands: Game.aiHands,
			});
			if (analysis && Array.isArray(analysis)) {
				const uiAnalysis = analysis.map((entry) => ({
					move: entry.move as AttackMove | SplitMove,
					outcome: entry.outcome,
					distance: entry.distance ?? null,
				}));
				UI.applyActionHighlights(
					uiAnalysis as unknown as Parameters<
						typeof UI.applyActionHighlights
					>[0],
					{ owner: "ai", index },
				);
			}
		} catch {
			/* ignore hint errors */
		}
		return;
	}

	// If clicked a player hand while an AI hand is selected -> perform AI attack
	if (owner === "player" && debugSelected !== null) {
		if (Game.playerHands[index] === 0) return; // cannot attack dead hand

		// remove selection visual
		const prevEl = document.getElementById(`ai-hand-${debugSelected}`);
		if (prevEl) prevEl.classList.remove("selected");
		const attackerIndex = debugSelected as number;
		debugSelected = null;

		UI.performAiAttackAnim(attackerIndex, index, () => {
			Game.applyAttack("ai", attackerIndex, "player", index);
			UI.updateDisplay({
				playerHands: Game.playerHands,
				aiHands: Game.aiHands,
				gameOver: Game.gameOver,
				canUndo: Game.canUndo,
				moveCount: Game.getMoveCount?.(),
			});
			try {
				UI.clearActionHighlights();
			} catch {
				/* ignore */
			}
			const res = Game.checkWin();
			if (res.gameOver) {
				if (res.playerLost) UI.updateMessage("あなたの負けです...");
				else UI.updateMessage("あなたの勝ちです！");
				return;
			}
			Game.switchTurnTo("player");
			UI.updateMessage("あなたの番です。");
		});
	}
}

function handleSplitButtonClick(e: Event) {
	// Intercept split button when it's AI's turn: open modal to choose AI split
	if (Game.gameOver) return;
	if (Game.currentPlayer !== "ai") return; // only for AI turn

	// prevent main.js handler
	e.stopPropagation();
	e.preventDefault();

	// Prepare analysis for AI split options (player-view outcome)
	let splitAnalysis = null;
	try {
		const a = getAIMovesAnalysisFromPlayerView({
			playerHands: Game.playerHands,
			aiHands: Game.aiHands,
		});
		splitAnalysis = Array.isArray(a)
			? a
					.filter(
						(x) =>
							x.move.type === "split" && (x.move as SplitMove).owner === "ai",
					)
					.map((x) => ({
						move: {
							type: "split",
							owner: "player",
							values: (x.move as SplitMove).values,
						},
						outcome: x.outcome as "WIN" | "LOSS" | "DRAW" | string,
						distance: x.distance ?? null,
					}))
			: null;
	} catch {
		/* ignore */
	}

	// Fake state: AI hands -> playerHands, Player hands -> aiHands
	const fakeState: UiState = {
		playerHands: [Game.aiHands[0], Game.aiHands[1]] as [number, number],
		aiHands: [Game.playerHands[0], Game.playerHands[1]] as [number, number],
		currentPlayer: "player",
		gameOver: Game.gameOver,
	};
	UI.openSplitModal(fakeState, splitAnalysis, (val0: number, val1: number) => {
		UI.performAiSplitAnim(() => {
			Game.applySplit("ai", val0, val1);
			UI.updateDisplay({
				playerHands: Game.playerHands,
				aiHands: Game.aiHands,
				gameOver: Game.gameOver,
				canUndo: Game.canUndo,
				moveCount: Game.getMoveCount?.(),
			});
			try {
				UI.clearActionHighlights();
			} catch {}
			const res = Game.checkWin();
			if (res.gameOver) {
				if (res.playerLost) UI.updateMessage("あなたの負けです...");
				else UI.updateMessage("あなたの勝ちです！");
				return;
			}
			Game.switchTurnTo("player");
			UI.updateMessage("あなたの番です。");
		});
	});
}

export function initDebug() {
	if (!CONFIG.SHOW_AI_MANUAL_TOGGLE) return; // feature disabled
	// Install capture-phase handlers so they run before the normal handlers in main.js
	const container = document.getElementById("game-container");
	if (container)
		container.addEventListener("click", handleContainerClick, true);

	const splitBtn = document.getElementById("split-btn");
	if (splitBtn)
		splitBtn.addEventListener("click", handleSplitButtonClick, true);

	// Escape clears selection
	window.addEventListener("keydown", (ev) => {
		if (ev.key === "Escape") {
			clearSelectionVisual();
			if (Game.currentPlayer === "ai")
				UI.updateMessage("AIの手の選択をキャンセルしました。");
			ev.stopPropagation();
		}
	});

	// When the toggle is switched off, ensure any selection is cleared immediately.
	const toggle = getAiControlToggle();
	if (toggle) {
		toggle.addEventListener("change", () => {
			if (!toggle.checked) {
				clearSelectionVisual();
				// If currently AI turn, reset message back to waiting/automatic text
				if (Game.currentPlayer === "ai")
					UI.updateMessage("CPUの番です。しばらくお待ちください...");
			}
		});
	}
}
