import { HINT_MAX_DEPTH } from './constants.js';
import { cloneSnapshot, isHandDead, makeStateKey, wrapTo1to5 } from './utils.js';

const HAND_INDEXES = [0, 1];

// simple array pools to reduce short-lived allocations
const _movesPool = [];
function _acquireMovesArray() {
	return _movesPool.pop() || [];
}
function _releaseMovesArray(arr) {
	arr.length = 0;
	_movesPool.push(arr);
}

function enumerateAttacks(snapshot, owner, opponent) {
	const moves = _acquireMovesArray();
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

	const out = _acquireMovesArray();
	for (const pattern of patterns) {
		if (pattern === current || pattern === swapped) continue;
		const [left, right] = pattern.split(',').map(Number);
		if (left === 5 || right === 5) continue;
		out.push({ type: 'split', left, right });
	}
	return out;
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
	const playerScore = snapshot.player.reduce((sum, hand) => sum + (isHandDead(hand) ? 0 : hand), 0);
	const cpuScore = snapshot.cpu.reduce((sum, hand) => sum + (isHandDead(hand) ? 0 : hand), 0);

	if (cpuLost) return -1e6 + playerScore - cpuScore; // 勝利スコアに差分を加味
	if (playerLost) return 1e6 + cpuScore - playerScore; // 敗北スコアに差分を加味

	return cpuScore - playerScore; // 中間スコアを返却
}

// Pattern-based bonus to encourage creation of known strong/forcing shapes.
function patternBonus(snapshot) {
	// positive means good for CPU
	const cpu = snapshot.cpu;
	const player = snapshot.player;
	const cpuAlive = cpu.filter((v) => !isHandDead(v));
	const playerAlive = player.filter((v) => !isHandDead(v));
	let bonus = 0;

	// If CPU has 4 on one hand and player has a 1 on any hand -> near immediate winning potential
	if ((cpu[0] === 4 || cpu[1] === 4) && (player.includes(1))) {
		bonus += 10000; // Reduced from 20000 to balance other factors
	}

	// If CPU has symmetric flexible shapes (2,2) or (3,3) give modest bonus
	if ((cpu[0] === 2 && cpu[1] === 2) || (cpu[0] === 3 && cpu[1] === 3)) {
		bonus += 300;
	}

	// If CPU has one dead hand (0) but the other is >=3, it's often strong (can force splits)
	if ((cpu[0] === 0 && cpu[1] >= 3) || (cpu[1] === 0 && cpu[0] >= 3)) {
		bonus += 800;
	}

	// Penalize CPU states where both hands are weak
	if (cpuAlive.length === 2 && cpu[0] + cpu[1] <= 3) bonus -= 500; // Increased penalty for weak states

	// Add penalty for predictable patterns
	if (playerAlive.length === 2 && player[0] === player[1]) {
		bonus -= 300; // Penalize symmetric player hands
	}

	return bonus;
}

// quick forced-win detection using hintSearch (shallow). returns true if `owner` can force win within depth plies
function isForcedWin(snapshot, owner, depth) {
	try {
		const buf = { player: [0, 0], cpu: [0, 0] };
		const res = hintSearch(cloneSnapshot(snapshot, buf), depth, owner, new Set(), new Map(), -Infinity, Infinity);
		return res && res.outcome === 'win';
	} catch (e) {
		return false;
	}
}

function minimax(snapshot, depth, isMaximizingPlayer, alpha, beta) {
	const terminal = terminalEval(snapshot);
	if (terminal !== null) {
		return terminal - depth;
	}
	if (depth === 0) {
		return heuristicEval(snapshot);
	}

	const owner = isMaximizingPlayer ? 'cpu' : 'player';
	const { attacks, splits } = enumerateMoves(snapshot, owner);
	const moves = attacks.concat(splits);

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
		// release temporary arrays
		_releaseMovesArray(attacks);
		_releaseMovesArray(splits);
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
	_releaseMovesArray(attacks);
	_releaseMovesArray(splits);
	return minEval;
}

