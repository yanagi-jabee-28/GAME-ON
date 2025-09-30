import {
	cloneStateFrom,
	hintApplyMove,
	hintResultValue,
	hintStateKeyFrom,
	computeBestMoveForTurn,
	hintEnumerateMoves
} from './ai-core.js';

let currentJobId = 0;
let abortRequested = false;

const MODE_CONFIG = {
	strong: {
		minDepth: 10,
		depthStep: 2,
		maxDepth: 40,
		minThinkMs: 900,
		maxThinkMs: 2600
	},
	hard: {
		minDepth: 6,
		depthStep: 2,
		maxDepth: 20,
		minThinkMs: 500,
		maxThinkMs: 1200
	},
	normal: {
		minDepth: 3,
		depthStep: 2,
		maxDepth: 12,
		minThinkMs: 280,
		maxThinkMs: 650
	},
	weakest: {
		minDepth: 2,
		depthStep: 2,
		maxDepth: 8,
		minThinkMs: 200,
		maxThinkMs: 420
	}
};

const PONDER_MAX_EXTRA_DEPTH = 12;

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function nowMs() {
	return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function penaltyForRepeat(state, move, historyKeys) {
	if (!move || !Array.isArray(historyKeys) || historyKeys.length === 0) return 0;
	const nextState = hintApplyMove(cloneStateFrom(state), 'cpu', move);
	const nextKey = hintStateKeyFrom(nextState, 'player');
	let repeatCount = 0;
	for (const key of historyKeys) {
		if (key === nextKey) repeatCount++;
	}
	return repeatCount * 700;
}

function chooseBestResultForCpu(currentBest, currentValue, currentDepthUsed, candidate, candidateValue, depth) {
	if (!candidate) return { best: currentBest, value: currentValue, depthUsed: currentDepthUsed };
	if (!currentBest || candidateValue > currentValue) {
		return { best: candidate, value: candidateValue, depthUsed: depth };
	}
	return { best: currentBest, value: currentValue, depthUsed: currentDepthUsed };
}

function searchBestCpuMove(jobId, state, config, stateHistoryKeys, {
	turn = 'cpu',
	deadlineMs = Infinity,
	maxDepthOverride,
	minDepthOverride
} = {}) {
	const memo = new Map();
	const start = nowMs();
	let depth = Math.max(config.minDepth, minDepthOverride ?? config.minDepth);
	const maxDepth = Math.max(depth, maxDepthOverride ?? config.maxDepth);
	let bestResult = null;
	let bestValue = -Infinity;
	let depthUsed = depth;
	let lastResult = null;

	while (depth <= maxDepth) {
		if (abortRequested || jobId !== currentJobId) {
			return null;
		}

		const result = computeBestMoveForTurn(state, { maxDepth: depth, turn, memo });
		lastResult = result;
		const penalty = penaltyForRepeat(state, result?.firstMove, stateHistoryKeys);
		const candidateValue = hintResultValue(result) - penalty;
		({ best: bestResult, value: bestValue, depthUsed } = chooseBestResultForCpu(bestResult, bestValue, depthUsed, result, candidateValue, depth));

		if (result && result.outcome === 'win') {
			break;
		}

		const elapsed = nowMs() - start;
		if (elapsed >= deadlineMs) {
			break;
		}

		depth += config.depthStep;
	}

	if (abortRequested || jobId !== currentJobId) {
		return null;
	}

	const elapsedMs = nowMs() - start;
	return {
		result: bestResult || lastResult || null,
		value: bestValue,
		depthUsed,
		elapsedMs
	};
}

async function computeMove(jobId, payload) {
	const { state, mode = 'strong', stateHistoryKeys = [], deadlineBufferMs = 40 } = payload;
	const config = MODE_CONFIG[mode] || MODE_CONFIG.strong;
	const deadlineMs = Math.max(0, (config.maxThinkMs ?? Infinity) - deadlineBufferMs);
	const search = searchBestCpuMove(jobId, state, config, stateHistoryKeys, { deadlineMs });
	if (!search) {
		return;
	}
	let selectedMove = search.result?.firstMove || null;
	if (!selectedMove) {
		const legal = hintEnumerateMoves(state, 'cpu');
		if (legal.length) {
			selectedMove = legal[0];
		}
	}
	const response = {
		jobId,
		mode,
		move: selectedMove,
		result: search.result,
		depthUsed: search.depthUsed,
		elapsedMs: search.elapsedMs,
		minThinkMs: config.minThinkMs,
		maxThinkMs: config.maxThinkMs
	};

	postMessage({ type: 'result', payload: response });
}

async function ponderMoves(jobId, payload) {
	const {
		state,
		mode = 'strong',
		playerMoves = [],
		stateHistoryKeys = [],
		depthOffset = 0,
		timeBudgetMs = 2800
	} = payload || {};
	const config = MODE_CONFIG[mode] || MODE_CONFIG.strong;
	if (!Array.isArray(playerMoves) || playerMoves.length === 0) {
		postMessage({ type: 'ponderResult', payload: { jobId, mode, results: [] } });
		return;
	}
	const maxDepthOverride = clamp(config.maxDepth + depthOffset, config.maxDepth, config.maxDepth + PONDER_MAX_EXTRA_DEPTH);
	const minDepthOverride = clamp(config.minDepth + Math.floor(depthOffset / 2), config.minDepth, maxDepthOverride);
	const results = [];
	const perMoveBudget = Math.max(250, Math.floor((timeBudgetMs || 0) / playerMoves.length));

	for (const move of playerMoves) {
		if (abortRequested || jobId !== currentJobId) {
			return;
		}
		const baseState = cloneStateFrom(state);
		const afterPlayer = hintApplyMove(baseState, 'player', move);
		const cpuStateKey = hintStateKeyFrom(afterPlayer, 'cpu');
		const search = searchBestCpuMove(jobId, afterPlayer, config, stateHistoryKeys.concat(cpuStateKey), {
			turn: 'cpu',
			deadlineMs: perMoveBudget,
			maxDepthOverride,
			minDepthOverride
		});
		if (!search) {
			return;
		}
		const adjustedValue = hintResultValue(search.result) - penaltyForRepeat(afterPlayer, search.result?.firstMove, stateHistoryKeys.concat(cpuStateKey));
		results.push({
			playerMove: move,
			response: search.result,
			adjustedValue,
			stateKey: cpuStateKey,
			depthUsed: search.depthUsed,
			elapsedMs: search.elapsedMs
		});
	}

	postMessage({ type: 'ponderResult', payload: { jobId, mode, results } });
}

self.addEventListener('message', (event) => {
	const { type, payload } = event.data || {};
	if (type === 'computeMove') {
		abortRequested = false;
		const jobId = ++currentJobId;
		computeMove(jobId, payload).catch(err => {
			postMessage({ type: 'error', payload: { jobId, message: err?.message || String(err) } });
		});
	} else if (type === 'ponderMoves') {
		abortRequested = false;
		const jobId = ++currentJobId;
		ponderMoves(jobId, payload).catch(err => {
			postMessage({ type: 'error', payload: { jobId, message: err?.message || String(err) } });
		});
	} else if (type === 'cancel') {
		abortRequested = true;
	} else if (type === 'reset') {
		abortRequested = true;
		currentJobId++;
	}
});
