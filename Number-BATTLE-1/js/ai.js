import { HINT_MAX_DEPTH } from './constants.js';
import { cloneSnapshot, isHandDead, makeStateKey, wrapTo1to5 } from './utils.js';

const HAND_INDEXES = [0, 1];

function enumerateAttacks(snapshot, owner, opponent) {
	const moves = [];
	for (const i of HAND_INDEXES) {
		const sourceValue = snapshot[owner][i];
		if (isHandDead(sourceValue)) continue;
		for (const j of HAND_INDEXES) {
			const targetValue = snapshot[opponent][j];
			if (isHandDead(targetValue)) continue;
			const newValue = wrapTo1to5(sourceValue + targetValue);
			moves.push({ type: 'attack', src: i, dst: j, newValue });
		}
	}
	return moves;
}

function sumActive(snapshot, owner) {
	return HAND_INDEXES.filter((i) => !isHandDead(snapshot[owner][i])).reduce((sum, i) => sum + snapshot[owner][i], 0);
}

function enumerateSplits(snapshot, owner) {
	const sum = sumActive(snapshot, owner);
	if (sum < 2) return [];
	const patterns = new Set();
	for (let i = 0; i <= sum; i++) {
		const j = sum - i;
		if (i <= 5 && j <= 5) {
			patterns.add(`${i},${j}`);
		}
	}

	const normalize = (value) => (value === 5 ? 0 : value);
	const currentLeft = normalize(snapshot[owner][0]);
	const currentRight = normalize(snapshot[owner][1]);
	const current = `${currentLeft},${currentRight}`;
	const swapped = `${currentRight},${currentLeft}`;

	return Array.from(patterns)
		.filter((pattern) => pattern !== current && pattern !== swapped)
		.map((pattern) => {
			const [left, right] = pattern.split(',').map(Number);
			if (left === 0 || right === 0 || left === 5 || right === 5) return null;
			return { type: 'split', left, right };
		})
		.filter(Boolean);
}

function enumerateMoves(snapshot, owner) {
	const opponent = owner === 'cpu' ? 'player' : 'cpu';
	return {
		attacks: enumerateAttacks(snapshot, owner, opponent),
		splits: enumerateSplits(snapshot, owner)
	};
}

function applyMove(snapshot, owner, move) {
	const next = cloneSnapshot(snapshot);
	if (move.type === 'attack') {
		const opponent = owner === 'cpu' ? 'player' : 'cpu';
		const sourceValue = next[owner][move.src];
		const targetValue = next[opponent][move.dst];
		next[opponent][move.dst] = wrapTo1to5(sourceValue + targetValue);
	} else if (move.type === 'split') {
		next[owner] = [move.left, move.right];
	}
	return next;
}

function heuristicEval(snapshot) {
	const enemyAlive = snapshot.player.filter((value) => !isHandDead(value));
	const selfAlive = snapshot.cpu.filter((value) => !isHandDead(value));
	if (enemyAlive.length === 0) return 1e6;
	if (selfAlive.length === 0) return -1e6;

	let score = 0;
	score += (2 - enemyAlive.length) * 1000;
	score -= (2 - selfAlive.length) * 1000;

	let enemyHandScore = 0;
	enemyAlive.forEach((hand) => {
		enemyHandScore += hand === 4 ? 150 : hand * 10;
	});
	score += enemyHandScore;

	let selfHandScore = 0;
	selfAlive.forEach((hand) => {
		selfHandScore += hand === 4 ? 120 : hand * 5;
	});
	score -= selfHandScore;

	const selfSum = selfAlive.reduce((a, b) => a + b, 0);
	if (selfSum > 5) {
		score -= (selfSum - 5) * 20;
	}

	return score;
}

function terminalEval(snapshot) {
	const playerLost = snapshot.player.every(isHandDead);
	const cpuLost = snapshot.cpu.every(isHandDead);
	if (cpuLost) return -1e6;
	if (playerLost) return 1e6;
	return null;
}

function minimax(snapshot, depth, isMaximizingPlayer, alpha, beta) {
	const terminal = terminalEval(snapshot);
	if (terminal !== null) {
		return terminal * (depth + 1);
	}
	if (depth === 0) {
		return heuristicEval(snapshot);
	}

	const owner = isMaximizingPlayer ? 'cpu' : 'player';
	const { attacks, splits } = enumerateMoves(snapshot, owner);
	const moves = [...attacks, ...splits];

	if (moves.length === 0) {
		return heuristicEval(snapshot);
	}

	if (isMaximizingPlayer) {
		let maxEval = -Infinity;
		for (const move of moves) {
			const next = applyMove(snapshot, owner, move);
			const evaluation = minimax(next, depth - 1, false, alpha, beta);
			maxEval = Math.max(maxEval, evaluation);
			alpha = Math.max(alpha, evaluation);
			if (beta <= alpha) break;
		}
		return maxEval;
	}

	let minEval = Infinity;
	for (const move of moves) {
		const next = applyMove(snapshot, owner, move);
		const evaluation = minimax(next, depth - 1, true, alpha, beta);
		minEval = Math.min(minEval, evaluation);
		beta = Math.min(beta, evaluation);
		if (beta <= alpha) break;
	}
	return minEval;
}

