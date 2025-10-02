// ui.js - DOM/アニメーション/表示更新
import { playerHands, aiHands, initState, applyAttack, applySplit, checkWin, switchTurnTo } from './game.js';

let playerHandElements;
let aiHandElements;
let messageEl;
let splitBtnEl;
let restartBtnEl;
let splitModalEl;
let splitTotalEl;
let splitOptionsContainer;

export function cacheDom() {
	playerHandElements = [document.getElementById('player-hand-0'), document.getElementById('player-hand-1')];
	aiHandElements = [document.getElementById('ai-hand-0'), document.getElementById('ai-hand-1')];
	messageEl = document.getElementById('message');
	splitBtnEl = document.getElementById('split-btn');
	restartBtnEl = document.getElementById('restart-btn');
	splitModalEl = document.getElementById('split-modal');
	splitTotalEl = document.getElementById('split-total');
	splitOptionsContainer = document.getElementById('split-options');
}

export function updateDisplay(state) {
	playerHandElements.forEach((el, i) => {
		el.textContent = state.playerHands[i];
		el.classList.toggle('disabled', state.playerHands[i] === 0);
	});
	aiHandElements.forEach((el, i) => {
		el.textContent = state.aiHands[i];
		el.classList.toggle('disabled', state.aiHands[i] === 0);
	});
}

export function updateMessage(msg) {
	messageEl.textContent = msg;
}

export function openSplitModal(state, onSelect) {
	if (state.gameOver || state.currentPlayer !== 'player') return;
	const total = state.playerHands[0] + state.playerHands[1];
	splitTotalEl.textContent = total;
	splitOptionsContainer.innerHTML = '';
	if (total === 0) {
		splitOptionsContainer.innerHTML = '<p class="col-span-2 text-gray-500">分配できる指がありません。</p>';
		splitModalEl.classList.remove('hidden');
		return;
	}
	const possibleSplits = [];
	for (let i = 0; i <= total / 2; i++) {
		const j = total - i;
		if (j > 4) continue;
		const isSameAsCurrent = (i === state.playerHands[0] && j === state.playerHands[1]);
		const isSameAsReversed = (i === state.playerHands[1] && j === state.playerHands[0]);
		if (!isSameAsCurrent && !isSameAsReversed) possibleSplits.push([i, j]);
	}
	if (possibleSplits.length === 0) {
		splitOptionsContainer.innerHTML = '<p class="col-span-2 text-gray-500">有効な分配パターンがありません。</p>';
	} else {
		possibleSplits.forEach(split => {
			const button = document.createElement('button');
			button.textContent = `${split[0]} と ${split[1]}`;
			button.className = 'btn py-3 px-4 bg-green-500 text-white font-bold rounded-lg shadow-md w-full';
			button.onclick = () => {
				// Delegate the actual split action to the caller via callback
				if (typeof onSelect === 'function') onSelect(split[0], split[1]);
				splitModalEl.classList.add('hidden');
			};
			splitOptionsContainer.appendChild(button);
		});
	}
	splitModalEl.classList.remove('hidden');
}

export function closeSplitModal() {
	splitModalEl.classList.add('hidden');
}

export function animateMove(element, targetX, targetY, callback) {
	const rect = element.getBoundingClientRect();
	const deltaX = targetX - rect.left;
	const deltaY = targetY - rect.top;

	element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
	element.classList.add('move-to-target');

	element.addEventListener('transitionend', function handler() {
		element.classList.remove('move-to-target');
		element.style.transform = '';
		element.removeEventListener('transitionend', handler);
		if (typeof callback === 'function') callback();
	});
}

export function performPlayerAttackAnim(attackerIndex, targetIndex, onComplete) {
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
	const leftHandEl = aiHandElements[0];
	const rightHandEl = aiHandElements[1];
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
		if (onComplete) onComplete();
	});
}

export function performPlayerSplitAnim(val0, val1, onComplete) {
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
