// ai.js - AI の行動決定
import { aiHands, playerHands, applyAttack, applySplit, switchTurnTo, isAnimating as animFlag } from './game.js';
import { performAiAttackAnim, performAiSplitAnim } from './ui.js';

export function aiTurnWrapper(getState) {
	return new Promise((resolve) => {
		const state = getState();
		if (state.gameOver) return resolve();

		// 1. 勝利できる攻撃があれば実行
		for (let i = 0; i < 2; i++) {
			if (state.aiHands[i] === 0) continue;
			for (let j = 0; j < 2; j++) {
				if (state.playerHands[j] === 0) continue;
				const futurePlayerHand = (state.aiHands[i] + state.playerHands[j]) % 5;
				const otherPlayerHand = state.playerHands[1 - j];
				if (futurePlayerHand === 0 && otherPlayerHand === 0) {
					// 攻撃
					// animate first, then apply state change
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

		// 2. 攻撃または分割を選択
		const availableAiHands = [];
		if (state.aiHands[0] > 0) availableAiHands.push(0);
		if (state.aiHands[1] > 0) availableAiHands.push(1);

		const availablePlayerHands = [];
		if (state.playerHands[0] > 0) availablePlayerHands.push(0);
		if (state.playerHands[1] > 0) availablePlayerHands.push(1);

		const canAttack = availableAiHands.length > 0 && availablePlayerHands.length > 0;
		const canSplit = state.aiHands[0] + state.aiHands[1] > 0;

		if (canAttack && canSplit) {
			if (Math.random() < 0.5) {
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
				// split
				// choose split first, apply immediately, then animate
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
						switchTurnTo('player');
						return resolve();
					}
				}
			}
		} else if (canAttack) {
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
			// perform split choice, apply immediately and animate
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
					switchTurnTo('player');
					return resolve();
				}
			}
		} else {
			switchTurnTo('player');
			return resolve();
		}
	});
}