function chooseCpuMoveWithDepth(snapshot, depth, options, historyKeys) {
	const { avoidRepeatsFirst = false, repeatPenalty = 0, optimization = 'max' } = options || {};
	let { attacks, splits } = enumerateMoves(snapshot, 'cpu');
	let candidates = attacks.concat(splits);
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

	const tempBuf = { player: [0, 0], cpu: [0, 0] };
	for (const move of candidates) {
		// produce nextSnapshot into tempBuf to avoid allocation
		tempBuf.player[0] = snapshot.player[0];
		tempBuf.player[1] = snapshot.player[1];
		tempBuf.cpu[0] = snapshot.cpu[0];
		tempBuf.cpu[1] = snapshot.cpu[1];
		if (move.type === 'attack') {
			const opponent = 'player';
			tempBuf[opponent][move.dst] = wrapTo1to5(tempBuf['cpu'][move.src] + tempBuf[opponent][move.dst]);
		} else if (move.type === 'split') {
			tempBuf['cpu'][0] = move.left;
			tempBuf['cpu'][1] = move.right;
		}
		const nextSnapshot = tempBuf;
		// If this move immediately makes the player lose, take it right away.
		const terminal = terminalEval(nextSnapshot);
		if (terminal === 1e6) {
			return move;
		}
		// If this move forces a win within a few plies, prefer it immediately
		if (isForcedWin(nextSnapshot, 'cpu', 4)) return move;
		let value = minimax(nextSnapshot, depth - 1, false, -Infinity, Infinity);
		// apply pattern bonus to candidate evaluation
		value += patternBonus(nextSnapshot);

		// Adjust attack value to prevent over-prioritization
		if (move.type === 'attack') {
			value = value / 2; // Reduce attack value to balance with splits
		}

		// Define splitBonus to avoid ReferenceError
		const splitBonus = (move.left === move.right) ? 1000 : 800; // Higher bonus for symmetric splits
		// Increase split value for better balance
		if (move.type === 'split') {
			value += splitBonus;
		}

		// Normalize split and attack values to prevent extreme differences
		if (move.type === 'split') {
			const earlyGamePenalty = (snapshot.cpu[0] + snapshot.cpu[1] <= 3) ? 800 : 0; // Penalize early splits more
			value = Math.min(value, 1200) - earlyGamePenalty; // Reduce max split value
		}

		if (move.type === 'attack') {
			const attackBonus = (move.newValue >= 3) ? 300 : 0; // Reward attacks that create strong positions
			value = Math.min(value, 1800) + attackBonus; // Increase max attack value
		}

		// Debugging logs for move evaluation
		console.log(`Evaluating move:`, move);
		console.log(`Move type: ${move.type}, Value: ${value}`);
		console.log(`Current best move: ${bestMove}, Best value: ${bestValue}`);

		// Prioritize winning moves
		if (terminalEval(nextSnapshot) === 1e6) {
			value += 5000; // Assign a high value to winning moves
		}

		// Avoid losing moves
		if (terminalEval(nextSnapshot) === -1e6) {
			value -= 5000; // Assign a low value to losing moves
		}

		// Compare attack and split values
		if (value > bestValue) {
			bestValue = value;
			bestMove = move;
		}
	}

	return bestMove;
}

function chooseCpuMoveRandom(snapshot) {
	const { attacks, splits } = enumerateMoves(snapshot, 'cpu');
	const candidates = attacks.concat(splits).filter((move) => {
		const next = applyMove(snapshot, 'cpu', move);
		return next.player.some((value, index) => value !== snapshot.player[index]) ||
			next.cpu.some((value, index) => value !== snapshot.cpu[index]);
	});
	if (candidates.length === 0) return null;
	const randomIndex = Math.floor(Math.random() * candidates.length);
	_releaseMovesArray(attacks);
	_releaseMovesArray(splits);
	return candidates[randomIndex];
}

