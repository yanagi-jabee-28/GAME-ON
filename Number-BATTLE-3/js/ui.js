// ui.js - DOM/アニメーション/表示更新
// UI の役割:
//  - DOM 要素のキャッシュ
//  - 盤面の描画更新（数値・disabled 表示など）
//  - アニメーションの補助（攻撃エフェクト、分割エフェクト）
// 注意: UI はゲーム状態を直接変更しない（状態変更は `game.js` が担当）。
import { playerHands, aiHands, initState, applyAttack, applySplit, checkWin, switchTurnTo } from './game.js';

let playerHandElements; // プレイヤーの手を表す DOM 要素配列
let aiHandElements;     // AI の手を表す DOM 要素配列
let messageEl;          // メッセージ表示要素
let splitBtnEl;         // 分割ボタン要素
let restartBtnEl;       // 再スタートボタン要素
let splitModalEl;       // 分割モーダル要素
let splitTotalEl;       // モーダル内の合計表示要素
let splitOptionsContainer; // 分割候補ボタンを入れるコンテナ
let undoBtnEl; // 戻すボタン要素
let hintAreaEl; // ヒント表示エリア要素

export function cacheDom() {
	// DOM 要素を一度だけ取得してキャッシュする（頻繁な DOM アクセスを避けるため）
	playerHandElements = [document.getElementById('player-hand-0'), document.getElementById('player-hand-1')];
	aiHandElements = [document.getElementById('ai-hand-0'), document.getElementById('ai-hand-1')];
	messageEl = document.getElementById('message');
	splitBtnEl = document.getElementById('split-btn');
	restartBtnEl = document.getElementById('restart-btn');
	splitModalEl = document.getElementById('split-modal');
	splitTotalEl = document.getElementById('split-total');
	splitOptionsContainer = document.getElementById('split-options');
	undoBtnEl = document.getElementById('undo-btn');
	hintAreaEl = document.getElementById('hint-area');

	// Allow clicking on the modal overlay to close the modal (click outside content)
	if (splitModalEl) {
		splitModalEl.addEventListener('click', (e) => {
			if (e.target === splitModalEl) closeSplitModal();
		});
	}
}

export function displayPlayerHints(analysis) {
    if (!hintAreaEl) return;
    if (!analysis) {
        hintAreaEl.textContent = 'ヒントを計算中...';
        return;
    }

    const winMoves = analysis.filter(a => a.outcome === 'WIN');
    const drawMoves = analysis.filter(a => a.outcome === 'DRAW');
    
    let bestMove;
    let outcomeText;
    let outcomeColorClass;

    if (winMoves.length > 0) {
        winMoves.sort((a, b) => a.distance - b.distance);
        bestMove = winMoves[0];
        outcomeText = `${bestMove.distance}手で勝ち`;
        outcomeColorClass = 'text-green-600';
    } else if (drawMoves.length > 0) {
        bestMove = drawMoves[0]; // どの引き分け手でも良い
        outcomeText = '引き分け';
        outcomeColorClass = 'text-blue-600';
    } else if (analysis.length > 0) {
        analysis.sort((a, b) => b.distance - a.distance); // 最も長く粘れる手
        bestMove = analysis[0];
        outcomeText = `${bestMove.distance}手で負け`;
        outcomeColorClass = 'text-red-600';
    } else {
        hintAreaEl.innerHTML = ''; // 手がない場合
        return;
    }

    // moveオブジェクトを人間可読な文字列に変換する
    let actionText = '';
    if (bestMove.move.type === 'attack') {
        const fromHand = bestMove.move.fromIndex === 0 ? '左手' : '右手';
        const toHand = bestMove.move.toIndex === 0 ? '相手の左手' : '相手の右手';
        actionText = `(${fromHand}で${toHand}を攻撃)`;
    } else if (bestMove.move.type === 'split') {
        actionText = `(手を[${bestMove.move.values.join(', ')}]に分割)`;
    }

    hintAreaEl.innerHTML = `💡 最善手: <span class="font-bold ${outcomeColorClass}">${outcomeText}</span> <span class="text-xs">${actionText}</span>`;
}

export function clearPlayerHints() {
    if(hintAreaEl) hintAreaEl.innerHTML = '';
}

export function updateDisplay(state) {
	// プレイヤー/AI の数値と disabled 表示を更新する
	playerHandElements.forEach((el, i) => {
		el.textContent = state.playerHands[i]; // 行末コメント: 数値を描画
		el.classList.toggle('disabled', state.playerHands[i] === 0); // 行末コメント: 0 の手を無効表示
	});
	aiHandElements.forEach((el, i) => {
		el.textContent = state.aiHands[i];
		el.classList.toggle('disabled', state.aiHands[i] === 0);
	});

	// update undo button enabled/disabled according to state.canUndo if provided
	if (undoBtnEl) {
		if (typeof state.canUndo === 'function') {
			undoBtnEl.disabled = !state.canUndo();
			undoBtnEl.classList.toggle('opacity-50', !state.canUndo());
		} else {
			// fallback: enable by default
			undoBtnEl.disabled = false;
			undoBtnEl.classList.remove('opacity-50');
		}
	}

	// If gameOver flag provided in state, hide or show split button only.
	if (typeof state.gameOver !== 'undefined') {
		if (state.gameOver) {
			if (splitBtnEl) splitBtnEl.classList.add('hidden');
		} else {
			if (splitBtnEl) splitBtnEl.classList.remove('hidden');
		}
	}
}