function chooseCpuMoveWithDepth(snapshot, depth, options, historyKeys) {
	const { avoidRepeatsFirst = false, repeatPenalty = 0, optimization = 'max' } = options || {};
	let { attacks, splits } = enumerateMoves(snapshot, 'cpu');
	let candidates = [...attacks, ...splits];
	if (candidates.length === 0) return null;

	if (avoidRepeatsFirst) {
		const nonRepeating = [];
		for (const move of candidates) {
			const next = applyMove(snapshot, 'cpu', move);
			const key = makeStateKey(next, 'player');
			if (!historyKeys.includes(key)) {
				nonRepeating.push(move);
			}
		}
		if (nonRepeating.length > 0) {
			candidates = nonRepeating;
		}
	}

	let bestMove = candidates[0] || null;
	let bestValue = optimization === 'min' ? Infinity : -Infinity;

	for (const move of candidates) {
		const nextSnapshot = applyMove(snapshot, 'cpu', move);
		let value = minimax(nextSnapshot, depth - 1, false, -Infinity, Infinity);
		if (repeatPenalty > 0) {
			const key = makeStateKey(nextSnapshot, 'player');
			const recentCount = historyKeys.filter((stateKey) => stateKey === key).length;
			if (recentCount > 0) {
				const penalty = recentCount * repeatPenalty;
				value += optimization === 'min' ? penalty : -penalty;
			}
		}
		const isBetter = optimization === 'min' ? value < bestValue : value > bestValue;
		if (isBetter) {
			bestValue = value;
			bestMove = move;
		}
	}

	return bestMove;
}

function chooseCpuMoveRandom(snapshot) {
	const { attacks, splits } = enumerateMoves(snapshot, 'cpu');
	const candidates = [...attacks, ...splits].filter((move) => {
		const next = applyMove(snapshot, 'cpu', move);
		return next.player.some((value, index) => value !== snapshot.player[index]) ||
			next.cpu.some((value, index) => value !== snapshot.cpu[index]);
	});
	if (candidates.length === 0) return null;
	const randomIndex = Math.floor(Math.random() * candidates.length);
	return candidates[randomIndex];
}

function chooseCpuMoveNormal(snapshot, historyKeys) {
	const { attacks, splits } = enumerateMoves(snapshot, 'cpu');
	const candidates = [...attacks, ...splits];
	if (candidates.length === 0) return null;

	let bestMove = candidates[0] || null;
	let bestValue = -Infinity;
	const depth = 1;

	for (const move of candidates) {
		const next = applyMove(snapshot, 'cpu', move);
		let value = minimax(next, depth - 1, false, -Infinity, Infinity);
		const key = makeStateKey(next, 'player');
		const recentCount = historyKeys.filter((s) => s === key).length;
		if (recentCount > 0) value -= recentCount * 50;
		if (value > bestValue) {
			bestValue = value;
			bestMove = move;
		}
	}
	return bestMove;
}

function hintResultValue(result) {
	if (!result) return -Infinity;
	const baseMap = {
		win: 100000,
		draw: 0,
		loop: -50,
		lose: -100000
	};
	const base = baseMap[result.outcome] ?? 0;
	const steps = Number.isFinite(result.steps) ? result.steps : 0;
	let value = base;
	if (result.outcome === 'win') {
		value -= steps;
	} else if (result.outcome === 'lose') {
		value += steps;
	} else {
		value += (result.score ?? 0) / 1000;
	}
	return value;
}

function heuristicEvalForState(state) {
	const playerAlive = state.player.filter((value) => !isHandDead(value));
	const cpuAlive = state.cpu.filter((value) => !isHandDead(value));
	if (cpuAlive.length === 0) return 1e6;
	if (playerAlive.length === 0) return -1e6;
	let score = 0;
	score += (2 - cpuAlive.length) * 1000;
	score -= (2 - playerAlive.length) * 1000;
	let cpuHandScore = 0;
	cpuAlive.forEach((hand) => {
		cpuHandScore += hand === 4 ? 150 : hand * 10;
	});
	score -= cpuHandScore;
	let playerHandScore = 0;
	playerAlive.forEach((hand) => {
		playerHandScore += hand === 4 ? 120 : hand * 5;
	});
	score += playerHandScore;
	const playerSum = playerAlive.reduce((a, b) => a + b, 0);
	if (playerSum > 5) score -= (playerSum - 5) * 20;
	return score;
}