function chooseCpuMoveNormal(snapshot, historyKeys) {
	const { attacks, splits } = enumerateMoves(snapshot, 'cpu');
	const candidates = attacks.concat(splits);
	if (candidates.length === 0) return null;

	let bestMove = candidates[0] || null;
	let bestValue = -Infinity;
	const depth = 1;

	for (const move of candidates) {
		const next = applyMove(snapshot, 'cpu', move);
		// immediate win shortcut
		if (terminalEval(next) === 1e6) return move;
		if (isForcedWin(next, 'cpu', 3)) return move;
		let value = minimax(next, depth - 1, false, -Infinity, Infinity);
		value += patternBonus(next);
		const key = makeStateKey(next, 'player');
		const recentCount = historyKeys.filter((s) => s === key).length;
		if (recentCount > 0) value -= recentCount * 50;
		if (value > bestValue) {
			bestValue = value;
			bestMove = move;
		}
	}
	_releaseMovesArray(attacks);
	_releaseMovesArray(splits);
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
	const moves = attacks.concat(splits);
	if (!moves.length) {
		pathSet.delete(loopKey);
		const terminalResult = {
			outcome: turn === 'player' ? 'lose' : 'win',
			steps: 0,
			score: turn === 'player' ? -1e6 : 1e6,
			firstMove: null
		};
		memo.set(memoKey, terminalResult);
		_releaseMovesArray(attacks);
		_releaseMovesArray(splits);
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

	// release pooled arrays used for enumeration
	_releaseMovesArray(attacks);
	_releaseMovesArray(splits);

	return finalResult;
}

function analyzeWinningMoves(snapshot, depth, isCpuTurn) {
	if (depth === 0) return null;

	const terminalScore = terminalEval(snapshot);
	if (terminalScore !== null) return { score: terminalScore, move: null };

	const owner = isCpuTurn ? 'cpu' : 'player';
	const moves = enumerateMoves(snapshot, owner);
	let bestMove = null;
	let bestScore = isCpuTurn ? -Infinity : Infinity;

	for (const moveType in moves) {
		for (const move of moves[moveType]) {
			const nextSnapshot = applyMove(snapshot, owner, move);
			const result = analyzeWinningMoves(nextSnapshot, depth - 1, !isCpuTurn);
			const score = result ? result.score : heuristicEval(nextSnapshot);

			if (isCpuTurn ? score > bestScore : score < bestScore) {
				bestScore = score;
				bestMove = move;
			}
		}
	}

	return { score: bestScore, move: bestMove };
}

function findBestMove(snapshot) {
	const depth = 10; // 最大10手先まで分析
	const result = analyzeWinningMoves(snapshot, depth, true);
	return result ? result.move : null;
}

function findWinningMoveWithinDepth(snapshot, maxDepth) {
	function recursiveSearch(snapshot, depth, isCpuTurn) {
		if (depth === 0) return null;

		const terminalScore = terminalEval(snapshot);
		if (terminalScore !== null) {
			return terminalScore > 0 ? { score: terminalScore, move: null } : null;
		}

		const owner = isCpuTurn ? 'cpu' : 'player';
		const moves = enumerateMoves(snapshot, owner);
		for (const moveType in moves) {
			for (const move of moves[moveType]) {
				const nextSnapshot = applyMove(snapshot, owner, move);
				const result = recursiveSearch(nextSnapshot, depth - 1, !isCpuTurn);
				if (isCpuTurn && result && result.score > 0) {
					return { score: result.score, move };
				}
			}
		}
		return null;
	}

	return recursiveSearch(snapshot, maxDepth, true);
}

function avoidLosingMoves(snapshot) {
	const moves = enumerateMoves(snapshot, 'cpu');
	let safeMove = null;

	for (const moveType in moves) {
		for (const move of moves[moveType]) {
			const nextSnapshot = applyMove(snapshot, 'cpu', move);
			const result = terminalEval(nextSnapshot);
			if (result === -1e6) continue; // 負ける手をスキップ
			safeMove = move; // 安全な手を記録
		}
	}
	return safeMove;
}

function findOptimalMove(snapshot) {
	const winningMove = findWinningMoveWithinDepth(snapshot, 3);
	if (winningMove) return winningMove.move;

	return avoidLosingMoves(snapshot);
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

	// Worker-backed hint computation
	let _hintWorker = null;
	let _hintRequestId = 0;
	const _pendingHints = new Map();

	try {
		_hintWorker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
		_hintWorker.onmessage = (e) => {
			const { id, result, error } = e.data || {};
			const resolver = _pendingHints.get(id);
			if (!resolver) return;
			// clear timeout if set
			if (resolver.timeoutId) clearTimeout(resolver.timeoutId);
			_pendingHints.delete(id);
			if (error) resolver.reject(new Error(error));
			else resolver.resolve(result);
		};
	} catch (e) {
		_hintWorker = null;
	}

	async function computeHint(snapshot) {
		const snapshotClone = cloneSnapshot(snapshot);
		// quick local forced-win check to avoid worker roundtrip
		if (isForcedWin(snapshotClone, 'player', Math.min(6, hintDepth))) {
			// do a shallow local check and return quickly
			return hintSearch(snapshotClone, hintDepth, 'player', new Set(), new Map(), -Infinity, Infinity);
		}
		if (!_hintWorker) {
			return hintSearch(snapshotClone, hintDepth, 'player', new Set(), new Map(), -Infinity, Infinity);
		}
		const id = ++_hintRequestId;
		const payload = { state: snapshotClone, depth: hintDepth, turn: 'player' };
		const promise = new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				if (_pendingHints.has(id)) {
					_pendingHints.delete(id);
					// fallback: run local hintSearch to provide a best-effort result
					try {
						const fallback = hintSearch(snapshotClone, hintDepth, 'player', new Set(), new Map(), -Infinity, Infinity);
						resolve(fallback);
					} catch (err) {
						reject(new Error('hint timeout'));
					}
				}
			}, 8000);
			_pendingHints.set(id, { resolve, reject, timeoutId });
			try {
				_hintWorker.postMessage({ id, action: 'hintSearch', payload });
			} catch (err) {
				// if postMessage fails, clear pending and fallback immediately
				clearTimeout(timeoutId);
				_pendingHints.delete(id);
				try {
					const fallback = hintSearch(snapshotClone, hintDepth, 'player', new Set(), new Map(), -Infinity, Infinity);
					resolve(fallback);
				} catch (inner) {
					reject(inner);
				}
			}
		});
		return promise;
	}

	return {
		chooseCpuMove,
		computeHint,
		// quick shallow hint for immediate UI feedback
		peekHint: (snapshot) => {
			try {
				// very shallow depth for responsiveness
				return hintSearch(cloneSnapshot(snapshot), Math.min(2, hintDepth), 'player', new Set(), new Map(), -Infinity, Infinity);
			} catch (e) {
				return null;
			}
		},
		cloneSnapshot,
		applyMove,
		enumerateMoves
	};
}

