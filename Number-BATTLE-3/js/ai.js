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

        // --- 最善手の選択 ---
        let chosenMove;
        if (bestMoves.WIN.length > 0) {
            // 最短手数で勝てる手を選ぶ
            bestMoves.WIN.sort((a, b) => a.distance - b.distance);
            chosenMove = bestMoves.WIN[0].move;
        } else if (bestMoves.DRAW.length > 0) {
            // 引き分けに持ち込む手を選ぶ
            chosenMove = bestMoves.DRAW[0].move;
        } else {
            // 負けるしかない場合、最も手数がかかる（延命できる）手を選ぶ
            bestMoves.LOSS.sort((a, b) => b.distance - a.distance);
            chosenMove = bestMoves.LOSS[0].move;
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
