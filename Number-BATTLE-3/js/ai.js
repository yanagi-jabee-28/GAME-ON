// ai.js - AI の行動決定
// このモジュールは AI のターンの振る舞いを決定し、アニメーション完了後に
// ゲーム状態を更新してターンを切り替える役割を持ちます。外部からは
// aiTurnWrapper(getState) を呼ぶことで Promise ベースで AI の処理が完了するのを待てます。
import { aiHands, playerHands, applyAttack, applySplit, switchTurnTo, isAnimating as animFlag } from './game.js';
import { performAiAttackAnim, performAiSplitAnim } from './ui.js';

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
		if (state.gameOver) return resolve(); // ゲーム終了なら何もしないで解決

		// 1. 勝利できる攻撃があれば実行（アニメ→状態反映の順）
		for (let i = 0; i < 2; i++) {
			if (state.aiHands[i] === 0) continue; // 空の手は使用不可
			for (let j = 0; j < 2; j++) {
				if (state.playerHands[j] === 0) continue;
				const futurePlayerHand = (state.aiHands[i] + state.playerHands[j]) % 5; // 攻撃後の値
				const otherPlayerHand = state.playerHands[1 - j];
				if (futurePlayerHand === 0 && otherPlayerHand === 0) {
					// 攻撃 - アニメーション後に状態を変更
					performAiAttackAnim(i, j, () => {
						applyAttack('ai', i, 'player', j);
						const res = getState().checkWin();
						if (!res.gameOver) switchTurnTo('player'); // 勝敗がなければプレイヤーへターンを戻す
						return resolve();
					});
					return;
				}
			}
		}

		// 2. 攻撃または分割を選択
		const availableAiHands = [];
		if (state.aiHands[0] > 0) availableAiHands.push(0);
		if (state.aiHands[1] > 0) availableAiHands.push(1);

		const availablePlayerHands = [];
		if (state.playerHands[0] > 0) availablePlayerHands.push(0);
		if (state.playerHands[1] > 0) availablePlayerHands.push(1);

		const canAttack = availableAiHands.length > 0 && availablePlayerHands.length > 0; // 攻撃可能か
		const canSplit = state.aiHands[0] + state.aiHands[1] > 0; // 分割可能か（合計が 0 以外）

		if (canAttack && canSplit) {
			if (Math.random() < 0.5) {
				// ランダムに攻撃を選ぶ
				const aiHandIndex = availableAiHands[Math.floor(Math.random() * availableAiHands.length)];
				const playerHandIndex = availablePlayerHands[Math.floor(Math.random() * availablePlayerHands.length)];
				// animate first, then apply
				performAiAttackAnim(aiHandIndex, playerHandIndex, () => {
					applyAttack('ai', aiHandIndex, 'player', playerHandIndex);
					const res = getState().checkWin();
					if (!res.gameOver) switchTurnTo('player');
					return resolve();
				});
			} else {
				// 分割を選ぶ場合
				{
					const total = state.aiHands[0] + state.aiHands[1];
					const possibleSplits = [];
					for (let si = 0; si <= total / 2; si++) {
						const sj = total - si;
						if (sj > 4) continue; // 4 を超える組み合わせは無効
						const isSameAsCurrent = (si === state.aiHands[0] && sj === state.aiHands[1]);
						const isSameAsReversed = (si === state.aiHands[1] && sj === state.aiHands[0]);
						if (!isSameAsCurrent && !isSameAsReversed) possibleSplits.push([si, sj]);
					}
					if (possibleSplits.length > 0) {
						const selected = possibleSplits[Math.floor(Math.random() * possibleSplits.length)];
						performAiSplitAnim(() => {
							applySplit('ai', selected[0], selected[1]);
							const res = getState().checkWin();
							if (!res.gameOver) switchTurnTo('player');
							return resolve();
						});
					} else {
						// 分割候補が無ければ、まず攻撃で状態を変えられないか試みる
						if (availableAiHands.length > 0 && availablePlayerHands.length > 0) {
							const aiHandIndex = availableAiHands[Math.floor(Math.random() * availableAiHands.length)];
							const playerHandIndex = availablePlayerHands[Math.floor(Math.random() * availablePlayerHands.length)];
							performAiAttackAnim(aiHandIndex, playerHandIndex, () => {
								applyAttack('ai', aiHandIndex, 'player', playerHandIndex);
								const res = getState().checkWin();
								if (!res.gameOver) switchTurnTo('player');
								return resolve();
							});
						} else {
							// それでも行動できない場合は最小の視覚フィードバックを行いターンを返す
							performAiSplitAnim(() => {
								switchTurnTo('player');
								return resolve();
							});
						}
					}
				}
			}
		} else if (canAttack) {
			// 攻撃のみ可能な場合
			const aiHandIndex = availableAiHands[Math.floor(Math.random() * availableAiHands.length)];
			const playerHandIndex = availablePlayerHands[Math.floor(Math.random() * availablePlayerHands.length)];
			// animate then apply
			performAiAttackAnim(aiHandIndex, playerHandIndex, () => {
				applyAttack('ai', aiHandIndex, 'player', playerHandIndex);
				const res = getState().checkWin();
				if (!res.gameOver) switchTurnTo('player');
				return resolve();
			});
		} else if (canSplit) {
			// 分割のみ可能な場合
			{
				const total = state.aiHands[0] + state.aiHands[1];
				const possibleSplits = [];
				for (let si = 0; si <= total / 2; si++) {
					const sj = total - si;
					if (sj > 4) continue;
					const isSameAsCurrent = (si === state.aiHands[0] && sj === state.aiHands[1]);
					const isSameAsReversed = (si === state.aiHands[1] && sj === state.aiHands[0]);
					if (!isSameAsCurrent && !isSameAsReversed) possibleSplits.push([si, sj]);
				}
				if (possibleSplits.length > 0) {
					const selected = possibleSplits[Math.floor(Math.random() * possibleSplits.length)];
					performAiSplitAnim(() => {
						applySplit('ai', selected[0], selected[1]);
						const res = getState().checkWin();
						if (!res.gameOver) switchTurnTo('player');
						return resolve();
					});
				} else {
					// フォールバック: まず攻撃で状態を変えられないか試みる
					if (availableAiHands.length > 0 && availablePlayerHands.length > 0) {
						const aiHandIndex = availableAiHands[Math.floor(Math.random() * availableAiHands.length)];
						const playerHandIndex = availablePlayerHands[Math.floor(Math.random() * availablePlayerHands.length)];
						performAiAttackAnim(aiHandIndex, playerHandIndex, () => {
							applyAttack('ai', aiHandIndex, 'player', playerHandIndex);
							const res = getState().checkWin();
							if (!res.gameOver) switchTurnTo('player');
							return resolve();
						});
					} else {
						// 最終フォールバック: アニメーションを見せてからターンを返す
						performAiSplitAnim(() => {
							switchTurnTo('player');
							return resolve();
						});
					}
				}
			}
		} else {
			// どちらも出来ない場合: ここに来るのは稀（既に敗北/勝利は上で判定されているはず）。
			// それでも到達した場合は最終フォールバックでアニメーションを行いターンを返す。
			performAiSplitAnim(() => {
				switchTurnTo('player');
				return resolve();
			});
		}
	});
}
