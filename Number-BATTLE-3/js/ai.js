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

        // helper: choose a loss move that lasts at least minDistance plies when possible
        function chooseLossMoveWithMinDistance(lossArray, minDistance = 11) {
            if (!lossArray || lossArray.length === 0) return null;
            // find candidates with distance >= minDistance
            const candidates = lossArray.filter(x => (typeof x.distance === 'number') && x.distance >= minDistance);
            if (candidates.length > 0) {
                // choose the one with the largest distance among candidates
                candidates.sort((a, b) => b.distance - a.distance);
                return candidates[0].move;
            }
            // fallback: choose the move that maximizes distance (longest survival)
            const sorted = [...lossArray].sort((a, b) => b.distance - a.distance);
            return sorted[0].move;
        }

        // --- 最善手の選択 ---
        let chosenMove;
        const strength = document.getElementById('cpu-strength-select')?.value || 'hard';

        if (strength === 'hard') {
            // 最強モード：常に最善手を選択
            if (bestMoves.WIN.length > 0) {
                bestMoves.WIN.sort((a, b) => a.distance - b.distance);
                chosenMove = bestMoves.WIN[0].move;
            } else if (bestMoves.DRAW.length > 0) {
                chosenMove = bestMoves.DRAW[0].move;
            } else {
                bestMoves.LOSS.sort((a, b) => b.distance - a.distance);
                chosenMove = bestMoves.LOSS[0].move;
            }
        } else {
            // 強いモード：確率でミスをする
            const rand = Math.random();
            if (bestMoves.WIN.length > 0) {
                // 勝てる局面
                // Normal モードのミス確率分布: 勝ちを維持する確率、引き分けを選ぶ確率、誤って負けを選ぶ確率
                const WIN_KEEP = 0.7;
                const DRAW_PROB = 0.2;
                const LOSS_PROB = WIN_KEEP + DRAW_PROB; // 勝てる局面でも負けを選ぶ確率（要求に対応）

                if (rand < WIN_KEEP) {
                    // 最善手(勝ち)
                    bestMoves.WIN.sort((a, b) => a.distance - b.distance);
                    chosenMove = bestMoves.WIN[0].move;
                } else if (rand < WIN_KEEP + DRAW_PROB) {
                    // 引き分けを狙う確率帯
                    if (bestMoves.DRAW.length > 0) {
                        const randomIndex = Math.floor(Math.random() * bestMoves.DRAW.length);
                        chosenMove = bestMoves.DRAW[randomIndex].move;
                    } else if (bestMoves.LOSS.length > 0) {
                        // 引き分け手が無ければ、誤って負けを選ぶ場合のロジックへフォールバック
                        chosenMove = chooseLossMoveWithMinDistance(bestMoves.LOSS, 11);
                    } else {
                        // 最悪の場合は勝ちを選ぶ
                        bestMoves.WIN.sort((a, b) => a.distance - b.distance);
                        chosenMove = bestMoves.WIN[0].move;
                    }
                } else {
                    // 残りの確率帯では誤って負けを選ぶ
                    if (bestMoves.LOSS.length > 0) {
                        chosenMove = chooseLossMoveWithMinDistance(bestMoves.LOSS, 11);
                    } else if (bestMoves.DRAW.length > 0) {
                        const randomIndex = Math.floor(Math.random() * bestMoves.DRAW.length);
                        chosenMove = bestMoves.DRAW[randomIndex].move;
                    } else {
                        bestMoves.WIN.sort((a, b) => a.distance - b.distance);
                        chosenMove = bestMoves.WIN[0].move;
                    }
                }
            } else if (bestMoves.DRAW.length > 0) {
                // 引き分けられる局面
                if (rand < 0.9 || bestMoves.LOSS.length === 0) {
                    // 90%の確率、または負けの手がない場合は次善手(引き分け)
                    const randomIndex = Math.floor(Math.random() * bestMoves.DRAW.length);
                    chosenMove = bestMoves.DRAW[randomIndex].move;
                } else {
                    // 10%の確率で負け筋を選ぶ
                    // 選ぶ場合でも "10手以内に負ける手" は避ける（11手以上で負ける手を優先）
                    chosenMove = chooseLossMoveWithMinDistance(bestMoves.LOSS, 11);
                }
            } else {
                // 負けしかない局面では、最善の抵抗をする
                chosenMove = chooseLossMoveWithMinDistance(bestMoves.LOSS, 11);
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
