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

/**
 * initState
 * ゲームを初期状態にリセットするユーティリティ関数。
 * - 手の配列を初期値に戻す
 * - ターンと状態フラグを初期化する
 */
export function initState() {
	playerHands = [1, 1]; // 初期は各手1本
	aiHands = [1, 1];
	currentPlayer = 'player'; // プレイヤーから開始
	selectedHand = { owner: null, index: null }; // 選択解除
	gameOver = false; // ゲーム終了フラグをリセット
	isAnimating = false; // アニメーションフラグリセット
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
	currentPlayer = next; // 'player' or 'ai'
}
