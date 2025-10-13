// ui.ts - DOM/アニメーション/表示更新
// UI の役割:
//  - DOM 要素のキャッシュ
//  - 盤面の描画更新（数値・disabled 表示など）
//  - アニメーションの補助（攻撃エフェクト、分割エフェクト）
// 注意: UI はゲーム状態を直接変更しない（状態変更は `game.ts` が担当）。

import type { AttackMove, Move, SplitMove } from "./game";

// DOM キャッシュ変数（nullable を許容）
let playerHandElements: (HTMLElement | null)[] = []; // プレイヤーの手を表す DOM 要素配列
let aiHandElements: (HTMLElement | null)[] = []; // AI の手を表す DOM 要素配列
let messageEl: HTMLElement | null = null; // メッセージ表示要素
let splitBtnEl: HTMLElement | null = null; // 分割ボタン要素
// let _restartBtnEl: HTMLElement | null = null; // 再スタートボタン要素 (未使用)
let splitModalEl: HTMLElement | null = null; // 分割モーダル要素
let splitTotalEl: HTMLElement | null = null; // モーダル内の合計表示要素
let splitOptionsContainer: HTMLElement | null = null; // 分割候補ボタンを入れるコンテナ
let undoBtnEl: HTMLButtonElement | null = null; // 戻すボタン要素
let hintAreaEl: HTMLElement | null = null; // ヒント表示エリア要素
let gameContainerEl: HTMLElement | null = null; // ゲームカード本体
let gameWrapperEl: HTMLElement | null = null; // game-container の親（相対配置を含む）
let topControlsEl: HTMLElement | null = null; // 上部の制御群
export let _currentScale = 1;
let moveCounterEl: HTMLElement | null = null; // 手数表示要素

// Minimal analysis entry type used by UI (compatible with AI output)
type UiAnalysisEntry = {
	move: Move & { values?: [number, number] };
	outcome?: "WIN" | "LOSS" | "DRAW" | string;
	distance?: number | null;
};

type UiSelection = {
	owner: "player" | "ai" | null;
	index: number | null;
} | null;

export type UiState = {
	playerHands: [number, number];
	aiHands: [number, number];
	canUndo?: () => boolean;
	gameOver?: boolean;
	currentPlayer?: "player" | "ai";
	moveCount?: number;
};

export function cacheDom() {
	// DOM 要素を一度だけ取得してキャッシュする（頻繁な DOM アクセスを避けるため）
	playerHandElements = [
		document.getElementById("player-hand-0"),
		document.getElementById("player-hand-1"),
	];
	aiHandElements = [
		document.getElementById("ai-hand-0"),
		document.getElementById("ai-hand-1"),
	];
	messageEl = document.getElementById("message");
	splitBtnEl = document.getElementById("split-btn");
	// restart button not currently used by UI module
	// const restartBtnLocal = document.getElementById("restart-btn");
	splitModalEl = document.getElementById("split-modal");
	// Ensure modal is hidden on initial load to avoid accidental visible state
	if (splitModalEl) splitModalEl.classList.add("hidden");
	splitTotalEl = document.getElementById("split-total");
	splitOptionsContainer = document.getElementById("split-options");
	undoBtnEl = document.getElementById("undo-btn") as HTMLButtonElement | null;
	hintAreaEl = document.getElementById("hint-area");
	moveCounterEl = document.getElementById("move-counter");

	// layout related elements for adaptive scaling
	gameContainerEl = document.getElementById("game-container");
	if (gameContainerEl)
		gameWrapperEl = gameContainerEl.parentElement as HTMLElement | null;
	topControlsEl = document.querySelector(".inline-flex") as HTMLElement | null;

	// Allow clicking on the modal overlay to close the modal (click outside content)
	if (splitModalEl) {
		splitModalEl.addEventListener("click", (e: MouseEvent) => {
			if (e.target === splitModalEl) closeSplitModal();
		});
	}
}

/**
 * fitUIToViewport
 * - measure the natural (unscaled) size of `#game-container` and compute a scale
 *   factor so the whole area fits within the viewport (with small margins).
 * - apply CSS transform scale to the container and reserve space on the wrapper
 *   so surrounding elements don't overlap.
 */
