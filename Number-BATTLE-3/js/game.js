// game.js - ゲーム状態と基本操作
// ゲームのコア状態（プレイヤーの手、AI の手、現在のターンなど）と
// それを変更するための純粋な操作群を提供します。
// ロジックはここで行い、UI 表示やアニメーションは別モジュールに委譲します。
export let playerHands = [1, 1]; // プレイヤーの左右の手の指の数
export let aiHands = [1, 1];     // AI の左右の手の指の数
export let currentPlayer = 'player'; // 'player' or 'ai'
export let selectedHand = { owner: null, index: null }; // 選択中の手の情報
export let gameOver = false; // ゲーム終了フラグ
export let isAnimating = false; // アニメーション中フラグ（将来の制御用）
// Simple history stack for undo functionality. Each entry is a snapshot of the public state.
let history = [];

function pushHistory() {
	history.push({
		playerHands: [playerHands[0], playerHands[1]],
		aiHands: [aiHands[0], aiHands[1]],
		currentPlayer,
		selectedHand: { owner: selectedHand.owner, index: selectedHand.index },
		gameOver
	});
	// keep history bounded to avoid unlimited growth
	if (history.length > 100) history.shift();
}

export function canUndo() {
	return history.length > 0;
}

export function undoLastMove() {
	if (history.length === 0) return false;
	const last = history.pop();
	playerHands = [last.playerHands[0], last.playerHands[1]];
	aiHands = [last.aiHands[0], last.aiHands[1]];
	currentPlayer = last.currentPlayer;
	selectedHand = { owner: last.selectedHand.owner, index: last.selectedHand.index };
	gameOver = last.gameOver;
	isAnimating = false;
	return true;
}

/**
 * initState
 * ゲームを初期状態にリセットするユーティリティ関数。
 * - 手の配列を初期値に戻す
 * - ターンと状態フラグを初期化する
 */
export function initState(starter = 'player') {
	playerHands = [1, 1]; // 初期は各手1本
	aiHands = [1, 1];
	// starter は 'player' または 'ai' を受け取る
	currentPlayer = (starter === 'ai') ? 'ai' : 'player';
	selectedHand = { owner: null, index: null }; // 選択解除
	gameOver = false; // ゲーム終了フラグをリセット
	isAnimating = false; // アニメーションフラグリセット
	history = []; // clear history on new game
}

// 外部から現在のターンを明示的に設定したい場合に使えるユーティリティ
export function setCurrentPlayer(p) {
	currentPlayer = (p === 'ai') ? 'ai' : 'player';
}

/**
 * checkWin
 * 現在の手の状態から勝敗を判定する。
 * 成功時は gameOver を true にセットし、結果オブジェクトを返す。
 * 戻り値の形式: { gameOver: boolean, playerLost?: boolean }
 */
export function checkWin() {
	const playerLost = playerHands[0] === 0 && playerHands[1] === 0; // プレイヤー全滅
	const aiLost = aiHands[0] === 0 && aiHands[1] === 0; // AI 全滅

	if (playerLost || aiLost) {
		gameOver = true; // グローバルフラグを立てる
		return { gameOver: true, playerLost };
	}
	return { gameOver: false };
}

/**
 * setSelectedHand
 * ゲーム状態の選択情報を更新するためのセッター。
 * 直接 exported 変数に代入しないよう、ここを経由して更新する。
 */
export function setSelectedHand(owner, index) {
	selectedHand = { owner, index };
}

/**
 * applyAttack
 * 攻撃による手の数の更新を行う。モジュール内の純粋な状態変更ロジック。
 * モジュール外の呼び出し元はアニメーションなどを行い、
 * この関数をコールしてゲーム状態のみを更新すること。
 */
export function applyAttack(fromOwner, attackerIndex, toOwner, targetIndex) {
	// save current state before mutating for undo
	pushHistory();
	if (fromOwner === 'player' && toOwner === 'ai') {
		aiHands[targetIndex] = (playerHands[attackerIndex] + aiHands[targetIndex]) % 5; // 行末コメント: 5 を超えたら 0 へ
	} else if (fromOwner === 'ai' && toOwner === 'player') {
		playerHands[targetIndex] = (aiHands[attackerIndex] + playerHands[targetIndex]) % 5; // 行末コメント: 同上
	}
}

/**
 * applySplit
 * 指の分割操作をゲーム状態に反映する。
 * owner に応じて playerHands または aiHands を更新する。
 */
export function applySplit(owner, val0, val1) {
	// save state for undo
	pushHistory();
	if (owner === 'player') {
		playerHands[0] = val0; // 行末コメント: 左手
		playerHands[1] = val1; // 行末コメント: 右手
	} else {
		aiHands[0] = val0;
		aiHands[1] = val1;
	}
}

/**
 * switchTurnTo
 * 次のターンプレイヤーに切り替えるユーティリティ。
 */
export function switchTurnTo(next) {
	// switching turns does not itself create a new history entry because
	// applyAttack/applySplit already record the state before mutation.
	currentPlayer = next; // 'player' or 'ai'
}

// ヘルパー関数: 合計値と現在の分割状態から、他の可能な分割を計算する
function computePossibleSplits(total, current) {
	const out = [];
	for (let si = 0; si <= total / 2; si++) {
		const sj = total - si;
		if (sj > 4) continue; // 各手の最大値は4
		// 現在の状態（順方向・逆方向）と一致しないものを探す
		const isSameAsCurrent = (si === current[0] && sj === current[1]);
		const isSameAsReversed = (si === current[1] && sj === current[0]);
		if (!isSameAsCurrent && !isSameAsReversed) out.push([si, sj]);
	}
	return out;
}

