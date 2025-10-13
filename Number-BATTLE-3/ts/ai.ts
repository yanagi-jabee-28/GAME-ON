// ai.ts - AI の行動決定（テーブルベース参照型）
//
// Summary:
// - 本モジュールは局面テーブル（chopsticks-tablebase.json）を参照して
//   候補手を評価し、CPU 強度ポリシーに従って最終手を選択して実行します。
// - 非同期にテーブルをロードし、読み込み完了時に `tablebase-loaded` イベントを発行します。
// - エクスポート:
//   - aiTurnWrapper(getState): Promise<void> — AI の行動を実行する。getState は現在局面を返す関数。
//   - getPlayerMovesAnalysis(state): プレイヤー視点での全手評価（ヒント表示用）。テーブル未ロード時は null を返す。
//   - getAIMovesAnalysisFromPlayerView(state): AI の手を列挙しプレイヤー視点で評価した結果（デバッグ用）。
//
// Design notes:
// - テーブルは "normalizedKey|turn" で検索され `outcome` ('WIN'|'LOSS'|'DRAW') と `distance` を返します。
// - AI は候補手を simulateMove で適用した "相手のターン" のキーを引き、テーブルに基づいて手を分類します。
// - 選択ロジックは CPU 強度（hard/normal/weak/weakest）に基づく確率的/ルールベースの方法です。
// - UI アニメーションの完了コールバック内で `applyAttack` / `applySplit` を呼び出して状態変更を行い、勝敗判定・ターン切り替えを行います。

import TABLEBASE_URL from "../chopsticks-tablebase.json?url";
import CONFIG from "./config";
import {
	applyAttack,
	applySplit,
	generateMoves,
	getStateKey,
	invertOutcomeLabel,
	simulateMove,
	switchTurnTo,
} from "./game";
import { performAiAttackAnim, performAiSplitAnim } from "./ui";

// --- Types ---
type PlayerType = "player" | "ai";

type HandPair = [number, number];

interface GameState {
	playerHands: HandPair;
	aiHands: HandPair;
	currentPlayer?: PlayerType;
	gameOver?: boolean;
}

type OutcomeLabel = "WIN" | "LOSS" | "DRAW";

interface TableEntry {
	outcome: OutcomeLabel;
	distance?: number | null;
}

type TableBase = Record<string, TableEntry> | null;

export type AttackMove = {
	type: "attack";
	from: PlayerType;
	fromIndex: number;
	to: PlayerType;
	toIndex: number;
};

export type SplitMove = {
	type: "split";
	owner: PlayerType;
	values: [number, number];
	// legacy fields optional
	val0?: number;
	val1?: number;
};

export type Move = AttackMove | SplitMove;

interface ScoredEntry {
	move: Move;
	outcome: OutcomeLabel | "UNKNOWN";
	distance: number | null;
	tableKey?: string;
}

let tablebase: TableBase = null;
let tablebasePromise: Promise<TableBase> | null = null;

interface StateAccessor {
	playerHands: HandPair;
	aiHands: HandPair;
	currentPlayer?: PlayerType;
	gameOver?: boolean;
	checkWin?: () => { gameOver: boolean; playerLost?: boolean };
	selectedHand?: { owner: PlayerType | null; index: number | null } | null;
}

function dispatchTablebaseLoaded() {
	try {
		if (typeof window !== "undefined") {
			window.dispatchEvent(new Event("tablebase-loaded"));
		}
	} catch {
		// ignore when window is unavailable (e.g., tests)
	}
}

async function requestTablebase() {
	if (tablebase) return tablebase;
	if (!tablebasePromise) {
		tablebasePromise = fetch(TABLEBASE_URL)
			.then((response) => {
				if (!response.ok)
					throw new Error(`Failed to load tablebase (${response.status})`);
				return response.json();
			})
			.then((data) => {
				tablebase = data;
				try {
					console.info("Tablebase loaded successfully.");
				} catch {
					/* ignore */
				}
				dispatchTablebaseLoaded();
				return data;
			})
			.catch((error) => {
				console.error("Error loading tablebase:", error);
				tablebasePromise = null; // allow retry on next request
				return null;
			});
	}
	return tablebasePromise;
}

// Kick off loading in the background to minimize first-turn latency
requestTablebase();

function resolveCpuStrength() {
	if (CONFIG.FORCE_CPU_STRENGTH) return CONFIG.FORCE_CPU_STRENGTH;
	if (CONFIG.SHOW_CPU_STRENGTH_SELECT && typeof document !== "undefined") {
		const select = document.getElementById(
			"cpu-strength-select",
		) as HTMLSelectElement | null;
		if (select?.value) return select.value;
	}
	return CONFIG.DEFAULT_CPU_STRENGTH || "hard";
}

