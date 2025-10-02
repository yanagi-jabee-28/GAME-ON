// ai.js - AI の行動決定
// このモジュールは AI のターンの振る舞いを決定し、アニメーション完了後に
// ゲーム状態を更新してターンを切り替える役割を持ちます。外部からは
// aiTurnWrapper(getState) を呼ぶことで Promise ベースで AI の処理が完了するのを待てます。
import { aiHands, playerHands, applyAttack, applySplit, switchTurnTo } from './game.js';
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

		// 1) 勝利できる攻撃を探す
		for (let i = 0; i < 2; i++) {
			if (state.aiHands[i] === 0) continue;
			for (let j = 0; j < 2; j++) {
				if (state.playerHands[j] === 0) continue;
				const future = (state.aiHands[i] + state.playerHands[j]) % 5;
				const other = state.playerHands[1 - j];
				if (future === 0 && other === 0) {
					performAiAttackAnim(i, j, () => {
						applyAttack('ai', i, 'player', j);
						const res = getState().checkWin();
						if (!res.gameOver) switchTurnTo('player');
						return resolve();
					});
					return;
				}
			}
		}

		const availableAiHands = getAvailableHands(state.aiHands);
		const availablePlayerHands = getAvailableHands(state.playerHands);
		const canAttack = availableAiHands.length > 0 && availablePlayerHands.length > 0;
		const total = state.aiHands[0] + state.aiHands[1];
		const canSplit = total > 0;

		// 決定ロジックをまとめる
		if (canAttack && canSplit) {
			if (Math.random() < 0.5) {
				const aiIndex = randomChoice(availableAiHands);
				const playerIndex = randomChoice(availablePlayerHands);
				performAiAttackAnim(aiIndex, playerIndex, () => {
					applyAttack('ai', aiIndex, 'player', playerIndex);
					const res = getState().checkWin();
					if (!res.gameOver) switchTurnTo('player');
					return resolve();
				});
				return;
			}
			// else: try split
			const possibleSplits = computePossibleSplits(total, state.aiHands);
			if (possibleSplits.length > 0) {
				const selected = randomChoice(possibleSplits);
				performAiSplitAnim(() => {
					applySplit('ai', selected[0], selected[1]);
					const res = getState().checkWin();
					if (!res.gameOver) switchTurnTo('player');
					return resolve();
				});
				return;
			}
			// fallback: attack if possible
			if (canAttack) {
				const aiIndex = randomChoice(availableAiHands);
				const playerIndex = randomChoice(availablePlayerHands);
				performAiAttackAnim(aiIndex, playerIndex, () => {
					applyAttack('ai', aiIndex, 'player', playerIndex);
					const res = getState().checkWin();
					if (!res.gameOver) switchTurnTo('player');
					return resolve();
				});
				return;
			}
			// 最終フォールバック
			performAiSplitAnim(() => {
				switchTurnTo('player');
				return resolve();
			});
			return;
		}

		if (canAttack) {
			const aiIndex = randomChoice(availableAiHands);
			const playerIndex = randomChoice(availablePlayerHands);
			performAiAttackAnim(aiIndex, playerIndex, () => {
				applyAttack('ai', aiIndex, 'player', playerIndex);
				const res = getState().checkWin();
				if (!res.gameOver) switchTurnTo('player');
				return resolve();
			});
			return;
		}

		if (canSplit) {
			const possibleSplits = computePossibleSplits(total, state.aiHands);
			if (possibleSplits.length > 0) {
				const selected = randomChoice(possibleSplits);
				performAiSplitAnim(() => {
					applySplit('ai', selected[0], selected[1]);
					const res = getState().checkWin();
					if (!res.gameOver) switchTurnTo('player');
					return resolve();
				});
				return;
			}
			// fallback to attack
			if (canAttack) {
				const aiIndex = randomChoice(availableAiHands);
				const playerIndex = randomChoice(availablePlayerHands);
				performAiAttackAnim(aiIndex, playerIndex, () => {
					applyAttack('ai', aiIndex, 'player', playerIndex);
					const res = getState().checkWin();
					if (!res.gameOver) switchTurnTo('player');
					return resolve();
				});
				return;
			}
			performAiSplitAnim(() => {
				switchTurnTo('player');
				return resolve();
			});
			return;
		}

		// 最終フォールバック
		performAiSplitAnim(() => {
			switchTurnTo('player');
			return resolve();
		});
	});
}