/**
 * generatePredecessors
 * 与えられた状態から、その状態に至る可能性のある全ての直前の状態（前任者）を生成する。
 * レトログレード分析（テーブルベース生成）のために使用する。
 * @param {object} state - 現在の状態 { playerHands: [p1, p2], aiHands: [a1, a2] }
 * @param {string} currentPlayer - 現在の手番プレイヤー ('player' or 'ai')
 * @returns {Array<object>} 前の状態の配列 [{ state: object, turn: string }]
 */
export function generatePredecessors(state, currentPlayer) {
	const predecessors = [];
	const { playerHands, aiHands } = state;
	const prevPlayer = currentPlayer === 'player' ? 'ai' : 'player';

	// --- 1. 逆攻撃 (Un-attack) の計算 ---
	// prevPlayer が攻撃して currentPlayer の手の状態が変化したと仮定
	const [attackerHands, targetHands, targetOwner] = (prevPlayer === 'player')
		? [playerHands, aiHands, 'ai']
		: [aiHands, playerHands, 'player'];

	for (let i = 0; i < 2; i++) { // attacker's hand index
		if (attackerHands[i] === 0) continue; // 0の手では攻撃できない

		for (let j = 0; j < 2; j++) { // target's hand index
			const originalTargetValue = (targetHands[j] - attackerHands[i] + 5) % 5;
			if (originalTargetValue === 0) continue; // 0の手は攻撃対象にならない

			const prevState = {
				playerHands: [...playerHands],
				aiHands: [...aiHands]
			};

			if (targetOwner === 'player') {
				prevState.playerHands[j] = originalTargetValue;
			} else { // targetOwner === 'ai'
				prevState.aiHands[j] = originalTargetValue;
			}
			predecessors.push({ state: prevState, turn: prevPlayer });
		}
	}

	// --- 2. 逆分割 (Un-split) の計算 ---
	// prevPlayer が分割してこの状態になったと仮定
	const handsToUnsplit = (prevPlayer === 'player') ? playerHands : aiHands;
	const otherHands = (prevPlayer === 'player') ? aiHands : playerHands;
	const total = handsToUnsplit[0] + handsToUnsplit[1];

	if (total > 0 && total <= 8) { // 分割可能な合計値
		const possibleOriginalSplits = computePossibleSplits(total, handsToUnsplit);

		for (const split of possibleOriginalSplits) {
			const prevState = (prevPlayer === 'player')
				? { playerHands: split, aiHands: [...otherHands] }
				: { playerHands: [...otherHands], aiHands: split };
			predecessors.push({ state: prevState, turn: prevPlayer });
		}
	}

	// --- 重複の削除 ---
	// 状態を正規化（ソート）し、キーを作成して重複を判定する
	const uniquePredecessors = [];
	const seen = new Set();
	for (const p of predecessors) {
		// 状態の正規化: 各プレイヤーの手をソートする
		const p_hands = [...p.state.playerHands].sort((a, b) => a - b);
		const a_hands = [...p.state.aiHands].sort((a, b) => a - b);
		// 正規化したキーで重複をチェック
		const key = `${p_hands.join(',')}|${a_hands.join(',')}|${p.turn}`;
		if (!seen.has(key)) {
			seen.add(key);
			// 重複がない場合、元の（ソートされていない）状態を追加
			uniquePredecessors.push(p);
		}
	}

	return uniquePredecessors;
}

/**
 * generateMoves
 * 与えられた状態とプレイヤーから、実行可能なすべての合法手を生成する。
 * @param {object} state - 現在の状態 { playerHands, aiHands }
 * @param {string} player - 現在の手番プレイヤー ('player' or 'ai')
 * @returns {Array<object>} 合法手の配列
 */
export function generateMoves(state, player) {
	// Ensure hands are defined to prevent crashes from unexpected states
	if (!state || !state.playerHands || !state.aiHands) {
		console.error('Invalid state passed to generateMoves:', state);
		return [];
	}

	const moves = [];
	const { playerHands, aiHands } = state;

	if (player === 'ai') {
		// AIの攻撃
		for (let i = 0; i < 2; i++) {
			if (aiHands[i] === 0) continue;
			for (let j = 0; j < 2; j++) {
				if (playerHands[j] === 0) continue;
				moves.push({ type: 'attack', from: 'ai', fromIndex: i, to: 'player', toIndex: j });
			}
		}
		// AIの分割
		const total = aiHands[0] + aiHands[1];
		if (total > 0 && total < 9) {
			const splits = computePossibleSplits(total, aiHands);
			splits.forEach(s => moves.push({ type: 'split', owner: 'ai', values: s }));
		}
	} else { // player === 'player'
		// プレイヤーの攻撃
		for (let i = 0; i < 2; i++) {
			if (playerHands[i] === 0) continue;
			for (let j = 0; j < 2; j++) {
				if (aiHands[j] === 0) continue;
				moves.push({ type: 'attack', from: 'player', fromIndex: i, to: 'ai', toIndex: j });
			}
		}
		// プレイヤーの分割
		const total = playerHands[0] + playerHands[1];
		if (total > 0 && total < 9) {
			const splits = computePossibleSplits(total, playerHands);
			splits.forEach(s => moves.push({ type: 'split', owner: 'player', values: s }));
		}
	}
	return moves;
}
