// ai.js - AI の行動決定（テーブルベース参照型）
import { applyAttack, applySplit, switchTurnTo } from './game.js';
import { performAiAttackAnim, performAiSplitAnim } from './ui.js';
import { generateMoves } from './game.js';

// --- テーブルベースの読み込み ---
let tablebase = null;
fetch('./chopsticks-tablebase.json')
    .then(response => response.json())
    .then(data => {
        tablebase = data;
        console.log('Tablebase loaded successfully.');
        // Notify other modules that the tablebase is now available so they can recalc hints
        try {
            window.dispatchEvent(new Event('tablebase-loaded'));
        } catch (e) {
            // ignore if window not available (e.g. server-side checks)
        }
    })
    .catch(error => console.error('Error loading tablebase:', error));

// --- 状態管理ヘルパー ---
function normalizeState(state) {
    return {
        playerHands: [...state.playerHands].sort((a, b) => a - b),
        aiHands: [...state.aiHands].sort((a, b) => a - b),
    };
}

function getStateKey(state, turn) {
    const norm = normalizeState(state);
    return `${norm.playerHands.join(',')}|${norm.aiHands.join(',')}|${turn}`;
}

/**
 * aiTurnWrapper
 * テーブルベースを参照してAIの最適な行動を決定し、実行する。
 */
