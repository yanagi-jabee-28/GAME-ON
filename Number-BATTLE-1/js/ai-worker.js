importScripts && importScripts('./utils.js');
// Note: importScripts is used in classic workers, but this environment uses ES modules.
// We'll implement the worker using self.onmessage and re-implement necessary functions inline to avoid module import complexity.

// Minimal reimplementation of helper functions from utils (keep in sync manually)
const isHandDead = (value) => value === 0 || value === 5;
const wrapTo1to5 = (value) => ((value - 1) % 5) + 1;

function cloneSnapshot(state) {
	return {
		player: [...state.player],
		cpu: [...state.cpu]
	};
}

function enumerateAttacks(snapshot, owner, opponent) {
	const HAND_INDEXES = [0, 1];
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
	return [0, 1].filter((i) => !isHandDead(snapshot[owner][i])).reduce((sum, i) => sum + snapshot[owner][i], 0);
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
			if (left === 5 || right === 5) return null;
			return { type: 'split', left, right };
		})
		.filter(Boolean);
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

function terminalEval(snapshot) {
	const playerLost = snapshot.player.every(isHandDead);
	const cpuLost = snapshot.cpu.every(isHandDead);
	if (cpuLost) return -1e6;
	if (playerLost) return 1e6;
	return null;
}

// simplified hintSearch wrapper (we'll implement a depth-limited minimax with memo)
function hintSearch(state, depth, turn, pathSet = new Set(), memo = new Map(), alpha = -Infinity, beta = Infinity) {
	const memoKey = `${state.player[0]},${state.player[1]}|${state.cpu[0]},${state.cpu[1]}|${turn}|${depth}`;
	if (memo.has(memoKey)) return memo.get(memoKey);

	const playerLost = state.player.every(isHandDead);
	const cpuLost = state.cpu.every(isHandDead);
	if (playerLost) return { outcome: 'lose', steps: 0, score: -1e6, firstMove: null };
	if (cpuLost) return { outcome: 'win', steps: 0, score: 1e6, firstMove: null };
	if (depth === 0) return { outcome: 'draw', steps: 0, score: heuristicEvalForState(state), firstMove: null };

	const loopKey = `${state.player[0]},${state.player[1]}|${state.cpu[0]},${state.cpu[1]}|${turn}`;
	if (pathSet.has(loopKey)) return { outcome: 'loop', steps: 0, score: heuristicEvalForState(state), firstMove: null };

	pathSet.add(loopKey);
	const owner = turn;
	const opponent = turn === 'player' ? 'cpu' : 'player';
	const attacks = enumerateAttacks(state, owner, opponent);
	const splits = enumerateSplits(state, owner);
	const moves = [...attacks, ...splits];
	if (!moves.length) {
		pathSet.delete(loopKey);
		return { outcome: turn === 'player' ? 'lose' : 'win', steps: 0, score: turn === 'player' ? -1e6 : 1e6, firstMove: null };
	}

	let best = null;
	if (turn === 'player') {
		let bestValue = -Infinity;
		for (const move of moves) {
			const nextState = applyMove(state, owner, move);
			const child = hintSearch(nextState, depth - 1, opponent, pathSet, memo, alpha, beta);
			const candidate = { outcome: child.outcome, steps: child.steps + 1, score: child.score, firstMove: move };
			const val = (candidate.score ?? 0) - candidate.steps;
			if (val > bestValue) { bestValue = val; best = candidate; }
			alpha = Math.max(alpha, val);
			if (alpha >= beta) break;
		}
	} else {
		let bestValue = Infinity;
		for (const move of moves) {
			const nextState = applyMove(state, owner, move);
			const child = hintSearch(nextState, depth - 1, opponent, pathSet, memo, alpha, beta);
			const candidate = { outcome: child.outcome, steps: child.steps + 1, score: child.score, firstMove: child.firstMove };
			const val = (candidate.score ?? 0) + candidate.steps;
			if (val < bestValue) { bestValue = val; best = candidate; }
			beta = Math.min(beta, val);
			if (beta <= alpha) break;
		}
	}

	pathSet.delete(loopKey);
	memo.set(memoKey, best || { outcome: 'draw', steps: 0, score: heuristicEvalForState(state), firstMove: null });
	return memo.get(memoKey);
}

self.onmessage = function (e) {
	const { id, action, payload } = e.data || {};
	switch (action) {
		case 'hintSearch': {
			const { state, depth, turn } = payload;
			const res = hintSearch(cloneSnapshot(state), depth, turn);
			self.postMessage({ id, result: res });
			break;
		}
		default:
			self.postMessage({ id, error: 'unknown action' });
	}
};