function findWinningMoveOnMistake(snapshot) {
	const moves = enumerateMoves(snapshot, 'cpu');
	for (const moveType in moves) {
		for (const move of moves[moveType]) {
			const nextSnapshot = applyMove(snapshot, 'cpu', move);
			if (terminalEval(nextSnapshot) === 1e6) {
				return move; // 勝利を確定させる手を返す
			}
		}
	}
	return null; // 勝利を確定させる手がない場合
}

function provideHint(snapshot) {
	let bestHint = findBestMove(snapshot);
	console.log("Initial Hint:", bestHint);

	// 非同期でより良いヒントを探索
	setTimeout(() => {
		const detailedHint = findOptimalMove(snapshot);
		if (detailedHint && detailedHint !== bestHint) {
			bestHint = detailedHint;
			console.log("Updated Hint:", bestHint);
		}
	}, 1000);

	return bestHint;
}

function enhancedHeuristicEval(snapshot) {
	const baseScore = heuristicEval(snapshot);

	// 分配アクションの制約条件を考慮した評価
	const playerHands = snapshot.player;
	const cpuHands = snapshot.cpu;

	// 相手を不利な数値状態に追い込むボーナス
	let strategicBonus = 0;
	if (cpuHands.includes(4) && playerHands.includes(1)) {
		strategicBonus += 5000; // 即勝利に近い状態
	}

	// 自明な分配の禁止を考慮したペナルティ
	if (cpuHands[0] === cpuHands[1] && cpuHands[0] !== 0) {
		strategicBonus -= 100; // 対称状態は避ける
	}

	return baseScore + strategicBonus;
}

function evaluateCriticalStates(snapshot) {
	const playerHands = snapshot.player;
	const cpuHands = snapshot.cpu;

	// 必敗形を避けるロジック
	if (cpuHands.includes(4) && playerHands.some((hand) => hand > 0)) {
		return { avoid: true, reason: 'Avoid critical state: 〈4, X〉' };
	}
	if (cpuHands[0] === 1 && cpuHands[1] === 0) {
		return { avoid: true, reason: 'Avoid critical state: 〈1, 0〉' };
	}

	// 相手を詰み状態に誘導するロジック
	if (playerHands[0] === 4 || playerHands[1] === 4) {
		return { induce: true, reason: 'Induce critical state: 〈4, X〉' };
	}

	return { avoid: false, induce: false };
}