type Perspective = "actor" | "opponent";

type Entry = Partial<ScoredEntry> & { move: Move };

function evaluateMovesWithOutcome(
	state: GameState | null | undefined,
	actor: PlayerType,
	table: TableBase,
	perspective: Perspective = "actor",
): Entry[] {
	if (!state) return [];
	const base = { playerHands: state.playerHands, aiHands: state.aiHands };
	const moves = generateMoves(base, actor);
	const opponentTurn: PlayerType = actor === "player" ? "ai" : "player";

	return moves.reduce<Entry[]>((acc, move) => {
		const simulated = simulateMove({ ...state, currentPlayer: actor }, move);
		const key = getStateKey(simulated, opponentTurn);
		const info = table?.[key];
		if (!info) return acc;
		const distance = typeof info.distance === "number" ? info.distance : null;
		const outcome: OutcomeLabel =
			perspective === "actor"
				? invertOutcomeLabel(info.outcome as OutcomeLabel)
				: (info.outcome as OutcomeLabel);
		acc.push({ move: move as Move, outcome, distance, tableKey: key });
		return acc;
	}, []);
}

function groupByOutcome(entries: Entry[]) {
	const buckets: {
		WIN: Entry[];
		DRAW: Entry[];
		LOSS: Entry[];
		UNKNOWN: Entry[];
		ALL: Entry[];
	} = { WIN: [], DRAW: [], LOSS: [], UNKNOWN: [], ALL: entries };
	for (const entry of entries) {
		if (entry.outcome === "WIN") buckets.WIN.push(entry);
		else if (entry.outcome === "DRAW") buckets.DRAW.push(entry);
		else if (entry.outcome === "LOSS") buckets.LOSS.push(entry);
		else buckets.UNKNOWN.push(entry);
	}
	return buckets;
}

function pickRandom<T>(entries: T[] | null | undefined): T | null {
	if (!entries || entries.length === 0) return null;
	const idx = Math.floor(Math.random() * entries.length);
	return entries[idx];
}

