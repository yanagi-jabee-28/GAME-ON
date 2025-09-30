export const HINT_MAX_DEPTH = 15;

export const wrapTo1to5 = (value) => {
	const normalized = ((value % 5) + 5) % 5;
	return normalized === 0 ? 0 : normalized;
};

export function cloneStateFrom(state) {
	return {
		player: [state.player[0], state.player[1]],
		cpu: [state.cpu[0], state.cpu[1]]
	};
}

export function hintStateKeyFrom(state, turn) {
	return JSON.stringify({ player: state.player, cpu: state.cpu, turn });
}

export function hintIsDead(value) {
	return value === 0 || value === 5;
}

export function hintEnumerateAttacks(state, owner) {
	const opponent = owner === 'player' ? 'cpu' : 'player';
	const moves = [];
	for (const i of [0, 1]) {
		const sourceValue = state[owner][i];
		if (hintIsDead(sourceValue)) continue;
		for (const j of [0, 1]) {
			const targetValue = state[opponent][j];
			if (hintIsDead(targetValue)) continue;
			moves.push({ type: 'attack', src: i, dst: j });
		}
	}
	return moves;
}

export function hintSumActive(state, owner) {
	return [0, 1]
		.filter(index => !hintIsDead(state[owner][index]))
		.reduce((sum, index) => sum + state[owner][index], 0);
}

export function hintEnumerateSplits(state, owner) {
	const sum = hintSumActive(state, owner);
	if (sum < 2) return [];
	const patterns = new Set();
	for (let left = 0; left <= sum; left++) {
		const right = sum - left;
		if (left <= 5 && right <= 5) {
			patterns.add(`${left},${right}`);
		}
	}
	const normalize = (value) => (value === 0 || value === 5 ? 0 : value);
	const currentLeft = normalize(state[owner][0]);
	const currentRight = normalize(state[owner][1]);
	const current = `${currentLeft},${currentRight}`;
	const swapped = `${currentRight},${currentLeft}`;
	return Array.from(patterns)
		.filter(pattern => pattern !== current && pattern !== swapped)
		.map(pattern => {
			const [left, right] = pattern.split(',').map(Number);
			if (left === 0 || right === 0 || left === 5 || right === 5) return null;
			return { type: 'split', left, right };
		})
		.filter(Boolean);
}

export function hintEnumerateMoves(state, owner) {
	const attacks = hintEnumerateAttacks(state, owner);
	const splits = hintEnumerateSplits(state, owner);
	return [...attacks, ...splits];
}

export function hintApplyMove(state, owner, move) {
	const next = cloneStateFrom(state);
	if (move.type === 'attack') {
		const opponent = owner === 'player' ? 'cpu' : 'player';
		const sourceValue = next[owner][move.src];
		const targetValue = next[opponent][move.dst];
		next[opponent][move.dst] = wrapTo1to5(sourceValue + targetValue);
	} else if (move.type === 'split') {
		next[owner] = [move.left, move.right];
	}
	return next;
}

const OWNER_CPU = 'cpu';
const OWNER_PLAYER = 'player';

function normalizedHandValue(value) {
	return hintIsDead(value) ? 0 : value;
}

function aliveHandIndices(state, owner) {
	return [0, 1].filter(index => !hintIsDead(state[owner][index]));
}

function countAliveHands(state, owner) {
	return aliveHandIndices(state, owner).length;
}

function totalActiveValue(state, owner) {
	return aliveHandIndices(state, owner)
		.reduce((sum, index) => sum + normalizedHandValue(state[owner][index]), 0);
}

function countHighRiskHands(state, owner) {
	return aliveHandIndices(state, owner)
		.reduce((sum, index) => sum + (normalizedHandValue(state[owner][index]) === 4 ? 1 : 0), 0);
}

function countKillOpportunities(state, attacker, defender) {
	let kills = 0;
	aliveHandIndices(state, attacker).forEach(srcIndex => {
		const sourceValue = state[attacker][srcIndex];
		aliveHandIndices(state, defender).forEach(dstIndex => {
			const targetValue = state[defender][dstIndex];
			if (wrapTo1to5(sourceValue + targetValue) === 0) {
				kills += 1;
			}
		});
	});
	return kills;
}

function countNearKillOpportunities(state, attacker, defender) {
	let threats = 0;
	aliveHandIndices(state, attacker).forEach(srcIndex => {
		const sourceValue = state[attacker][srcIndex];
		aliveHandIndices(state, defender).forEach(dstIndex => {
			const targetValue = state[defender][dstIndex];
			if (wrapTo1to5(sourceValue + targetValue) === 4) {
				threats += 1;
			}
		});
	});
	return threats;
}

function splitFlexibility(state, owner) {
	return hintEnumerateSplits(state, owner).length;
}

