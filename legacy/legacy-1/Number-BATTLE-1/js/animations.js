import { formatHandValue } from './utils.js';

export class AnimationController {
	constructor({ attackLayer, handElements }) {
		this.attackLayer = attackLayer;
		this.handElements = handElements;
		this.reviewAnimationToken = 0;
	}

	incrementToken() {
		this.reviewAnimationToken += 1;
		return this.reviewAnimationToken;
	}

	currentToken() {
		return this.reviewAnimationToken;
	}

	async playAttackAnimation(sourceEl, targetEl, { actor, value }) {
		if (!this.attackLayer || !sourceEl || !targetEl) return;
		const sourceRect = sourceEl.getBoundingClientRect();
		const targetRect = targetEl.getBoundingClientRect();
		const card = document.createElement('div');
		card.className = `attack-motion ${actor}`;
		card.style.width = `${sourceRect.width}px`;
		card.style.height = `${sourceRect.height}px`;
		const inner = document.createElement('span');
		inner.className = 'attack-motion-value';
		inner.textContent = formatHandValue(value);
		card.appendChild(inner);
		this.attackLayer.appendChild(card);
		const startX = sourceRect.left + sourceRect.width / 2;
		const startY = sourceRect.top + sourceRect.height / 2;
		const targetX = targetRect.left + targetRect.width / 2;
		const targetY = targetRect.top + targetRect.height / 2;
		card.style.left = `${startX}px`;
		card.style.top = `${startY}px`;
		card.style.transform = 'translate(-50%, -50%) scale(0.85)';
		card.style.opacity = '0';
		const deltaX = targetX - startX;
		const deltaY = targetY - startY;
		const sourceTravelX = deltaX * 0.3;
		const sourceTravelY = deltaY * 0.3;
		const initialInlineTransform = sourceEl.style.transform;

		let sourceMotionPromise = null;
		if (typeof sourceEl.animate === 'function') {
			try {
				const sourceAnim = sourceEl.animate([
					{ transform: 'translate(0px, 0px)' },
					{ transform: `translate(${sourceTravelX}px, ${sourceTravelY}px)` },
					{ transform: 'translate(0px, 0px)' }
				], {
					duration: 560,
					easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
				});
				sourceMotionPromise = sourceAnim.finished.catch(() => {
					// animation cancelled: ensure transform reset
					sourceEl.style.transform = '';
				});
			} catch (err) {
				sourceMotionPromise = null;
			}
		}
		if (!sourceMotionPromise) {
			// fallback using transitions for browsers without Web Animations API
			sourceMotionPromise = new Promise(resolve => {
				let done = false;
				const finish = () => {
					if (done) return;
					done = true;
					resolve();
				};
				sourceEl.style.transition = 'transform 0.34s cubic-bezier(0.4, 0, 0.2, 1)';
				sourceEl.style.transform = `translate(${sourceTravelX}px, ${sourceTravelY}px)`;
				setTimeout(() => {
					sourceEl.style.transition = 'transform 0.22s ease-out';
					sourceEl.style.transform = initialInlineTransform;
					setTimeout(() => {
						sourceEl.style.transition = '';
						finish();
					}, 220);
				}, 340);
				setTimeout(finish, 900);
			});
		}
		// ensure transform cleared after animation completes (both native and fallback)
		sourceMotionPromise = sourceMotionPromise.finally(() => {
			sourceEl.style.transition = '';
			sourceEl.style.transform = initialInlineTransform;
		});

		if (typeof targetEl.animate === 'function') {
			try {
				targetEl.animate([
					{ transform: 'scale(1)' },
					{ transform: 'scale(1.1)' },
					{ transform: 'scale(1)' }
				], {
					duration: 320,
					delay: 340,
					easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)'
				});
			} catch (err) {
				/* ignore */
			}
		}