export function fitUIToViewport() {
	if (!gameContainerEl || !gameWrapperEl) return;

	// Temporarily remove transform to measure natural size
	gameContainerEl.style.transform = "";
	gameContainerEl.style.transformOrigin = "";

	// Measure natural size
	const rect = gameContainerEl.getBoundingClientRect();
	const naturalWidth = Math.ceil(rect.width);
	const naturalHeight = Math.ceil(rect.height);

	// Available viewport area (leave a small margin so controls aren't flush to edges)
	const margin = 16; // px
	const availableWidth = Math.max(100, window.innerWidth - margin * 2);
	const availableHeight = Math.max(100, window.innerHeight - margin * 2);

	// If there are top controls that take vertical space in normal flow, subtract their height
	let topControlsHeight = 0;
	if (topControlsEl) {
		const tRect = topControlsEl.getBoundingClientRect();
		topControlsHeight = tRect.height || 0;
	}

	const availW = availableWidth;
	const availH = Math.max(80, availableHeight - margin - topControlsHeight);

	// Compute scale (never exceed 1 for now)
	const scale = Math.min(1, availW / naturalWidth, availH / naturalHeight);

	// Apply transform with smooth transition
	gameContainerEl.style.transformOrigin = "top center";
	gameContainerEl.style.transition = "transform 0.18s ease-out";
	gameContainerEl.style.transform = `scale(${scale})`;

	// Reserve wrapper minimum height so layout below doesn't overlap the scaled card.
	try {
		if (scale >= 1) {
			gameWrapperEl.style.minHeight = "";
			gameWrapperEl.style.height = "";
		} else {
			gameWrapperEl.style.height = "";
			gameWrapperEl.style.minHeight = `${Math.ceil(naturalHeight * scale + margin)}px`;
		}
	} catch {
		/* ignore */
	}

	_currentScale = scale;
}

import CONFIG from "./config";

