importScripts('ai-core.js');

let currentJobId = 0;
let abortRequested = false;

const MODE_CONFIG = {
	strong: {
		minDepth: 4,
		depthStep: 2,
		maxDepth: 24,
		minThinkMs: 600,
		maxThinkMs: 1500
	},
	hard: {
		minDepth: 4,
		depthStep: 2,
		maxDepth: 16,
		minThinkMs: 400,
		maxThinkMs: 900
	},
	normal: {
		minDepth: 2,
		depthStep: 2,
		maxDepth: 10,
		minThinkMs: 250,
		maxThinkMs: 600
	},
	weakest: {
		minDepth: 2,
		depthStep: 2,
		maxDepth: 6,
		minThinkMs: 200,
		maxThinkMs: 400
	}
};

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
	return repeatCount * 500;
}

function chooseBestResultForCpu(currentBest, currentValue, candidate, candidateValue, depth) {
	if (!candidate) return { best: currentBest, value: currentValue, depthUsed: depth };
	if (!currentBest) {
		return { best: candidate, value: candidateValue, depthUsed: depth };
	}
	if (candidateValue < currentValue) {
		return { best: candidate, value: candidateValue, depthUsed: depth };
	}
	return { best: currentBest, value: currentValue, depthUsed: depth };
}

async function computeMove(jobId, payload) {
	const { state, mode = 'strong', stateHistoryKeys = [], deadlineBufferMs = 40 } = payload;
	const config = MODE_CONFIG[mode] || MODE_CONFIG.strong;
	const start = nowMs();
	const memo = new Map();
	let depth = config.minDepth;
	let bestResult = null;
	let bestValue = Infinity;
	let depthUsed = depth;
	let lastResult = null;

	while (depth <= config.maxDepth) {
		if (abortRequested || jobId !== currentJobId) {
			return;
		}

		const result = computeBestMoveForTurn(state, { maxDepth: depth, turn: 'cpu', memo });
		lastResult = result;
		const penalty = penaltyForRepeat(state, result?.firstMove, stateHistoryKeys);
		const candidateValue = hintResultValue(result) + penalty;
		({ best: bestResult, value: bestValue, depthUsed } = chooseBestResultForCpu(bestResult, bestValue, result, candidateValue, depth));

		if (result && result.outcome === 'win') {
			break;
		}

		const elapsed = nowMs() - start;
		if (elapsed + deadlineBufferMs >= config.maxThinkMs) {
			break;
		}

		depth += config.depthStep;
	}

	if (abortRequested || jobId !== currentJobId) {
		return;
	}

	const elapsedMs = nowMs() - start;
	const finalResult = bestResult || lastResult || null;
	const response = {
		jobId,
		mode,
		move: finalResult?.firstMove || null,
		result: finalResult,
		depthUsed,
		elapsedMs,
		minThinkMs: config.minThinkMs,
		maxThinkMs: config.maxThinkMs
	};

	postMessage({ type: 'result', payload: response });
}

self.onmessage = (event) => {
	const { type, payload } = event.data || {};
	if (type === 'computeMove') {
		abortRequested = false;
		const jobId = ++currentJobId;
		computeMove(jobId, payload).catch(err => {
			postMessage({ type: 'error', payload: { jobId, message: err?.message || String(err) } });
		});
	} else if (type === 'cancel') {
		abortRequested = true;
	} else if (type === 'reset') {
		abortRequested = true;
		currentJobId++;
	}
};