export function aiTurnWrapper(getState) {
    return new Promise((resolve) => {
        const state = getState();
        if (state.gameOver) return resolve();

        // テーブルベースが読み込まれていない場合は待機
        if (!tablebase) {
            console.log('Tablebase not loaded yet, waiting...');
            setTimeout(() => aiTurnWrapper(getState).then(resolve), 500);
            return;
        }

        const moves = generateMoves({ playerHands: state.playerHands, aiHands: state.aiHands }, 'ai');
        if (moves.length === 0) {
            // 打つ手がない場合（通常は発生しないが、念のため）
            performAiSplitAnim(() => { switchTurnTo('player'); resolve(); });
            return;
        }

        // --- 各手の評価 ---
        let bestMoves = { WIN: [], DRAW: [], LOSS: [] };

        for (const move of moves) {
            // 手を適用した後の次の状態をシミュレート
            const nextState = JSON.parse(JSON.stringify({ playerHands: state.playerHands, aiHands: state.aiHands }));
            if (move.type === 'attack') {
                const handsToUpdate = move.to === 'player' ? nextState.playerHands : nextState.aiHands;
                const attackerValue = (move.from === 'player' ? nextState.playerHands : nextState.aiHands)[move.fromIndex];
                handsToUpdate[move.toIndex] = (handsToUpdate[move.toIndex] + attackerValue) % 5;
            } else { // split
                if (move.owner === 'ai') nextState.aiHands = move.values;
            }

            // 次のターンのキーでテーブルを引く（相手のターン）
            const nextTurn = 'player';
            const nextKey = getStateKey(nextState, nextTurn);
            const outcome = tablebase[nextKey];

            // outcome.outcomeは相手から見た結果なので、AIにとっては逆になる
            if (outcome.outcome === 'LOSS') { // 相手が負け = AIの勝ち
                bestMoves.WIN.push({ move, distance: outcome.distance });
            } else if (outcome.outcome === 'DRAW') {
                bestMoves.DRAW.push({ move, distance: -1 });
            } else { // 相手が勝ち = AIの負け
                bestMoves.LOSS.push({ move, distance: outcome.distance });
            }
        }

        // --- selection helper functions (extracted for reuse and for adding new modes) ---
        function pickBestWin(winArray) {
            if (!winArray || winArray.length === 0) return null;
            winArray.sort((a, b) => a.distance - b.distance);
            return winArray[0].move;
        }

        function pickRandomDraw(drawArray) {
            if (!drawArray || drawArray.length === 0) return null;
            const idx = Math.floor(Math.random() * drawArray.length);
            return drawArray[idx].move;
        }

        function pickLossWithMinDistance(lossArray, minDistance = 11) {
            if (!lossArray || lossArray.length === 0) return null;
            const candidates = lossArray.filter(x => (typeof x.distance === 'number') && x.distance >= minDistance);
            if (candidates.length > 0) {
                candidates.sort((a, b) => b.distance - a.distance);
                return candidates[0].move;
            }
            return null;
        }

        function pickLongestLoss(lossArray) {
            if (!lossArray || lossArray.length === 0) return null;
            const sorted = [...lossArray].sort((a, b) => b.distance - a.distance);
            return sorted[0].move;
        }

        // simulate applying a move to a state and return the resulting nextState
        function simulateNextStateForMove(move, baseState) {
            const nextState = JSON.parse(JSON.stringify({ playerHands: baseState.playerHands, aiHands: baseState.aiHands }));
            if (move.type === 'attack') {
                const handsToUpdate = move.to === 'player' ? nextState.playerHands : nextState.aiHands;
                const attackerValue = (move.from === 'player' ? nextState.playerHands : nextState.aiHands)[move.fromIndex];
                handsToUpdate[move.toIndex] = (handsToUpdate[move.toIndex] + attackerValue) % 5;
            } else if (move.type === 'split') {
                if (move.owner === 'ai') nextState.aiHands = [...move.values];
                else nextState.playerHands = [...move.values];
            }
            return nextState;
        }

        // returns array of moves (from original moves list) that allow the player to immediately win on the next turn
        function findMovesAllowingImmediatePlayerWin(allMoves, baseState) {
            const res = [];
            for (const m of allMoves) {
                const ns = simulateNextStateForMove(m, baseState);
                // generate player's possible responses
                const playerResponses = generateMoves({ playerHands: ns.playerHands, aiHands: ns.aiHands }, 'player');
                for (const pm of playerResponses) {
                    const after = simulateNextStateForMove(pm, ns);
                    // check if AI is immediately dead
                    if ((after.aiHands[0] === 0 && after.aiHands[1] === 0)) {
                        res.push(m);
                        break;
                    }
                }
            }
            return res;
        }

        // safety: filter out any candidate move that immediately causes player to lose (avoid this even in weakest)
        function filterOutImmediatePlayerKills(movesList, baseState) {
            return movesList.filter(m => {
                const ns = simulateNextStateForMove(m, baseState);
                // if player immediately loses after this move, drop it
                if (ns.playerHands[0] === 0 && ns.playerHands[1] === 0) return false;
                return true;
            });
        }

        // --- 最善手の選択 ---
        let chosenMove;
        // Ultimate: always use strongest AI
        const strength = 'hard';

        if (strength === 'hard') {
            // 最強モード：常に最善手を選択
            chosenMove = pickBestWin(bestMoves.WIN) || pickRandomDraw(bestMoves.DRAW) || pickLongestLoss(bestMoves.LOSS);
        } else if (strength === 'weak') {
            // 弱いモード：ランダム性が高く、たまに負け手を選ぶが最低限の耐久力を要求する
            // Policy:
            // - 60%: try to pick a non-losing move (WIN > DRAW > LOSS fallback)
            // - 40%: intentionally choose a losing move, but prefer loss moves with distance >= 5
            const r = Math.random();
            if (r < 0.6) {
                chosenMove = pickBestWin(bestMoves.WIN) || pickRandomDraw(bestMoves.DRAW) || pickLongestLoss(bestMoves.LOSS);
            } else {
                // choose a loss move preferring distance >= 5
                const lossChoice = pickLossWithMinDistance(bestMoves.LOSS, 5);
                chosenMove = lossChoice || pickLongestLoss(bestMoves.LOSS) || pickRandomDraw(bestMoves.DRAW) || pickBestWin(bestMoves.WIN);
            }
        } else {
            // 強いモード（normal/strong）: 今までの確率分布を使い、負け手は distance>=11 を優先
            const rand = Math.random();
            if (bestMoves.WIN.length > 0) {
                const WIN_KEEP = 0.7;
                const DRAW_PROB = 0.2;

                if (rand < WIN_KEEP) {
                    chosenMove = pickBestWin(bestMoves.WIN);
                } else if (rand < WIN_KEEP + DRAW_PROB) {
                    chosenMove = pickRandomDraw(bestMoves.DRAW) || pickLossWithMinDistance(bestMoves.LOSS, 11) || pickLongestLoss(bestMoves.LOSS) || pickBestWin(bestMoves.WIN);
                } else {
                    // intentionally pick a loss (rarer)
                    chosenMove = pickLossWithMinDistance(bestMoves.LOSS, 11) || pickRandomDraw(bestMoves.DRAW) || pickLongestLoss(bestMoves.LOSS) || pickBestWin(bestMoves.WIN);
                }
            } else if (bestMoves.DRAW.length > 0) {
                const rand2 = Math.random();
                if (rand2 < 0.9 || bestMoves.LOSS.length === 0) {
                    chosenMove = pickRandomDraw(bestMoves.DRAW);
                } else {
                    chosenMove = pickLossWithMinDistance(bestMoves.LOSS, 11) || pickRandomDraw(bestMoves.DRAW) || pickLongestLoss(bestMoves.LOSS);
                }
            } else {
                chosenMove = pickLossWithMinDistance(bestMoves.LOSS, 11) || pickLongestLoss(bestMoves.LOSS) || pickBestWin(bestMoves.WIN);
            }
        }

        // 新しい 'weakest'（最弱）モード: できるだけ早く負ける手を選ぶ
        if (strength === 'weakest') {
            // Ensure we don't pick a move that immediately kills the player
            const safeMoves = filterOutImmediatePlayerKills(moves, state);

            // Prefer moves that allow the player to immediately win on their next turn
            const movesAllowingImmediatePlayerWin = findMovesAllowingImmediatePlayerWin(safeMoves, state);
            if (movesAllowingImmediatePlayerWin.length > 0) {
                // pick random among those
                const idx = Math.floor(Math.random() * movesAllowingImmediatePlayerWin.length);
                chosenMove = movesAllowingImmediatePlayerWin[idx];
            } else {
                // Fallback: prefer LOSS moves (immediate first), but only from safeMoves
                const lossCandidates = bestMoves.LOSS.filter(l => safeMoves.some(sm => sm.type === l.move.type && JSON.stringify(sm) === JSON.stringify(l.move)));
                if (lossCandidates.length > 0) {
                    const immediate = lossCandidates.filter(x => x.distance === 0);
                    if (immediate.length > 0) {
                        const idx = Math.floor(Math.random() * immediate.length);
                        chosenMove = immediate[idx].move;
                    } else {
                        lossCandidates.sort((a, b) => a.distance - b.distance);
                        chosenMove = lossCandidates[0].move;
                    }
                } else if (bestMoves.DRAW.length > 0) {
                    // pick a safe draw if exists
                    const safeDraws = safeMoves.filter(m => m.type === 'split' || m.type === 'attack').filter(m => bestMoves.DRAW.some(d => JSON.stringify(d.move) === JSON.stringify(m)));
                    if (safeDraws.length > 0) chosenMove = safeDraws[Math.floor(Math.random() * safeDraws.length)];
                    else chosenMove = pickBestWin(bestMoves.WIN);
                } else {
                    chosenMove = pickBestWin(bestMoves.WIN);
                }
            }
        }

        // --- 選択した手を実行 ---
        if (chosenMove.type === 'attack') {
            performAiAttackAnim(chosenMove.fromIndex, chosenMove.toIndex, () => {
                applyAttack('ai', chosenMove.fromIndex, 'player', chosenMove.toIndex);
                const res = getState().checkWin();
                if (!res.gameOver) switchTurnTo('player');
                resolve();
            });
        } else if (chosenMove.type === 'split') {
            performAiSplitAnim(() => {
                applySplit('ai', chosenMove.values[0], chosenMove.values[1]);
                const res = getState().checkWin();
                if (!res.gameOver) switchTurnTo('player');
                resolve();
            });
        }
    });
}