		const overlayPromise = new Promise(resolve => {
			let finished = false;
			const complete = () => {
				if (finished) return;
				finished = true;
				card.remove();
				resolve();
			};
			requestAnimationFrame(() => {
				card.style.opacity = '1';
				card.style.left = `${targetX}px`;
				card.style.top = `${targetY}px`;
				card.style.transform = 'translate(-50%, -50%) scale(1.12)';
				setTimeout(() => {
					card.style.opacity = '0';
					card.style.transform = 'translate(-50%, -50%) scale(0.65)';
					setTimeout(complete, 220);
				}, 340);
			});
			setTimeout(complete, 900);
		});

		await Promise.all([overlayPromise, sourceMotionPromise]).catch(() => { });
	}

	async playSplitAnimation(owner, beforeValues = [], afterValues = [], options = {}) {
		if (!this.attackLayer) return;
		const ownerHands = options.handRefs || this.handElements?.[owner];
		if (!ownerHands || ownerHands.length < 2) return;
		const [leftEl, rightEl] = ownerHands;
		if (!leftEl || !rightEl) return;

		const leftRect = leftEl.getBoundingClientRect();
		const rightRect = rightEl.getBoundingClientRect();
		const leftCenterX = leftRect.left + leftRect.width / 2;
		const leftCenterY = leftRect.top + leftRect.height / 2;
		const rightCenterX = rightRect.left + rightRect.width / 2;
		const rightCenterY = rightRect.top + rightRect.height / 2;
		const centerX = (leftCenterX + rightCenterX) / 2;
		const centerY = (leftCenterY + rightCenterY) / 2;

		const coerceValue = (arr, idx, fallback) => {
			if (!Array.isArray(arr)) return fallback;
			const val = arr[idx];
			return typeof val === 'number' ? val : fallback;
		};
		const beforeLeft = coerceValue(beforeValues, 0, 0);
		const beforeRight = coerceValue(beforeValues, 1, 0);
		const afterLeft = coerceValue(afterValues, 0, beforeLeft);
		const afterRight = coerceValue(afterValues, 1, beforeRight);

		const leftTextEl = leftEl.querySelector('.finger-count');
		const rightTextEl = rightEl.querySelector('.finger-count');
		const originalLeftOpacity = leftEl.style.opacity;
		const originalRightOpacity = rightEl.style.opacity;
		leftEl.style.opacity = '0';
		rightEl.style.opacity = '0';

		const durations = {
			approach: 260,
			hold: 160,
			retreat: 280,
			fade: 180
		};

		const markHandState = () => {
			const isDead = (v) => v === 0 || v === 5;
			if (leftTextEl) leftTextEl.textContent = formatHandValue(afterLeft);
			if (rightTextEl) rightTextEl.textContent = formatHandValue(afterRight);
			leftEl.classList.toggle('dead', isDead(afterLeft));
			rightEl.classList.toggle('dead', isDead(afterRight));
		};

		const createCard = (rect, initialValue) => {
			const card = document.createElement('div');
			card.className = `attack-motion ${owner}`;
			card.style.width = `${rect.width}px`;
			card.style.height = `${rect.height}px`;
			card.style.left = `${rect.left + rect.width / 2}px`;
			card.style.top = `${rect.top + rect.height / 2}px`;
			card.style.transform = 'translate(-50%, -50%) scale(0.85)';
			card.style.opacity = '0';
			const inner = document.createElement('span');
			inner.className = 'attack-motion-value';
			inner.textContent = formatHandValue(initialValue);
			card.appendChild(inner);
			this.attackLayer.appendChild(card);
			return card;
		};

		const leftCard = createCard(leftRect, beforeLeft);
		const rightCard = createCard(rightRect, beforeRight);

		const animateCard = (card, startX, startY, finalX, finalY, nextValue) => {
			return new Promise(resolve => {
				let finished = false;
				const complete = () => {
					if (finished) return;
					finished = true;
					card.remove();
					resolve();
				};
				card.style.left = `${startX}px`;
				card.style.top = `${startY}px`;
				requestAnimationFrame(() => {
					card.style.opacity = '1';
					card.style.left = `${centerX}px`;
					card.style.top = `${centerY}px`;
					card.style.transform = 'translate(-50%, -50%) scale(1.08)';
					setTimeout(() => {
						card.querySelector('.attack-motion-value').textContent = formatHandValue(nextValue);
						card.style.left = `${finalX}px`;
						card.style.top = `${finalY}px`;
						card.style.transform = 'translate(-50%, -50%) scale(0.95)';
						setTimeout(() => {
							card.style.opacity = '0';
							card.style.transform = 'translate(-50%, -50%) scale(0.8)';
							setTimeout(complete, durations.fade);
						}, durations.retreat);
					}, durations.approach + durations.hold);
				});
				setTimeout(complete, durations.approach + durations.hold + durations.retreat + durations.fade + 160);
			});
		};

		const leftPromise = animateCard(leftCard, leftCenterX, leftCenterY, leftCenterX, leftCenterY, afterLeft);
		const rightPromise = animateCard(rightCard, rightCenterX, rightCenterY, rightCenterX, rightCenterY, afterRight);

		const centerCard = document.createElement('div');
		centerCard.className = `attack-motion ${owner} split-impact`;
		centerCard.style.width = `${Math.max(leftRect.width, rightRect.width)}px`;
		centerCard.style.height = `${Math.max(leftRect.height, rightRect.height)}px`;
		centerCard.style.left = `${centerX}px`;
		centerCard.style.top = `${centerY}px`;
		centerCard.style.transform = 'translate(-50%, -50%) scale(0.4)';
		centerCard.style.opacity = '0';
		const centerInner = document.createElement('span');
		centerInner.className = 'attack-motion-value';
		centerInner.textContent = formatHandValue(afterLeft + afterRight);
		centerCard.appendChild(centerInner);
		this.attackLayer.appendChild(centerCard);

		const centerPromise = new Promise(resolve => {
			let resolved = false;
			const finish = () => {
				if (resolved) return;
				resolved = true;
				centerCard.remove();
				resolve();
			};
			requestAnimationFrame(() => {
				centerCard.style.opacity = '1';
				centerCard.style.transform = 'translate(-50%, -50%) scale(1.05)';
				setTimeout(() => {
					centerCard.style.opacity = '0';
					centerCard.style.transform = 'translate(-50%, -50%) scale(0.6)';
					setTimeout(finish, durations.fade);
				}, durations.approach + durations.hold);
			});
			setTimeout(finish, durations.approach + durations.hold + durations.fade + 300);
		});

		const restoreDelay = durations.approach + durations.hold + Math.floor(durations.retreat * 0.6);
		const restorePromise = new Promise(resolve => {
			setTimeout(() => {
				markHandState();
				leftEl.style.transition = 'opacity 0.24s ease-out';
				rightEl.style.transition = 'opacity 0.24s ease-out';
				leftEl.style.opacity = originalLeftOpacity || '1';
				rightEl.style.opacity = originalRightOpacity || '1';
				setTimeout(() => {
					leftEl.style.transition = '';
					rightEl.style.transition = '';
					if (originalLeftOpacity === '') leftEl.style.opacity = '';
					if (originalRightOpacity === '') rightEl.style.opacity = '';
					resolve();
				}, 260);
			}, restoreDelay);
		});

		await Promise.all([leftPromise, rightPromise, centerPromise, restorePromise]).catch(() => { }).finally(() => {
			if (leftCard.isConnected) leftCard.remove();
			if (rightCard.isConnected) rightCard.remove();
			if (centerCard.isConnected) centerCard.remove();
			leftEl.style.transition = '';
			rightEl.style.transition = '';
			if (originalLeftOpacity === '') {
				leftEl.style.opacity = '';
			} else {
				leftEl.style.opacity = originalLeftOpacity;
			}
			if (originalRightOpacity === '') {
				rightEl.style.opacity = '';
			} else {
				rightEl.style.opacity = originalRightOpacity;
			}
		});
	}
}
