// ai.js - AI の行動決定
// このモジュールは AI のターンの振る舞いを決定し、アニメーション完了後に
// ゲーム状態を更新してターンを切り替える役割を持ちます。外部からは
// aiTurnWrapper(getState) を呼ぶことで Promise ベースで AI の処理が完了するのを待てます。
import { applyAttack, applySplit, switchTurnTo } from './game.js';
import { performAiAttackAnim, performAiSplitAnim } from './ui.js';

function randomChoice(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function getAvailableHands(hands) {
	const res = [];
	if (hands[0] > 0) res.push(0);
	if (hands[1] > 0) res.push(1);
	return res;
}

function computePossibleSplits(total, current) {
	const out = [];
	for (let si = 0; si <= total / 2; si++) {
		const sj = total - si;
		if (sj > 4) continue;
		const isSameAsCurrent = (si === current[0] && sj === current[1]);
		const isSameAsReversed = (si === current[1] && sj === current[0]);
		if (!isSameAsCurrent && !isSameAsReversed) out.push([si, sj]);
	}
	return out;
}

function cloneState(state) {
	return {
		playerHands: [state.playerHands[0], state.playerHands[1]],
		aiHands: [state.aiHands[0], state.aiHands[1]]
	};
}

function checkWinState(state) {
	const playerLost = state.playerHands[0] === 0 && state.playerHands[1] === 0;
	const aiLost = state.aiHands[0] === 0 && state.aiHands[1] === 0;
	return { gameOver: playerLost || aiLost, playerLost, aiLost };
}

function simulateAttack(state, fromOwner, attackerIndex, toOwner, targetIndex) {
	const s = cloneState(state);
	if (fromOwner === 'ai' && toOwner === 'player') {
		s.playerHands[targetIndex] = (s.aiHands[attackerIndex] + s.playerHands[targetIndex]) % 5;
	} else if (fromOwner === 'player' && toOwner === 'ai') {
		s.aiHands[targetIndex] = (s.playerHands[attackerIndex] + s.aiHands[targetIndex]) % 5;
	}
	return s;
}

function simulateSplit(state, owner, val0, val1) {
	const s = cloneState(state);
	if (owner === 'ai') {
		s.aiHands[0] = val0; s.aiHands[1] = val1;
	} else {
		s.playerHands[0] = val0; s.playerHands[1] = val1;
	}
	return s;
}

function evaluateState(state) {
	const win = checkWinState(state);
	if (win.playerLost) return 1_000_000; // AI wins
	if (win.aiLost) return -1_000_000; // AI loses

	const aiActive = (state.aiHands[0] > 0) + (state.aiHands[1] > 0);
	const playerActive = (state.playerHands[0] > 0) + (state.playerHands[1] > 0);
	const aiSum = state.aiHands[0] + state.aiHands[1];
	const playerSum = state.playerHands[0] + state.playerHands[1];

	// Heuristic: prefer more active hands, higher valued hands (especially 4), and reduce opponent options
	const aiHigh = (state.aiHands[0] === 4) + (state.aiHands[1] === 4);
	const playerHigh = (state.playerHands[0] === 4) + (state.playerHands[1] === 4);

	let score = 0;
	score += (aiActive - playerActive) * 200;
	score += (aiSum - playerSum) * 10;
	score += (aiHigh - playerHigh) * 50;

	// Small bonus for balanced hands for flexibility
	const aiBalance = -Math.abs(state.aiHands[0] - state.aiHands[1]);
	const playerBalance = Math.abs(state.playerHands[0] - state.playerHands[1]);
	score += (aiBalance - playerBalance) * 5;

	return score;
}

function generateMovesFor(owner, state) {
	const moves = [];
	if (owner === 'ai') {
		// attacks
		for (let i = 0; i < 2; i++) {
			if (state.aiHands[i] === 0) continue;
			for (let j = 0; j < 2; j++) {
				if (state.playerHands[j] === 0) continue;
				moves.push({ type: 'attack', from: 'ai', aiIndex: i, playerIndex: j });
			}
		}
		// splits
		const total = state.aiHands[0] + state.aiHands[1];
		const splits = computePossibleSplits(total, state.aiHands);
		splits.forEach(s => moves.push({ type: 'split', owner: 'ai', val0: s[0], val1: s[1] }));
	} else {
		for (let i = 0; i < 2; i++) {
			if (state.playerHands[i] === 0) continue;
			for (let j = 0; j < 2; j++) {
				if (state.aiHands[j] === 0) continue;
				moves.push({ type: 'attack', from: 'player', playerIndex: i, aiIndex: j });
			}
		}
		const total = state.playerHands[0] + state.playerHands[1];
		const splits = computePossibleSplits(total, state.playerHands);
		splits.forEach(s => moves.push({ type: 'split', owner: 'player', val0: s[0], val1: s[1] }));
	}
	return moves;
}

// Alpha-Beta pruning with move ordering
function alphaBeta(state, depth, alpha, beta, maximizingPlayer) {
	const win = checkWinState(state);
	if (win.gameOver || depth === 0) return evaluateState(state);

	if (maximizingPlayer) {
		let value = -Infinity;
		let moves = generateMovesFor('ai', state);
		if (moves.length === 0) return evaluateState(state);

		// Move ordering: sort by quick heuristic of resulting state (descending)
		moves.sort((a, b) => {
			const as = (a.type === 'attack') ? simulateAttack(state, 'ai', a.aiIndex, 'player', a.playerIndex) : simulateSplit(state, 'ai', a.val0, a.val1);
			const bs = (b.type === 'attack') ? simulateAttack(state, 'ai', b.aiIndex, 'player', b.playerIndex) : simulateSplit(state, 'ai', b.val0, b.val1);
			return evaluateState(bs) - evaluateState(as);
		});

		for (const m of moves) {
			let ns;
			if (m.type === 'attack') ns = simulateAttack(state, 'ai', m.aiIndex, 'player', m.playerIndex);
			else ns = simulateSplit(state, 'ai', m.val0, m.val1);
			const val = alphaBeta(ns, depth - 1, alpha, beta, false);
			value = Math.max(value, val);
			alpha = Math.max(alpha, value);
			if (alpha >= beta) break; // beta cutoff
		}
		return value;
	} else {
		let value = Infinity;
		let moves = generateMovesFor('player', state);
		if (moves.length === 0) return evaluateState(state);

		// Move ordering for opponent: assume opponent will try to minimize our score
		moves.sort((a, b) => {
			const as = (a.type === 'attack') ? simulateAttack(state, 'player', a.playerIndex, 'ai', a.aiIndex) : simulateSplit(state, 'player', a.val0, a.val1);
			const bs = (b.type === 'attack') ? simulateAttack(state, 'player', b.playerIndex, 'ai', b.aiIndex) : simulateSplit(state, 'player', b.val0, b.val1);
			return evaluateState(as) - evaluateState(bs);
		});

		for (const m of moves) {
			let ns;
			if (m.type === 'attack') ns = simulateAttack(state, 'player', m.playerIndex, 'ai', m.aiIndex);
			else ns = simulateSplit(state, 'player', m.val0, m.val1);
			const val = alphaBeta(ns, depth - 1, alpha, beta, true);
			value = Math.min(value, val);
			beta = Math.min(beta, value);
			if (beta <= alpha) break; // alpha cutoff
		}
		return value;
	}
}

/**
 * aiTurnWrapper
 * 引数 getState は現在のゲーム状態を返す関数（スナップショット取得用）を期待する。
 * 戻り値は Promise で、AI のアニメーションと状態更新が完了したときに解決される。
 * 内部は以下の優先度で行動を決定する:
 *  1) 即時勝利できる攻撃があればそれを行う
 *  2) 攻撃/分割のどちらかをランダムに選択（可能なら）
 *  3) 攻撃のみ/分割のみ可能ならそれを行う
 */
export function aiTurnWrapper(getState) {
	return new Promise((resolve) => {
		const state = getState();
		if (state.gameOver) return resolve();

		// Prepare root state for search
		const rootState = { playerHands: state.playerHands, aiHands: state.aiHands };
		const moves = generateMovesFor('ai', rootState);
		if (moves.length === 0) {
			performAiSplitAnim(() => { switchTurnTo('player'); resolve(); });
			return;
		}

		// Fast check: if any attack immediately wins, do it (highest priority)
		for (const m of moves) {
			if (m.type === 'attack') {
				const ns = simulateAttack(rootState, 'ai', m.aiIndex, 'player', m.playerIndex);
				const w = checkWinState(ns);
				if (w.playerLost && !w.aiLost) {
					// execute winning attack
					performAiAttackAnim(m.aiIndex, m.playerIndex, () => {
						applyAttack('ai', m.aiIndex, 'player', m.playerIndex);
						const res = getState().checkWin();
						if (!res.gameOver) switchTurnTo('player');
						return resolve();
					});
					return;
				}
			}
		}

		// Use alpha-beta search to a modest depth (iterative deepening could be added)
		const SEARCH_DEPTH = 4; // increased depth to look for forcing lines
		let bestVal = -Infinity;
		let bestMoves = [];
		for (const m of moves) {
			let ns;
			if (m.type === 'attack') ns = simulateAttack(rootState, 'ai', m.aiIndex, 'player', m.playerIndex);
			else ns = simulateSplit(rootState, 'ai', m.val0, m.val1);
			const val = alphaBeta(ns, SEARCH_DEPTH - 1, -Infinity, Infinity, false);
			if (val > bestVal) { bestVal = val; bestMoves = [m]; }
			else if (val === bestVal) bestMoves.push(m);
		}

		// tie-break: prefer moves that are attacks (more forcing), prefer moves that create a 4, and prefer splits that produce balanced high options
		function movePriority(m) {
			let p = 0;
			if (m.type === 'attack') p += 1000;
			if (m.type === 'attack') {
				const ns = simulateAttack(rootState, 'ai', m.aiIndex, 'player', m.playerIndex);
				const win = checkWinState(ns);
				if (win.playerLost && !win.aiLost) p += 100000; // immediate win
				// bonus for creating a 4 in any hand
				if (ns.aiHands[0] === 4 || ns.aiHands[1] === 4) p += 200;
			} else if (m.type === 'split') {
				if (m.val0 === 4 || m.val1 === 4) p += 150;
				p += 10 - Math.abs(m.val0 - m.val1); // prefer balanced
			}
			return p;
		}

		bestMoves.sort((a, b) => movePriority(b) - movePriority(a));
		const chosen = bestMoves[0];

		// execute chosen move with animations and actual state updates
		if (chosen.type === 'attack') {
			performAiAttackAnim(chosen.aiIndex, chosen.playerIndex, () => {
				applyAttack('ai', chosen.aiIndex, 'player', chosen.playerIndex);
				const res = getState().checkWin();
				if (!res.gameOver) switchTurnTo('player');
				return resolve();
			});
		} else if (chosen.type === 'split') {
			performAiSplitAnim(() => {
				applySplit('ai', chosen.val0, chosen.val1);
				const res = getState().checkWin();
				if (!res.gameOver) switchTurnTo('player');
				return resolve();
			});
		} else {
			performAiSplitAnim(() => { switchTurnTo('player'); resolve(); });
		}
	});
}