export function updateMessage(msg) {
	// ゲームの案内メッセージを更新する
	messageEl.textContent = msg; // 行末コメント: プレイヤーに現在の状態/次のアクションを示す
}

export function openSplitModal(state, onSelect) {
	// 分割モーダルを開く。プレイヤーのターンかつゲーム中であることを前提とする
	if (state.gameOver || state.currentPlayer !== 'player') return; // 条件満たさない場合は無視
	const total = state.playerHands[0] + state.playerHands[1]; // 合計本数
	splitTotalEl.textContent = total; // 合計表示を更新
	splitOptionsContainer.innerHTML = ''; // 前回の候補をクリア
	if (total === 0) {
		// 分割できる指が無い場合の案内
		splitOptionsContainer.innerHTML = '<p class="col-span-2 text-gray-500">分配できる指がありません。</p>';
		// Add cancel button so user can close the modal
		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'キャンセル';
		cancelBtn.className = 'btn py-3 px-4 bg-gray-300 text-black font-bold rounded-lg shadow-md col-span-2';
		cancelBtn.onclick = () => { closeSplitModal(); };
		splitOptionsContainer.appendChild(cancelBtn);
		splitModalEl.classList.remove('hidden');
		return;
	}
	const possibleSplits = [];
	for (let i = 0; i <= total / 2; i++) {
		const j = total - i;
		if (j > 4) continue; // 右手が 4 を超える分割は無効
		const isSameAsCurrent = (i === state.playerHands[0] && j === state.playerHands[1]);
		const isSameAsReversed = (i === state.playerHands[1] && j === state.playerHands[0]);
		if (!isSameAsCurrent && !isSameAsReversed) possibleSplits.push([i, j]); // 重複パターンを除外
	}
	if (possibleSplits.length === 0) {
		splitOptionsContainer.innerHTML = '<p class="col-span-2 text-gray-500">有効な分配パターンがありません。</p>';
		// add cancel button
		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'キャンセル';
		cancelBtn.className = 'btn py-3 px-4 bg-gray-300 text-black font-bold rounded-lg shadow-md col-span-2';
		cancelBtn.onclick = () => { closeSplitModal(); };
		splitOptionsContainer.appendChild(cancelBtn);
	} else {
		possibleSplits.forEach(split => {
			const button = document.createElement('button');
			button.textContent = `${split[0]} と ${split[1]}`; // ボタンに候補数値を表示
			button.className = 'btn py-3 px-4 bg-green-500 text-white font-bold rounded-lg shadow-md w-full';
			button.onclick = () => {
				// Delegate the actual split action to the caller via callback
				if (typeof onSelect === 'function') onSelect(split[0], split[1]); // 行末コメント: 選択後に呼び出し側が状態を更新
				splitModalEl.classList.add('hidden'); // モーダルを閉じる
			};
			splitOptionsContainer.appendChild(button);
		});
		// Add a cancel button under valid options as well
		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'キャンセル';
		cancelBtn.className = 'btn py-3 px-4 bg-gray-300 text-black font-bold rounded-lg shadow-md col-span-2';
		cancelBtn.onclick = () => { closeSplitModal(); };
		splitOptionsContainer.appendChild(cancelBtn);
	}
	splitModalEl.classList.remove('hidden'); // モーダル表示
}

export function closeSplitModal() {
	// モーダルを閉じるユーティリティ
	splitModalEl.classList.add('hidden');
}

export function animateMove(element, targetX, targetY, callback) {
	// 要素を現在位置から targetX/targetY へ移動させる（CSS トランジション利用）
	const rect = element.getBoundingClientRect();
	const deltaX = targetX - rect.left;
	const deltaY = targetY - rect.top;

	element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
	element.classList.add('move-to-target');

	function handler() {
		element.classList.remove('move-to-target');
		element.style.transform = '';
		element.removeEventListener('transitionend', handler);
		if (typeof callback === 'function') callback();
	}

	element.addEventListener('transitionend', handler);
}

export function performPlayerAttackAnim(attackerIndex, targetIndex, onComplete) {
	// プレイヤーの攻撃アニメーション: 手のクローンを作ってターゲットまで移動させる
	const attackerEl = playerHandElements[attackerIndex];
	const targetEl = aiHandElements[targetIndex];
	const targetRect = targetEl.getBoundingClientRect();
	const attackerClone = attackerEl.cloneNode(true);
	document.body.appendChild(attackerClone);
	const attackerRect = attackerEl.getBoundingClientRect();
	attackerClone.style.position = 'absolute';
	attackerClone.style.left = `${attackerRect.left}px`;
	attackerClone.style.top = `${attackerRect.top}px`;
	attackerClone.style.width = `${attackerRect.width}px`;
	attackerClone.style.height = `${attackerRect.height}px`;
	animateMove(attackerClone, targetRect.left, targetRect.top, () => {
		document.body.removeChild(attackerClone);
		if (onComplete) onComplete();
	});
}