function hintSearch(state, depth, turn, pathSet, memo, alpha, beta) {
	const memoKey = `${makeStateKey(state, turn)}|${depth}`;
	if (memo.has(memoKey)) {
		return memo.get(memoKey);
	}

	const playerLost = state.player.every(isHandDead);
	const cpuLost = state.cpu.every(isHandDead);
	if (playerLost) {
		const loseResult = { outcome: 'lose', steps: 0, score: -1e6, firstMove: null };
		memo.set(memoKey, loseResult);
		return loseResult;
	}
	if (cpuLost) {
		const winResult = { outcome: 'win', steps: 0, score: 1e6, firstMove: null };
		memo.set(memoKey, winResult);
		return winResult;
	}
	if (depth === 0) {
		const cutoffResult = { outcome: 'draw', steps: 0, score: heuristicEvalForState(state), firstMove: null };
		memo.set(memoKey, cutoffResult);
		return cutoffResult;
	}

	const loopKey = makeStateKey(state, turn);
	if (pathSet.has(loopKey)) {
		const loopResult = { outcome: 'loop', steps: 0, score: heuristicEvalForState(state), firstMove: null };
		memo.set(memoKey, loopResult);
		return loopResult;
	}

	pathSet.add(loopKey);
	const { attacks, splits } = enumerateMoves(state, turn);
	const moves = [...attacks, ...splits];
	if (!moves.length) {
		pathSet.delete(loopKey);
		const terminalResult = {
			outcome: turn === 'player' ? 'lose' : 'win',
			steps: 0,
			score: turn === 'player' ? -1e6 : 1e6,
			firstMove: null
		};
		memo.set(memoKey, terminalResult);
		return terminalResult;
	}

	let bestResult = null;
	let bestValue = turn === 'player' ? -Infinity : Infinity;

	for (const move of moves) {
		const nextState = applyMove(state, turn, move);
		const child = hintSearch(nextState, depth - 1, turn === 'player' ? 'cpu' : 'player', pathSet, memo, alpha, beta);
		const candidate = {
			outcome: child.outcome,
			steps: child.steps + 1,
			score: child.score,
			firstMove: turn === 'player' ? move : child.firstMove
		};
		const candidateValue = hintResultValue(candidate);

		if (turn === 'player') {
			if (candidateValue > bestValue) {
				bestValue = candidateValue;
				bestResult = candidate;
			}
			alpha = Math.max(alpha, candidateValue);
			if (alpha >= beta) break;
		} else {
			if (candidateValue < bestValue) {
				bestValue = candidateValue;
				bestResult = candidate;
			}
			beta = Math.min(beta, candidateValue);
			if (beta <= alpha) break;
		}
	}

	pathSet.delete(loopKey);
	const finalResult = bestResult || { outcome: 'draw', steps: 0, score: heuristicEvalForState(state), firstMove: null };
	memo.set(memoKey, finalResult);
	return finalResult;
}

export function createAiEngine({ hintDepth = HINT_MAX_DEPTH } = {}) {
	function chooseCpuMove(snapshot, mode, historyKeys) {
		switch (mode) {
			case 'strong':
				return chooseCpuMoveWithDepth(snapshot, 12, { avoidRepeatsFirst: true, repeatPenalty: 1000, optimization: 'max' }, historyKeys);
			case 'weakest':
				return chooseCpuMoveWithDepth(snapshot, 12, { avoidRepeatsFirst: true, repeatPenalty: 1000, optimization: 'min' }, historyKeys);
			case 'hard':
				if (Math.random() < 0.1) {
					return chooseCpuMoveRandom(snapshot);
				}
				return chooseCpuMoveWithDepth(snapshot, 6, { avoidRepeatsFirst: true, repeatPenalty: 800, optimization: 'max' }, historyKeys);
			case 'normal':
				{
					const roll = Math.random();
					if (roll < 0.2) return chooseCpuMoveRandom(snapshot);
					if (roll < 0.5) return chooseCpuMoveNormal(snapshot, historyKeys);
					return chooseCpuMoveWithDepth(snapshot, 6, { avoidRepeatsFirst: true, repeatPenalty: 800, optimization: 'max' }, historyKeys);
				}
			default:
				return chooseCpuMoveNormal(snapshot, historyKeys);
		}
	}

	function computeHint(snapshot) {
		const snapshotClone = cloneSnapshot(snapshot);
		return hintSearch(snapshotClone, hintDepth, 'player', new Set(), new Map(), -Infinity, Infinity);
	}

	return {
		chooseCpuMove,
		computeHint,
		cloneSnapshot,
		applyMove,
		enumerateMoves
	};
}