/**
 * getPlayerMovesAnalysis
 * テーブルベースに基づき、プレイヤーの現在の局面で取りうるすべての手の評価を返す。
 * @param {object} state - 現在のゲーム状態
 * @returns {Array|null} 各手の評価結果の配列、またはテーブル未ロードの場合は null
 */
export function getPlayerMovesAnalysis(state) {
    if (!tablebase) return null;

    const moves = generateMoves({ playerHands: state.playerHands, aiHands: state.aiHands }, 'player');
    const analysis = [];

    for (const move of moves) {
        // 手を適用した後の次の状態をシミュレート
        const nextState = JSON.parse(JSON.stringify({ playerHands: state.playerHands, aiHands: state.aiHands }));
        if (move.type === 'attack') {
            const handsToUpdate = move.to === 'ai' ? nextState.aiHands : nextState.playerHands;
            const attackerValue = (move.from === 'player' ? nextState.playerHands : nextState.aiHands)[move.fromIndex];
            handsToUpdate[move.toIndex] = (handsToUpdate[move.toIndex] + attackerValue) % 5;
        } else { // split
            if (move.owner === 'player') nextState.playerHands = move.values;
        }

        // 次のターンのキーでテーブルを引く（AIのターン）
        const nextTurn = 'ai';
        const nextKey = getStateKey(nextState, nextTurn);
        const outcomeInfo = tablebase[nextKey];

        if (!outcomeInfo) continue; // 万が一テーブルにない場合はスキップ

        let playerOutcome;
        // outcomeInfo.outcome はAIから見た結果なので、プレイヤーにとっては逆になる
        if (outcomeInfo.outcome === 'LOSS') {
            playerOutcome = 'WIN';
        } else if (outcomeInfo.outcome === 'WIN') {
            playerOutcome = 'LOSS';
        } else {
            playerOutcome = 'DRAW';
        }

        analysis.push({
            move: move,
            outcome: playerOutcome,
            distance: outcomeInfo.distance
        });
    }
    return analysis;
}