function pickBestWin(entries: Entry[] | null | undefined): Entry | null {
	if (!entries || entries.length === 0) return null;
	const sorted = [...entries].sort(
		(a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
	);
	return sorted[0] || null;
}

function pickRandomDraw(entries: Entry[] | null | undefined): Entry | null {
	return pickRandom(entries ?? []);
}

function pickLossWithMinDistance(
	entries: Entry[] | null | undefined,
	minDistance: number,
): Entry | null {
	if (!entries || entries.length === 0) return null;
	const candidates = entries.filter(
		(entry) =>
			typeof entry.distance === "number" &&
			(entry.distance as number) >= minDistance,
	);
	if (candidates.length === 0) return null;
	candidates.sort(
		(a, b) => (b.distance ?? -Infinity) - (a.distance ?? -Infinity),
	);
	return candidates[0] || null;
}

function pickLongestLoss(entries: Entry[] | null | undefined): Entry | null {
	if (!entries || entries.length === 0) return null;
	const sorted = [...entries].sort(
		(a, b) => (b.distance ?? -Infinity) - (a.distance ?? -Infinity),
	);
	return sorted[0] || null;
}

function pickShortestDistance(
	entries: Entry[] | null | undefined,
): Entry | null {
	if (!entries || entries.length === 0) return null;
	const sorted = [...entries].sort(
		(a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
	);
	return sorted[0] || null;
}

function filterOutImmediatePlayerKills(
	entries: Entry[] | null | undefined,
	baseState: GameState | null | undefined,
): Entry[] {
	if (!entries || entries.length === 0) return [];
	return entries.filter((entry) => {
		const next = simulateMove(
			{ ...(baseState ?? undefined), currentPlayer: "ai" } as GameState,
			entry.move as Move,
		);
		const playerHands = next.playerHands ?? [0, 0];
		return !(playerHands[0] === 0 && playerHands[1] === 0);
	});
}

function findMovesAllowingImmediatePlayerWin(
	entries: Entry[] | null | undefined,
	baseState: GameState | null | undefined,
): Entry[] {
	if (!entries || entries.length === 0) return [];
	const result: Entry[] = [];
	for (const entry of entries) {
		const aiNext = simulateMove(
			{ ...(baseState ?? undefined), currentPlayer: "ai" } as GameState,
			entry.move as Move,
		);
		const playerResponses = generateMoves(
			{ playerHands: aiNext.playerHands, aiHands: aiNext.aiHands },
			"player",
		);
		for (const response of playerResponses) {
			const afterPlayer = simulateMove(
				{ ...aiNext, currentPlayer: "player" } as GameState,
				response as Move,
			);
			const aiHands = afterPlayer.aiHands ?? [0, 0];
			if (aiHands[0] === 0 && aiHands[1] === 0) {
				result.push(entry);
				break;
			}
		}
	}
	return result;
}

function findMovesForcingPlayerWin(
	entries: Entry[] | null | undefined,
	baseState: GameState | null | undefined,
	table: TableBase,
) {
	// Return subset of entries such that after AI plays the entry.move,
	// for every legal player response the resulting position (with AI to move)
	// is recorded in the table as a LOSS for the AI (→ player eventually wins).
	if (!entries || entries.length === 0) return [];
	if (!table) return []; // cannot guarantee without table
	const forced: Entry[] = [];
	for (const entry of entries ?? []) {
		const aiNext = simulateMove(
			{ ...(baseState ?? undefined), currentPlayer: "ai" } as GameState,
			entry.move as Move,
		);
		const playerResponses = generateMoves(
			{ playerHands: aiNext.playerHands, aiHands: aiNext.aiHands },
			"player",
		);
		if (!playerResponses || playerResponses.length === 0) continue; // player has no response -> not a forced win for player
		let allLeadToPlayerWin = true;
		for (const response of playerResponses) {
			const afterPlayer = simulateMove(
				{ ...aiNext, currentPlayer: "player" } as GameState,
				response as Move,
			);
			const key = getStateKey(afterPlayer, "ai");
			const info = table?.[key];
			// if table missing or outcome is not LOSS (ai to move loses), then cannot guarantee
			if (!info || info.outcome !== "LOSS") {
				allLeadToPlayerWin = false;
				break;
			}
		}
		if (allLeadToPlayerWin) forced.push(entry);
	}
	return forced;
}

function selectMoveForStrength(
	strength: string,
	grouped: ReturnType<typeof groupByOutcome>,
	baseState: GameState | null | undefined,
) {
	let choice = null;

	if (strength === "hard") {
		choice =
			pickBestWin(grouped.WIN) ||
			pickRandomDraw(grouped.DRAW) ||
			pickLongestLoss(grouped.LOSS);
	} else if (strength === "weak") {
		const r = Math.random();
		if (r < 0.6) {
			choice =
				pickBestWin(grouped.WIN) ||
				pickRandomDraw(grouped.DRAW) ||
				pickLongestLoss(grouped.LOSS);
		} else {
			choice =
				pickLossWithMinDistance(grouped.LOSS, 5) ||
				pickLongestLoss(grouped.LOSS) ||
				pickRandomDraw(grouped.DRAW) ||
				pickBestWin(grouped.WIN);
		}
	} else {
		const rand = Math.random();
		if (grouped.WIN.length > 0) {
			const WIN_KEEP = 0.7;
			const DRAW_PROB = 0.2;
			if (rand < WIN_KEEP) {
				choice = pickBestWin(grouped.WIN);
			} else if (rand < WIN_KEEP + DRAW_PROB) {
				choice =
					pickRandomDraw(grouped.DRAW) ||
					pickLossWithMinDistance(grouped.LOSS, 11) ||
					pickLongestLoss(grouped.LOSS) ||
					pickBestWin(grouped.WIN);
			} else {
				choice =
					pickLossWithMinDistance(grouped.LOSS, 11) ||
					pickRandomDraw(grouped.DRAW) ||
					pickLongestLoss(grouped.LOSS) ||
					pickBestWin(grouped.WIN);
			}
		} else if (grouped.DRAW.length > 0) {
			if (rand < 0.9 || grouped.LOSS.length === 0) {
				choice = pickRandomDraw(grouped.DRAW);
			} else {
				choice =
					pickLossWithMinDistance(grouped.LOSS, 11) ||
					pickRandomDraw(grouped.DRAW) ||
					pickLongestLoss(grouped.LOSS);
			}
		} else {
			choice =
				pickLossWithMinDistance(grouped.LOSS, 11) ||
				pickLongestLoss(grouped.LOSS) ||
				pickBestWin(grouped.WIN);
		}
	}

	if (strength === "weakest") {
		const safeEntries = filterOutImmediatePlayerKills(grouped.ALL, baseState);
		if (safeEntries.length > 0) {
			const immediateWinMoves = findMovesAllowingImmediatePlayerWin(
				safeEntries,
				baseState,
			);
			if (immediateWinMoves.length > 0) {
				choice = pickRandom(immediateWinMoves);
			} else {
				const safeSet = new Set(safeEntries);
				const lossCandidates = grouped.LOSS.filter((entry) =>
					safeSet.has(entry),
				);
				if (lossCandidates.length > 0) {
					const immediateLoss = lossCandidates.filter(
						(entry) => entry.distance === 0,
					);
					choice =
						pickRandom(immediateLoss) || pickShortestDistance(lossCandidates);
				} else {
					const safeDraws = grouped.DRAW.filter((entry) => safeSet.has(entry));
					choice = pickRandom(safeDraws) || choice;
				}
			}
		}
		if (!choice) choice = pickRandom(safeEntries) || choice;
	}

	return (
		choice ||
		pickRandom(grouped.WIN) ||
		pickRandom(grouped.DRAW) ||
		pickLongestLoss(grouped.LOSS) ||
		grouped.ALL[0] ||
		null
	);
}

function commitAiMove(
	move: Move | null | undefined,
	getState: () => StateAccessor,
) {
	if (!move) return Promise.resolve();
	if (move.type === "attack") {
		return new Promise<void>((resolve) => {
			performAiAttackAnim(move.fromIndex, move.toIndex, () => resolve());
		}).then(() => {
			applyAttack("ai", move.fromIndex, "player", move.toIndex);
			const check = getState().checkWin;
			const result = check ? check() : { gameOver: false };
			if (!result.gameOver) switchTurnTo("player");
		});
	}
	if (move.type === "split") {
		return new Promise<void>((resolve) => {
			performAiSplitAnim(() => resolve());
		}).then(() => {
			const values: [number, number] = Array.isArray(move.values)
				? move.values
				: [move.val0 ?? 0, move.val1 ?? 0];
			applySplit("ai", values[0] ?? 0, values[1] ?? 0);
			const check2 = getState().checkWin;
			const result = check2 ? check2() : { gameOver: false };
			if (!result.gameOver) switchTurnTo("player");
		});
	}
	return Promise.resolve();
}
export async function aiTurnWrapper(getState: () => StateAccessor) {
	const state = getState();
	if (!state || state.gameOver) return;

	const legalMoves = generateMoves(
		{ playerHands: state.playerHands, aiHands: state.aiHands },
		"ai",
	);
	if (legalMoves.length === 0) {
		switchTurnTo("player");
		return;
	}

	const table = await requestTablebase();
	let scoredEntries: Entry[] = [];
	if (table)
		scoredEntries = evaluateMovesWithOutcome(state, "ai", table, "actor");

	let choice = null;
	if (scoredEntries.length > 0) {
		const grouped = groupByOutcome(scoredEntries);
		const strength = resolveCpuStrength();
		// When in 'weakest' mode, prefer moves that allow the PLAYER to win if any exist.
		if (strength === "weakest") {
			// 1) Moves that force a player win regardless of player's reply (requires table)
			const forcedPlayerWinMoves = findMovesForcingPlayerWin(
				scoredEntries,
				state,
				table,
			);
			if (forcedPlayerWinMoves.length > 0) {
				choice = pickRandom(forcedPlayerWinMoves);
			} else {
				// 2) Immediate player-win by simulation (player can win next turn)
				const safeEntries = filterOutImmediatePlayerKills(scoredEntries, state);
				const immediateWinMoves = findMovesAllowingImmediatePlayerWin(
					safeEntries,
					state,
				);
				if (immediateWinMoves.length > 0) {
					choice = pickRandom(immediateWinMoves);
				} else {
					// 3) Table-based moves that are evaluated as player-win (from opponent view)
					const oppEntries = evaluateMovesWithOutcome(
						state,
						"ai",
						table,
						"opponent",
					);
					const playerWinMoves = oppEntries
						? oppEntries.filter((e) => e.outcome === "WIN")
						: [];
					if (playerWinMoves.length > 0) {
						choice =
							pickShortestDistance(playerWinMoves) ||
							pickRandom(playerWinMoves);
					} else {
						// 4) Fallback to existing weakest heuristics if nothing above applies
						choice = selectMoveForStrength(strength, grouped, state);
					}
				}
			}
		} else {
			choice = selectMoveForStrength(strength, grouped, state);
		}
	}

	if (!choice) {
		const fallbackEntries: Entry[] = legalMoves.map(
			(move) => ({ move }) as Entry,
		);
		choice = pickRandom(fallbackEntries) || fallbackEntries[0];
	}

	await commitAiMove((choice as Entry).move, getState);
}

export function getPlayerMovesAnalysis(state: GameState | null | undefined) {
	if (!tablebase) return null;
	return evaluateMovesWithOutcome(state, "player", tablebase, "actor");
}

export function getAIMovesAnalysisFromPlayerView(
	state: GameState | null | undefined,
) {
	if (!tablebase) return null;
	return evaluateMovesWithOutcome(state, "ai", tablebase, "opponent");
}