export function displayPlayerHints(
	analysis: UiAnalysisEntry[] | null | undefined,
	mode: "full" | "simple" = "full",
	selection: UiSelection = null,
) {
	if (!hintAreaEl) return;
	// Globally disabled hints: clear and bail
	if (!CONFIG.SHOW_HINT_CONTROLS) {
		hintAreaEl.innerHTML = "";
		return;
	}
	// If the hints toggle is currently off, do not display anything.
	const hintToggle = document.getElementById(
		"toggle-hints-cb",
	) as HTMLInputElement | null;
	const hintsEnabled = !!hintToggle?.checked;
	if (!hintsEnabled) {
		hintAreaEl.innerHTML = "";
		return;
	}
	// If analysis is null it means the tablebase isn't loaded yet.
	// To avoid flicker on reload/initial render, leave the hint area empty instead of showing "計算中...".
	if (!analysis) {
		// Do not display any message to avoid flicker; main.ts will request a re-render when data is ready.
		hintAreaEl.innerHTML = "";
		// clear any action highlights when analysis not available
		clearActionHighlights();
		return;
	}

	const winMoves = analysis.filter((a) => a.outcome === "WIN");
	const drawMoves = analysis.filter((a) => a.outcome === "DRAW");

	let bestMove: UiAnalysisEntry | undefined;
	let outcomeText: string | undefined;
	let outcomeColorClass: string | undefined;

	if (winMoves.length > 0) {
		winMoves.sort(
			(a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
		);
		bestMove = winMoves[0];
		// フルヒント/簡易ヒントで表示内容を切り替える
		if (mode === "simple") {
			outcomeText = "勝てる局面";
		} else {
			// 表示は「この手を含めた手数」として見せる（遷移先 distance + 1）
			if (bestMove.distance === 0) outcomeText = "即勝ち";
			else outcomeText = `${(bestMove.distance ?? 0) + 1}手で勝ち`;
		}
		outcomeColorClass = "text-green-600";
	} else if (drawMoves.length > 0) {
		bestMove = drawMoves[0]; // どの引き分け手でも良い
		if (mode === "simple") outcomeText = "引き分けの局面";
		else outcomeText = "引き分け";
		outcomeColorClass = "text-blue-600";
	} else if (analysis.length > 0) {
		analysis.sort(
			(a, b) => (b.distance ?? -Infinity) - (a.distance ?? -Infinity),
		); // 最も長く粘れる手
		bestMove = analysis[0];
		if (mode === "simple") {
			outcomeText = "負ける局面";
		} else {
			if (bestMove.distance === 0) outcomeText = "即負け";
			else outcomeText = `${(bestMove.distance ?? 0) + 1}手で負け`;
		}
		outcomeColorClass = "text-red-600";
	} else {
		hintAreaEl.innerHTML = ""; // 手がない場合
		return;
	}

	// moveオブジェクトを人間可読な文字列に変換する
	let actionText = "";
	if (bestMove) {
		if (bestMove.move.type === "attack") {
			const attack = bestMove.move as AttackMove;
			const fromHand = attack.fromIndex === 0 ? "左手" : "右手";
			const toHand = attack.toIndex === 0 ? "相手の左手" : "相手の右手";
			actionText = `(${fromHand}で${toHand}を攻撃)`;
		} else if (bestMove.move.type === "split") {
			const splitMove = bestMove.move as SplitMove;
			const vals: [number, number] = splitMove.values ?? [
				splitMove.val0 ?? 0,
				splitMove.val1 ?? 0,
			];
			actionText = `(手を[${vals.join(", ")}]に分割)`;
		}
	}

	if (mode === "simple") {
		hintAreaEl.innerHTML = `💡 <span class="font-bold ${outcomeColorClass}">${outcomeText}</span>`;
	} else {
		hintAreaEl.innerHTML = `💡 最善手: <span class="font-bold ${outcomeColorClass}">${outcomeText}</span> <span class="text-xs">${actionText}</span>`;
	}

	// When analysis is present, also apply per-action highlights (attack targets / splits) only for full hints
	if (mode === "full") {
		try {
			applyActionHighlights(analysis, selection);
		} catch {
			// ignore
		}
	} else {
		// For simple hints, clear any existing highlights
		clearActionHighlights();
	}
}

// Helper: clear any action highlight classes we added to hand elements and split buttons
export function clearActionHighlights() {
	// typed local alias for clarity
	type HandElement = HTMLElement | null;

	if (Array.isArray(playerHandElements)) {
		(playerHandElements as HandElement[]).forEach((el) => {
			if (!el) return;
			el.classList.remove(
				"hint-win",
				"hint-draw",
				"hint-loss",
				"border-4",
				"border-green-400",
				"border-blue-400",
				"border-red-400",
			);
			// remove any inline border styles we may have applied
			try {
				el.style.borderWidth = "";
				el.style.borderStyle = "";
				el.style.borderColor = "";
			} catch {
				// ignore
			}
		});
	}

	if (Array.isArray(aiHandElements)) {
		(aiHandElements as HandElement[]).forEach((el) => {
			if (!el) return;
			el.classList.remove(
				"hint-win",
				"hint-draw",
				"hint-loss",
				"border-4",
				"border-green-400",
				"border-blue-400",
				"border-red-400",
			);
			try {
				el.style.borderWidth = "";
				el.style.borderStyle = "";
				el.style.borderColor = "";
			} catch {
				// ignore
			}
		});
	}

	// clear split option coloring if present
	if (splitOptionsContainer) {
		const buttons = Array.from(
			(splitOptionsContainer as HTMLElement).querySelectorAll("button"),
		) as HTMLButtonElement[];
		buttons.forEach((b) => {
			b.classList.remove(
				"border-4",
				"border-green-400",
				"border-blue-400",
				"border-red-400",
			);
			try {
				b.style.borderWidth = "";
				b.style.borderStyle = "";
				b.style.borderColor = "";
			} catch {
				// ignore
			}
		});
	}
}

// Apply per-action highlights when player has selected a hand.
// analysis: array returned from AI.getPlayerMovesAnalysis (or similar)
export function applyActionHighlights(
	analysis: UiAnalysisEntry[] | null | undefined,
	selection: UiSelection,
) {
	// first clear previous highlights
	clearActionHighlights();
	if (!analysis || !Array.isArray(analysis) || analysis.length === 0) return;

	// Highlight attack targets for the currently selected player hand
	if (
		selection &&
		selection.owner === "player" &&
		typeof selection.index === "number"
	) {
		const fromIdx = selection.index;
		// Find attack moves from this hand (narrow to AttackMove)
		const rawAttacks = analysis.filter((a) => a.move.type === "attack");
		const attacks = rawAttacks as (UiAnalysisEntry & { move: AttackMove })[];
		attacks
			.filter((a) => a.move.fromIndex === fromIdx)
			.forEach((a) => {
				const toIdx = a.move.toIndex ?? 0;
				const el = aiHandElements[toIdx];
				if (!el) return;
				// Apply inline border styles to avoid relying on compiled Tailwind utility classes
				try {
					el.style.borderWidth = "4px";
					el.style.borderStyle = "solid";
					if (a.outcome === "WIN") {
						el.style.borderColor = "#34D399"; // green-400-ish
					} else if (a.outcome === "DRAW") {
						el.style.borderColor = "#60A5FA"; // blue-400-ish
					} else {
						el.style.borderColor = "#FB7185"; // red-400-ish
					}
				} catch {
					/* ignore style errors */
				}
			});
	}

	// Highlight player targets when manually controlling AI hands
	if (
		selection &&
		selection.owner === "ai" &&
		typeof selection.index === "number"
	) {
		const fromIdx = selection.index;
		const rawAttacks = analysis.filter((a) => a.move.type === "attack");
		const attacks = rawAttacks as (UiAnalysisEntry & { move: AttackMove })[];
		attacks
			.filter((a) => a.move.from === "ai" && a.move.fromIndex === fromIdx)
			.forEach((a) => {
				const toIdx = a.move.toIndex ?? 0;
				const el = playerHandElements[toIdx];
				if (!el) return;
				try {
					el.style.borderWidth = "4px";
					el.style.borderStyle = "solid";
					if (a.outcome === "WIN") {
						el.style.borderColor = "#34D399";
					} else if (a.outcome === "DRAW") {
						el.style.borderColor = "#60A5FA";
					} else {
						el.style.borderColor = "#FB7185";
					}
				} catch {
					/* ignore style errors */
				}
			});
	}
	// Also color split options inside modal if open (main will pass analysis to openSplitModal)
}

export function clearPlayerHints() {
	if (hintAreaEl) hintAreaEl.innerHTML = "";
}

export function updateDisplay(state: UiState) {
	// プレイヤー/AI の数値と disabled 表示を更新する
	(playerHandElements as (HTMLElement | null)[]).forEach((el, i) => {
		if (!el) return;
		el.textContent = String(state.playerHands[i]); // 行末コメント: 数値を描画
		el.classList.toggle("disabled", state.playerHands[i] === 0); // 行末コメント: 0 の手を無効表示
	});
	(aiHandElements as (HTMLElement | null)[]).forEach((el, i) => {
		if (!el) return;
		el.textContent = String(state.aiHands[i]);
		el.classList.toggle("disabled", state.aiHands[i] === 0);
	});

	// update undo button enabled/disabled according to state.canUndo if provided
	if (undoBtnEl) {
		if (typeof state.canUndo === "function") {
			undoBtnEl.disabled = !state.canUndo();
			undoBtnEl.classList.toggle("opacity-50", !state.canUndo());
		} else {
			// fallback: enable by default
			undoBtnEl.disabled = false;
			undoBtnEl.classList.remove("opacity-50");
		}
	}

	// If gameOver flag provided in state, hide or show split button only.
	if (typeof state.gameOver !== "undefined") {
		if (state.gameOver) {
			if (splitBtnEl) splitBtnEl.classList.add("hidden");
		} else {
			if (splitBtnEl) splitBtnEl.classList.remove("hidden");
		}
	}

	// Update move counter if provided
	if (typeof state.moveCount === "number" && moveCounterEl) {
		moveCounterEl.textContent = String(state.moveCount);
	}

	// After updating display, ensure the UI fits the viewport (useful when sizes change)
	if (typeof fitUIToViewport === "function") {
		// Delay slightly to allow DOM reflow (e.g., after animations)
		setTimeout(() => {
			try {
				fitUIToViewport();
			} catch {
				/* ignore */
			}
		}, 30);
	}
}

export function updateMessage(msg: string) {
	// ゲームの案内メッセージを更新する
	if (!messageEl) return;
	messageEl.textContent = msg; // 行末コメント: プレイヤーに現在の状態/次のアクションを示す
}

export function openSplitModal(
	state: UiState,
	analysisOrUndefined?: UiAnalysisEntry[] | null,
	onSelect?: (v0: number, v1: number) => void,
) {
	// 分割モーダルを開く。プレイヤーのターンかつゲーム中であることを前提とする
	if (state.gameOver || state.currentPlayer !== "player") return; // 条件満たさない場合は無視
	if (!splitTotalEl || !splitOptionsContainer || !splitModalEl) return; // DOM 未初期化時は無視
	const total = state.playerHands[0] + state.playerHands[1]; // 合計本数
	splitTotalEl.textContent = String(total); // 合計表示を更新
	splitOptionsContainer.innerHTML = ""; // 前回の候補をクリア
	const container = splitOptionsContainer as HTMLElement;
	const modal = splitModalEl as HTMLElement;
	if (total === 0) {
		// 分割できる指が無い場合の案内
		splitOptionsContainer.innerHTML =
			'<p class="col-span-2 text-gray-500">分配できる指がありません。</p>';
		// Add cancel button so user can close the modal
		const cancelBtn = document.createElement("button");
		cancelBtn.textContent = "キャンセル";
		cancelBtn.className =
			"btn py-3 px-4 bg-gray-300 text-black font-bold rounded-lg shadow-md col-span-2";
		cancelBtn.onclick = () => {
			closeSplitModal();
		};
		container.appendChild(cancelBtn);
		splitModalEl.classList.remove("hidden");
		return;
	}
	const possibleSplits = [];
	for (let i = 0; i <= total / 2; i++) {
		const j = total - i;
		if (j > 4) continue; // 右手が 4 を超える分割は無効
		const isSameAsCurrent =
			i === state.playerHands[0] && j === state.playerHands[1];
		const isSameAsReversed =
			i === state.playerHands[1] && j === state.playerHands[0];
		if (!isSameAsCurrent && !isSameAsReversed) possibleSplits.push([i, j]); // 重複パターンを除外
	}
	if (possibleSplits.length === 0) {
		container.innerHTML =
			'<p class="col-span-2 text-gray-500">有効な分配パターンがありません。</p>';
		// add cancel button
		const cancelBtn = document.createElement("button");
		cancelBtn.textContent = "キャンセル";
		cancelBtn.className =
			"btn py-3 px-4 bg-gray-300 text-black font-bold rounded-lg shadow-md col-span-2";
		cancelBtn.onclick = () => {
			closeSplitModal();
		};
		container.appendChild(cancelBtn);
	} else {
		possibleSplits.forEach((split) => {
			const button = document.createElement("button");
			button.textContent = `${split[0]} と ${split[1]}`; // ボタンに候補数値を表示
			// default neutral styling
			button.className =
				"btn py-3 px-4 bg-gray-100 text-black font-bold rounded-lg shadow-md w-full";
			// If analysis available, find a matching split result and color accordingly
			try {
				if (analysisOrUndefined && Array.isArray(analysisOrUndefined)) {
					// Find analysis entry that is a split with these values
					const found = analysisOrUndefined.find((a) => {
						if (a.move.type !== "split") return false;
						const mv = a.move as SplitMove;
						const v0 = mv.values?.[0] ?? mv.val0 ?? 0;
						const v1 = mv.values?.[1] ?? mv.val1 ?? 0;
						return v0 === split[0] && v1 === split[1];
					});
					if (found) {
						// paint border color according to outcome
						button.classList.add("border-4");
						if (found.outcome === "WIN")
							button.classList.add("border-green-400");
						else if (found.outcome === "DRAW")
							button.classList.add("border-blue-400");
						else button.classList.add("border-red-400");
					}
				}
			} catch {
				// ignore
			}
			button.onclick = () => {
				// Delegate the actual split action to the caller via callback
				if (typeof onSelect === "function") onSelect(split[0], split[1]); // 行末コメント: 選択後に呼び出し側が状態を更新
				if (modal) modal.classList.add("hidden"); // モーダルを閉じる
			};
			container.appendChild(button);
		});
		// Add a cancel button under valid options as well
		const cancelBtn = document.createElement("button");
		cancelBtn.textContent = "キャンセル";
		cancelBtn.className =
			"btn py-3 px-4 bg-gray-300 text-black font-bold rounded-lg shadow-md col-span-2";
		cancelBtn.onclick = () => {
			closeSplitModal();
		};
		container.appendChild(cancelBtn);
	}
	modal.classList.remove("hidden"); // モーダル表示
}

export function closeSplitModal() {
	// モーダルを閉じるユーティリティ
	if (!splitModalEl) return;
	splitModalEl.classList.add("hidden");
}

export function animateMove(
	element: HTMLElement,
	targetX: number,
	targetY: number,
	callback?: () => void,
) {
	// 要素を現在位置から targetX/targetY へ移動させる（CSS トランジション利用）
	if (!element) {
		if (typeof callback === "function") callback();
		return;
	}
	const rect = element.getBoundingClientRect();
	const deltaX = targetX - rect.left;
	const deltaY = targetY - rect.top;

	element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
	element.classList.add("move-to-target");

	function handler() {
		element.classList.remove("move-to-target");
		element.style.transform = "";
		element.removeEventListener("transitionend", handler as EventListener);
		if (typeof callback === "function") callback();
	}

	element.addEventListener("transitionend", handler as EventListener);
}

export function performPlayerAttackAnim(
	attackerIndex: number,
	targetIndex: number,
	onComplete?: () => void,
) {
	// プレイヤーの攻撃アニメーション: 手のクローンを作ってターゲットまで移動させる
	const attackerEl = playerHandElements[attackerIndex];
	const targetEl = aiHandElements[targetIndex];
	if (!attackerEl || !targetEl) {
		if (onComplete) onComplete();
		return;
	}
	const targetRect = targetEl.getBoundingClientRect();
	const attackerCloneNode = attackerEl.cloneNode(true);
	const attackerClone = attackerCloneNode as HTMLElement;
	document.body.appendChild(attackerClone);
	const attackerRect = attackerEl.getBoundingClientRect();
	attackerClone.style.position = "absolute";
	attackerClone.style.left = `${attackerRect.left}px`;
	attackerClone.style.top = `${attackerRect.top}px`;
	attackerClone.style.width = `${attackerRect.width}px`;
	attackerClone.style.height = `${attackerRect.height}px`;
	animateMove(attackerClone, targetRect.left, targetRect.top, () => {
		try {
			document.body.removeChild(attackerClone);
		} catch {}
		if (onComplete) onComplete();
	});
}

export function performAiAttackAnim(
	attackerIndex: number,
	targetIndex: number,
	onComplete?: () => void,
) {
	// AI の攻撃アニメーション（プレイヤー攻撃と逆方向）
	// Clear any player-side hint highlights so UI doesn't show hints during AI action
	try {
		clearActionHighlights();
	} catch {
		// ignore
	}
	const attackerEl = aiHandElements[attackerIndex];
	const targetEl = playerHandElements[targetIndex];
	if (!attackerEl || !targetEl) {
		if (onComplete) onComplete();
		return;
	}
	const targetRect = targetEl.getBoundingClientRect();
	const attackerCloneNode = attackerEl.cloneNode(true);
	const attackerClone = attackerCloneNode as HTMLElement;
	document.body.appendChild(attackerClone);
	const attackerRect = attackerEl.getBoundingClientRect();
	attackerClone.style.position = "absolute";
	attackerClone.style.left = `${attackerRect.left}px`;
	attackerClone.style.top = `${attackerRect.top}px`;
	attackerClone.style.width = `${attackerRect.width}px`;
	attackerClone.style.height = `${attackerRect.height}px`;
	animateMove(attackerClone, targetRect.left, targetRect.top, () => {
		try {
			document.body.removeChild(attackerClone);
		} catch {}
		if (onComplete) onComplete();
	});
}

export function performAiSplitAnim(onComplete?: () => void) {
	// AI の分割アニメーション: 左右の手を中央へ寄せる表現
	// Clear any player-side hint highlights so UI doesn't show hints during AI action
	try {
		clearActionHighlights();
	} catch {
		// ignore
	}
	const leftHandEl = aiHandElements[0];
	const rightHandEl = aiHandElements[1];
	if (!leftHandEl || !rightHandEl) {
		if (onComplete) onComplete();
		return;
	}
	const leftCenterX =
		leftHandEl.getBoundingClientRect().left +
		leftHandEl.getBoundingClientRect().width / 2;
	const rightCenterX =
		rightHandEl.getBoundingClientRect().left +
		rightHandEl.getBoundingClientRect().width / 2;
	const centerX = (leftCenterX + rightCenterX) / 2; // 中央 x 座標
	const centerY = leftHandEl.getBoundingClientRect().top; // y 座標は左右同じ想定
	const leftCloneNode = leftHandEl.cloneNode(true);
	const rightCloneNode = rightHandEl.cloneNode(true);
	const leftClone = leftCloneNode as HTMLElement;
	const rightClone = rightCloneNode as HTMLElement;
	document.body.appendChild(leftClone);
	document.body.appendChild(rightClone);
	leftClone.style.position = "absolute";
	rightClone.style.position = "absolute";
	const leftRect = leftHandEl.getBoundingClientRect();
	const rightRect = rightHandEl.getBoundingClientRect();
	leftClone.style.left = `${leftRect.left}px`;
	leftClone.style.top = `${leftRect.top}px`;
	rightClone.style.left = `${rightRect.left}px`;
	rightClone.style.top = `${rightRect.top}px`;
	const leftTargetX = centerX - leftClone.offsetWidth / 2;
	const rightTargetX = centerX - rightClone.offsetWidth / 2;
	animateMove(leftClone, leftTargetX, centerY, () => {
		try {
			document.body.removeChild(leftClone);
		} catch {}
	});
	animateMove(rightClone, rightTargetX, centerY, () => {
		try {
			document.body.removeChild(rightClone);
		} catch {}
		if (onComplete) onComplete();
	});
}

export function performPlayerSplitAnim(
	_val0: number,
	_val1: number,
	onComplete?: () => void,
) {
	// プレイヤーの分割アニメーション: 左右の手を中央へ寄せる表現
	// 注意: 状態変更はここでは行わず、onComplete で呼び出し元に通知するだけ
	const leftHandEl = playerHandElements[0];
	const rightHandEl = playerHandElements[1];
	if (!leftHandEl || !rightHandEl) {
		if (onComplete) onComplete();
		return;
	}
	const leftCenterX =
		leftHandEl.getBoundingClientRect().left +
		leftHandEl.getBoundingClientRect().width / 2;
	const rightCenterX =
		rightHandEl.getBoundingClientRect().left +
		rightHandEl.getBoundingClientRect().width / 2;
	const centerX = (leftCenterX + rightCenterX) / 2;
	const centerY = leftHandEl.getBoundingClientRect().top;
	const leftCloneNode = leftHandEl.cloneNode(true);
	const rightCloneNode = rightHandEl.cloneNode(true);
	const leftClone = leftCloneNode as HTMLElement;
	const rightClone = rightCloneNode as HTMLElement;
	document.body.appendChild(leftClone);
	document.body.appendChild(rightClone);
	leftClone.style.position = "absolute";
	rightClone.style.position = "absolute";
	const leftRect = leftHandEl.getBoundingClientRect();
	const rightRect = rightHandEl.getBoundingClientRect();
	leftClone.style.left = `${leftRect.left}px`;
	leftClone.style.top = `${leftRect.top}px`;
	rightClone.style.left = `${rightRect.left}px`;
	rightClone.style.top = `${rightRect.top}px`;
	const leftTargetX = centerX - leftClone.offsetWidth / 2;
	const rightTargetX = centerX - rightClone.offsetWidth / 2;
	animateMove(leftClone, leftTargetX, centerY, () => {
		try {
			document.body.removeChild(leftClone);
		} catch {}
	});
	animateMove(rightClone, rightTargetX, centerY, () => {
		try {
			document.body.removeChild(rightClone);
		} catch {}
		// Do NOT mutate game state here; delegate to caller via onComplete
		if (onComplete) onComplete();
	});
}