export function heuristicEvalForState(state) {
	if (countAliveHands(state, OWNER_CPU) === 0) return -1e6;
	if (countAliveHands(state, OWNER_PLAYER) === 0) return 1e6;

	const cpuAlive = countAliveHands(state, OWNER_CPU);
	const playerAlive = countAliveHands(state, OWNER_PLAYER);
	const cpuSum = totalActiveValue(state, OWNER_CPU);
	const playerSum = totalActiveValue(state, OWNER_PLAYER);
	const cpuKills = countKillOpportunities(state, OWNER_CPU, OWNER_PLAYER);
	const playerKills = countKillOpportunities(state, OWNER_PLAYER, OWNER_CPU);
	const cpuNearKills = countNearKillOpportunities(state, OWNER_CPU, OWNER_PLAYER);
	const playerNearKills = countNearKillOpportunities(state, OWNER_PLAYER, OWNER_CPU);
	const cpuHighRisk = countHighRiskHands(state, OWNER_CPU);
	const playerHighRisk = countHighRiskHands(state, OWNER_PLAYER);
	const cpuFlex = splitFlexibility(state, OWNER_CPU);
	const playerFlex = splitFlexibility(state, OWNER_PLAYER);

	let score = 0;
	score += (cpuAlive - playerAlive) * 1400;
	score += (playerSum - cpuSum) * 90;
	score += (cpuKills - playerKills) * 520;
	score += (cpuNearKills - playerNearKills) * 260;
	score += (cpuFlex - playerFlex) * 110;
	score += (playerHighRisk - cpuHighRisk) * 180;

	return score;
}

function orderMoves(state, moves, turn) {
	if (moves.length <= 1) return moves;
	return moves
		.map(move => {
			const nextState = hintApplyMove(state, turn, move);
			const priority = heuristicEvalForState(nextState);
			return {
				move,
				priority: turn === OWNER_CPU ? priority : -priority
			};
		})
		.sort((a, b) => b.priority - a.priority)
		.map(entry => entry.move);
}

export function hintResultValue(result) {
	if (!result) return -Infinity;
	const base = {
		win: 100000,
		draw: 0,
		loop: -50,
		lose: -100000
	}[result.outcome] ?? 0;
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

export function hintSearch(state, depth, turn, rootTurn, pathSet, memo, alpha, beta) {
	const memoKey = `${hintStateKeyFrom(state, turn)}|${depth}|${rootTurn}`;
	if (memo.has(memoKey)) {
		return memo.get(memoKey);
	}

	const playerLost = state.player.every(hintIsDead);
	const cpuLost = state.cpu.every(hintIsDead);
	if (playerLost) {
		const loseResult = { outcome: 'lose', steps: 0, score: -1e6, firstMove: null, line: [] };
		memo.set(memoKey, loseResult);
		return loseResult;
	}
	if (cpuLost) {
		const winResult = { outcome: 'win', steps: 0, score: 1e6, firstMove: null, line: [] };
		memo.set(memoKey, winResult);
		return winResult;
	}
	if (depth === 0) {
		const cutoffResult = { outcome: 'draw', steps: 0, score: heuristicEvalForState(state), firstMove: null, line: [] };
		memo.set(memoKey, cutoffResult);
		return cutoffResult;
	}

	const loopKey = hintStateKeyFrom(state, turn);
	if (pathSet.has(loopKey)) {
		const loopResult = { outcome: 'loop', steps: 0, score: heuristicEvalForState(state), firstMove: null, line: [] };
		memo.set(memoKey, loopResult);
		return loopResult;
	}

	pathSet.add(loopKey);
	const moves = hintEnumerateMoves(state, turn);
	if (!moves.length) {
		pathSet.delete(loopKey);
		const terminalResult = {
			outcome: turn === 'player' ? 'lose' : 'win',
			steps: 0,
			score: turn === 'player' ? -1e6 : 1e6,
			firstMove: null,
			line: []
		};
		memo.set(memoKey, terminalResult);
		return terminalResult;
	}

	let bestResult = null;
	let bestValue = turn === rootTurn ? -Infinity : Infinity;
	const orderedMoves = orderMoves(state, moves, turn);

	for (const move of orderedMoves) {
		const nextState = hintApplyMove(state, turn, move);
		const child = hintSearch(nextState, depth - 1, turn === 'player' ? 'cpu' : 'player', rootTurn, pathSet, memo, alpha, beta);
		const candidate = {
			outcome: child.outcome,
			steps: child.steps + 1,
			score: child.score,
			firstMove: turn === rootTurn ? move : child.firstMove,
			line: (() => {
				const tail = Array.isArray(child.line) ? child.line : [];
				return turn === rootTurn ? [move, ...tail] : tail;
			})()
		};
		const candidateValue = hintResultValue(candidate);

		if (turn === rootTurn) {
			if (candidateValue > bestValue) {
				bestValue = candidateValue;
				bestResult = candidate;
			}
			alpha = Math.max(alpha, candidateValue);
			if (alpha >= beta) {
				break;
			}
		} else {
			if (candidateValue < bestValue) {
				bestValue = candidateValue;
				bestResult = candidate;
			}
			beta = Math.min(beta, candidateValue);
			if (beta <= alpha) {
				break;
			}
		}
	}

	pathSet.delete(loopKey);
	const finalResult = bestResult || { outcome: 'draw', steps: 0, score: heuristicEvalForState(state), firstMove: null, line: [] };
	memo.set(memoKey, finalResult);
	return finalResult;
}

export function computeHintForState(state, maxDepth = HINT_MAX_DEPTH) {
	const snapshot = cloneStateFrom(state);
	return hintSearch(snapshot, maxDepth, 'player', 'player', new Set(), new Map(), -Infinity, Infinity);
}

export function computeBestMoveForTurn(state, { maxDepth = HINT_MAX_DEPTH, turn = 'cpu', memo = new Map() } = {}) {
	const snapshot = cloneStateFrom(state);
	return hintSearch(snapshot, maxDepth, turn, turn, new Set(), memo, -Infinity, Infinity);
}
