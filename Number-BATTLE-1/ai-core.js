const HINT_MAX_DEPTH = 15;

const wrapTo1to5 = (value) => ((value - 1) % 5) + 1;

function cloneStateFrom(state) {
	return {
		player: [state.player[0], state.player[1]],
		cpu: [state.cpu[0], state.cpu[1]]
	};
}

function hintStateKeyFrom(state, turn) {
	return JSON.stringify({ player: state.player, cpu: state.cpu, turn });
}

function hintIsDead(value) {
	return value === 0 || value === 5;
}

function hintEnumerateAttacks(state, owner) {
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

function hintSumActive(state, owner) {
	return [0, 1]
		.filter(index => !hintIsDead(state[owner][index]))
		.reduce((sum, index) => sum + state[owner][index], 0);
}

function hintEnumerateSplits(state, owner) {
	const sum = hintSumActive(state, owner);
	if (sum < 2) return [];
	const patterns = new Set();
	for (let left = 0; left <= sum; left++) {
		const right = sum - left;
		if (left <= 5 && right <= 5) {
			patterns.add(`${left},${right}`);
		}
	}
	const normalize = (value) => (value === 5 ? 0 : value);
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

function hintEnumerateMoves(state, owner) {
	const attacks = hintEnumerateAttacks(state, owner);
	const splits = hintEnumerateSplits(state, owner);
	return [...attacks, ...splits];
}

function hintApplyMove(state, owner, move) {
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

function heuristicEvalForState(state) {
	const playerAlive = state.player.filter(value => !hintIsDead(value));
	const cpuAlive = state.cpu.filter(value => !hintIsDead(value));
	if (cpuAlive.length === 0) return 1e6;
	if (playerAlive.length === 0) return -1e6;
	let score = 0;
	score += (2 - cpuAlive.length) * 1000;
	score -= (2 - playerAlive.length) * 1000;
	let cpuHandScore = 0;
	cpuAlive.forEach(hand => {
		cpuHandScore += hand === 4 ? 150 : hand * 10;
	});
	score -= cpuHandScore;
	let playerHandScore = 0;
	playerAlive.forEach(hand => {
		playerHandScore += hand === 4 ? 120 : hand * 5;
	});
	score += playerHandScore;
	const playerSum = playerAlive.reduce((a, b) => a + b, 0);
	if (playerSum > 5) {
		score -= (playerSum - 5) * 20;
	}
	return score;
}

function hintResultValue(result) {
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

function hintSearch(state, depth, turn, rootTurn, pathSet, memo, alpha, beta) {
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

	for (const move of moves) {
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

function computeHintForState(state, maxDepth = HINT_MAX_DEPTH) {
	const snapshot = cloneStateFrom(state);
	return hintSearch(snapshot, maxDepth, 'player', 'player', new Set(), new Map(), -Infinity, Infinity);
}

function computeBestMoveForTurn(state, { maxDepth = HINT_MAX_DEPTH, turn = 'cpu', memo = new Map() } = {}) {
	const snapshot = cloneStateFrom(state);
	return hintSearch(snapshot, maxDepth, turn, turn, new Set(), memo, -Infinity, Infinity);
}

if (typeof self !== 'undefined') {
	self.HINT_MAX_DEPTH = HINT_MAX_DEPTH;
	self.wrapTo1to5 = wrapTo1to5;
	self.cloneStateFrom = cloneStateFrom;
	self.hintStateKeyFrom = hintStateKeyFrom;
	self.hintIsDead = hintIsDead;
	self.hintEnumerateAttacks = hintEnumerateAttacks;
	self.hintSumActive = hintSumActive;
	self.hintEnumerateSplits = hintEnumerateSplits;
	self.hintEnumerateMoves = hintEnumerateMoves;
	self.hintApplyMove = hintApplyMove;
	self.heuristicEvalForState = heuristicEvalForState;
	self.hintResultValue = hintResultValue;
	self.hintSearch = hintSearch;
	self.computeHintForState = computeHintForState;
	self.computeBestMoveForTurn = computeBestMoveForTurn;
}
