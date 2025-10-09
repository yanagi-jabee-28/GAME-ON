import { generateMoves } from './ts/game';
import fs from 'fs';

// --- 定数 ---
const OUTCOME = {
    WIN: 'WIN',
    LOSS: 'LOSS',
    DRAW: 'DRAW',
    UNKNOWN: 'UNKNOWN',
};

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

function applyMove(state, move) {
    const nextState = JSON.parse(JSON.stringify(state));
    if (move.type === 'attack') {
        const handsToUpdate = move.to === 'player' ? nextState.playerHands : nextState.aiHands;
        const attackerValue = (move.from === 'player' ? state.playerHands : state.aiHands)[move.fromIndex];
        handsToUpdate[move.toIndex] = (handsToUpdate[move.toIndex] + attackerValue) % 5;
    } else { // split
        if (move.owner === 'player') nextState.playerHands = move.values;
        else nextState.aiHands = move.values;
    }
    return nextState;
}


// --- メインロジック ---
console.log('Starting final robust retrograde analysis...');

// 1. 全ての可能な状態ノードを生成
const allStates = new Map();
console.log('Generating all state nodes...');
for (let p1 = 0; p1 <= 4; p1++) {
    for (let p2 = p1; p2 <= 4; p2++) {
        for (let a1 = 0; a1 <= 4; a1++) {
            for (let a2 = a1; a2 <= 4; a2++) {
                const state = { playerHands: [p1, p2], aiHands: [a1, a2] };
                ['player', 'ai'].forEach(turn => {
                    const key = getStateKey(state, turn);
                    allStates.set(key, {
                        key: key,
                        state: state,
                        turn: turn,
                        outcome: OUTCOME.UNKNOWN,
                        distance: Infinity,
                        successors: [],
                        predecessors: [],
                        unknown_successors_count: 0,
                    });
                });
            }
        }
    }
}
console.log(`Generated ${allStates.size} total state nodes.`);

// 2. 各ノードの遷移先(successors)と遷移元(predecessors)を計算
console.log('Calculating successors and predecessors for all nodes...');
for (const node of allStates.values()) {
    const moves = generateMoves(node.state, node.turn);
    node.unknown_successors_count = moves.length;

    for (const move of moves) {
        const nextState = applyMove(node.state, move);
        const nextTurn = node.turn === 'player' ? 'ai' : 'player';
        const successorKey = getStateKey(nextState, nextTurn);

        if (allStates.has(successorKey)) {
            const successorNode = allStates.get(successorKey);
            node.successors.push(successorNode);
            successorNode.predecessors.push(node);
        }
    }
}
console.log('Finished calculating transitions.');

// 3. 終局状態を特定し、ワークリストを初期化
console.log('Initializing worklist with terminal states...');
const worklist = [];
for (const node of allStates.values()) {
    const { state, turn } = node;
    const playerLost = state.playerHands[0] === 0 && state.playerHands[1] === 0;
    const aiLost = state.aiHands[0] === 0 && state.aiHands[1] === 0;

    if (playerLost || aiLost) {
        node.distance = 0;
        if (playerLost) {
            // プレイヤーが負けているので、AIから見れば勝ち、プレイヤーから見れば負け
            node.outcome = (turn === 'player') ? OUTCOME.LOSS : OUTCOME.WIN;
        }
        if (aiLost) {
            // AIが負けているので、プレイヤーから見れば勝ち、AIから見れば負け
            node.outcome = (turn === 'ai') ? OUTCOME.LOSS : OUTCOME.WIN;
        }
        worklist.push(node);
    }
}
console.log(`Initialized worklist with ${worklist.length} nodes.`);

// 4. 逆方向に探索してテーブルを埋める
console.log('Propagating outcomes...');
let head = 0;
while (head < worklist.length) {
    const S = worklist[head++];

    if (S.outcome === OUTCOME.LOSS) {
        // このLOSS状態に遷移できる前任者Pは、WINになる
        for (const P of S.predecessors) {
            if (P.outcome === OUTCOME.UNKNOWN) {
                P.outcome = OUTCOME.WIN;
                P.distance = S.distance + 1;
                worklist.push(P);
            }
        }
    } else if (S.outcome === OUTCOME.WIN) {
        // このWIN状態に遷移できる前任者Pは、LOSSに近づく
        for (const P of S.predecessors) {
            if (P.outcome === OUTCOME.UNKNOWN) {
                P.unknown_successors_count--;
                if (P.unknown_successors_count === 0) {
                    // 全ての遷移先がWINなので、PはLOSS
                    P.outcome = OUTCOME.LOSS;
                    // 距離は、遷移先のWINの中で最も手数がかかるもの+1
                    const maxDist = Math.max(...P.successors.map(succ => succ.distance));
                    P.distance = maxDist + 1;
                    worklist.push(P);
                }
            }
        }
    }
}
console.log('Finished outcome propagation.');

// 5. 残ったUNKNOWNをDRAWに設定
console.log('Assigning DRAW to remaining nodes...');
let drawCount = 0;
const finalTable = {};
for (const node of allStates.values()) {
    if (node.outcome === OUTCOME.UNKNOWN) {
        node.outcome = OUTCOME.DRAW;
        node.distance = -1;
        drawCount++;
    }
    finalTable[node.key] = {
        outcome: node.outcome,
        distance: node.distance,
    };
}
console.log(`Found ${drawCount} DRAW states.`);

// 6. 結果をJSONファイルに書き出し
fs.writeFileSync('chopsticks-tablebase.json', JSON.stringify(finalTable, null, 2));

console.log('Final retrograde analysis complete. Tablebase saved to chopsticks-tablebase.json');