/**
 * getAIMovesAnalysisFromPlayerView
 * AIが次に指せる全手（攻撃/分割）を列挙し、その結果を「プレイヤー視点の勝敗」で評価して返す。
 * manual AI 操作（デバッグ）時のヒント表示に使用する。
 * @param {object} state - 現在のゲーム状態 { playerHands, aiHands }
 * @returns {Array|null} 各手の評価結果の配列（{ move, outcome, distance }）またはテーブル未ロード時 null
 */
export function getAIMovesAnalysisFromPlayerView(state) {
    if (!tablebase) return null;

    const moves = generateMoves({ playerHands: state.playerHands, aiHands: state.aiHands }, 'ai');
    const analysis = [];

    for (const move of moves) {
        // シミュレーション
        const nextState = JSON.parse(JSON.stringify({ playerHands: state.playerHands, aiHands: state.aiHands }));
        if (move.type === 'attack') {
            const handsToUpdate = move.to === 'player' ? nextState.playerHands : nextState.aiHands;
            const attackerValue = (move.from === 'player' ? nextState.playerHands : nextState.aiHands)[move.fromIndex];
            handsToUpdate[move.toIndex] = (handsToUpdate[move.toIndex] + attackerValue) % 5;
        } else if (move.type === 'split') {
            if (move.owner === 'ai') nextState.aiHands = [...move.values];
        }

        // 次はプレイヤーのターン。テーブルは nextTurn 視点の結果を返すので、
        // そのまま「プレイヤー視点の結果」として扱える。
        const nextTurn = 'player';
        const nextKey = getStateKey(nextState, nextTurn);
        const outcomeInfo = tablebase[nextKey];
        if (!outcomeInfo) continue;

        analysis.push({ move, outcome: outcomeInfo.outcome, distance: outcomeInfo.distance });
    }
    return analysis;
}