function findStrategicMove(snapshot) {
	const moves = enumerateMoves(snapshot, 'cpu');
	let bestMove = null;
	let bestEvaluation = -Infinity;

	for (const moveType in moves) {
		for (const move of moves[moveType]) {
			const nextSnapshot = applyMove(snapshot, 'cpu', move);
			const evaluation = evaluateCriticalStates(nextSnapshot);

			if (evaluation.avoid) continue; // 必敗形を避ける
			if (evaluation.induce) return move; // 詰み状態に誘導する手を即選択

			const score = heuristicEval(nextSnapshot);
			if (score > bestEvaluation) {
				bestEvaluation = score;
				bestMove = move;
			}
		}
	}

	return bestMove;
}

function provideAdvancedHint(snapshot) {
	let bestHint = null;
	let bestScore = -Infinity;

	const moves = enumerateMoves(snapshot, 'cpu');
	for (const moveType in moves) {
		for (const move of moves[moveType]) {
			const nextSnapshot = applyMove(snapshot, 'cpu', move);
			const score = minimax(nextSnapshot, 3, false, -Infinity, Infinity);

			if (score > bestScore) {
				bestScore = score;
				bestHint = move;
			}
		}
	}

	console.log("Advanced Hint:", bestHint);
	return bestHint;
}

function detectLosingPattern(snapshot) {
	// 負けパターンの例: 0,1 の状態
	const playerHands = snapshot.player;
	if ((playerHands[0] === 0 && playerHands[1] === 1) || (playerHands[0] === 1 && playerHands[1] === 0)) {
		return true;
	}
	return false;
}

function chooseCpuMoveAvoidingLoss(snapshot, historyKeys) {
	const { attacks, splits } = enumerateMoves(snapshot, 'cpu');
	const candidates = attacks.concat(splits);
	if (candidates.length === 0) return null;

	let bestMove = null;
	let bestValue = -Infinity;

	for (const move of candidates) {
		const next = applyMove(snapshot, 'cpu', move);
		if (detectLosingPattern(next)) {
			continue; // 負けパターンに繋がる手をスキップ
		}

		const value = minimax(next, 2, false, -Infinity, Infinity);
		if (value > bestValue) {
			bestValue = value;
			bestMove = move;
		}
	}

	return bestMove;
}

function provideHintImproved(snapshot, historyKeys) {
	const hint = chooseCpuMoveAvoidingLoss(snapshot, historyKeys);
	console.log("Improved Hint:", hint);
	return hint;
}

function preventCriticalState(snapshot) {
	const cpuHands = snapshot.cpu;
	const playerHands = snapshot.player;

	// CPUが「4」の手を作るのを防ぐ
	if (cpuHands.includes(4)) {
		return { prevent: true, reason: 'Prevent CPU from creating a critical hand with value 4' };
	}

	// プレイヤーが「X」の手に追い込まれるのを防ぐ
	if (playerHands.includes(1) && cpuHands.includes(4)) {
		return { prevent: true, reason: 'Avoid player hand being eliminated by CPU hand with value 4' };
	}

	return { prevent: false };
}

function chooseCpuMoveWithPrevention(snapshot, historyKeys) {
	const { attacks, splits } = enumerateMoves(snapshot, 'cpu');
	const candidates = attacks.concat(splits);
	if (candidates.length === 0) return null;

	let bestMove = null;
	let bestValue = -Infinity;

	for (const move of candidates) {
		const next = applyMove(snapshot, 'cpu', move);
		const prevention = preventCriticalState(next);
		if (prevention.prevent) {
			continue; // クリティカルな状態を防ぐため、この手をスキップ
		}

		const value = minimax(next, 2, false, -Infinity, Infinity);
		if (value > bestValue) {
			bestValue = value;
			bestMove = move;
		}
	}

	return bestMove;
}

function provideHintWithPrevention(snapshot, historyKeys) {
	const hint = chooseCpuMoveWithPrevention(snapshot, historyKeys);
	console.log("Hint with Prevention:", hint);
	return hint;
}