export function performAiAttackAnim(attackerIndex, targetIndex, onComplete) {
	// AI の攻撃アニメーション（プレイヤー攻撃と逆方向）
	const attackerEl = aiHandElements[attackerIndex];
	const targetEl = playerHandElements[targetIndex];
	const targetRect = targetEl.getBoundingClientRect();
	const attackerClone = attackerEl.cloneNode(true);
	document.body.appendChild(attackerClone);
	const attackerRect = attackerEl.getBoundingClientRect();
	attackerClone.style.position = 'absolute';
	attackerClone.style.left = `${attackerRect.left}px`;
	attackerClone.style.top = `${attackerRect.top}px`;
	attackerClone.style.width = `${attackerRect.width}px`;
	attackerClone.style.height = `${attackerRect.height}px`;
	animateMove(attackerClone, targetRect.left, targetRect.top, () => {
		document.body.removeChild(attackerClone);
		if (onComplete) onComplete();
	});
}

export function performAiSplitAnim(onComplete) {
	// AI の分割アニメーション: 左右の手を中央へ寄せる表現
	const leftHandEl = aiHandElements[0];
	const rightHandEl = aiHandElements[1];
	const leftCenterX = leftHandEl.getBoundingClientRect().left + leftHandEl.getBoundingClientRect().width / 2;
	const rightCenterX = rightHandEl.getBoundingClientRect().left + rightHandEl.getBoundingClientRect().width / 2;
	const centerX = (leftCenterX + rightCenterX) / 2; // 中央 x 座標
	const centerY = leftHandEl.getBoundingClientRect().top; // y 座標は左右同じ想定
	const leftClone = leftHandEl.cloneNode(true);
	const rightClone = rightHandEl.cloneNode(true);
	document.body.appendChild(leftClone);
	document.body.appendChild(rightClone);
	leftClone.style.position = 'absolute';
	rightClone.style.position = 'absolute';
	const leftRect = leftHandEl.getBoundingClientRect();
	const rightRect = rightHandEl.getBoundingClientRect();
	leftClone.style.left = `${leftRect.left}px`;
	leftClone.style.top = `${leftRect.top}px`;
	rightClone.style.left = `${rightRect.left}px`;
	rightClone.style.top = `${rightRect.top}px`;
	const leftTargetX = centerX - (leftClone.offsetWidth / 2);
	const rightTargetX = centerX - (rightClone.offsetWidth / 2);
	animateMove(leftClone, leftTargetX, centerY, () => { document.body.removeChild(leftClone); });
	animateMove(rightClone, rightTargetX, centerY, () => {
		document.body.removeChild(rightClone);
		if (onComplete) onComplete();
	});
}

export function performPlayerSplitAnim(val0, val1, onComplete) {
	// プレイヤーの分割アニメーション: 左右の手を中央へ寄せる表現
	// 注意: 状態変更はここでは行わず、onComplete で呼び出し元に通知するだけ
	const leftHandEl = playerHandElements[0];
	const rightHandEl = playerHandElements[1];
	const leftCenterX = leftHandEl.getBoundingClientRect().left + leftHandEl.getBoundingClientRect().width / 2;
	const rightCenterX = rightHandEl.getBoundingClientRect().left + rightHandEl.getBoundingClientRect().width / 2;
	const centerX = (leftCenterX + rightCenterX) / 2;
	const centerY = leftHandEl.getBoundingClientRect().top;
	const leftClone = leftHandEl.cloneNode(true);
	const rightClone = rightHandEl.cloneNode(true);
	document.body.appendChild(leftClone);
	document.body.appendChild(rightClone);
	leftClone.style.position = 'absolute';
	rightClone.style.position = 'absolute';
	const leftRect = leftHandEl.getBoundingClientRect();
	const rightRect = rightHandEl.getBoundingClientRect();
	leftClone.style.left = `${leftRect.left}px`;
	leftClone.style.top = `${leftRect.top}px`;
	rightClone.style.left = `${rightRect.left}px`;
	rightClone.style.top = `${rightRect.top}px`;
	const leftTargetX = centerX - (leftClone.offsetWidth / 2);
	const rightTargetX = centerX - (rightClone.offsetWidth / 2);
	animateMove(leftClone, leftTargetX, centerY, () => { document.body.removeChild(leftClone); });
	animateMove(rightClone, rightTargetX, centerY, () => {
		document.body.removeChild(rightClone);
		// Do NOT mutate game state here; delegate to caller via onComplete
		if (onComplete) onComplete();
	});
}
