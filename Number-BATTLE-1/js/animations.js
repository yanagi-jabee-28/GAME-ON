import { formatHandValue } from './utils.js';

// motion element pool to avoid frequent create/remove overhead
const _motionPool = [];

// Centralized animation timing configuration (milliseconds)
export const ANIM_TIMINGS = {
	attack: {
		sourceDuration: 560,
		sourcePhase1: 340,
		sourcePhase2: 220,
		target: { duration: 320, delay: 340 },
		overlayApproach: 340,
		overlayExit: 220,
		overlaySafety: 900
	},
	split: {
		// tuned to match attack animation total (~560ms)
		approach: 120,
		hold: 60,
		retreat: 120,
		fade: 40
	}
};

function _acquireMotionCard(owner) {
	const card = _motionPool.pop() || document.createElement('div');
	card.className = `attack-motion ${owner}`;
	card.style.position = 'absolute';
	if (!card._inner) {
		const existing = card.querySelector && card.querySelector('.attack-motion-value');
		if (existing) {
			card._inner = existing;
		} else {
			const inner = document.createElement('span');
			inner.className = 'attack-motion-value';
			card.appendChild(inner);
			card._inner = inner;
		}
	}
	return card;
}

function _releaseMotionCard(card) {
	if (!card) return;
	card.style.transition = '';
	card.style.transform = '';
	card.style.left = '';
	card.style.top = '';
	if (card.isConnected) card.remove();
	_motionPool.push(card);
}

export function playAttackAnimation(layer, sourceEl, targetEl, { actor, value }) {
	if (!layer || !sourceEl || !targetEl) {
		return Promise.resolve();
	}
	// cache rects once to avoid repeated layout reads
	const sourceRect = sourceEl.getBoundingClientRect();
	const targetRect = targetEl.getBoundingClientRect();
	const card = _acquireMotionCard(actor);
	card._inner.textContent = formatHandValue(value);
	layer.appendChild(card);
	// set size and initial position, then use CSS classes to drive transitions
	card.style.width = `${sourceRect.width}px`;
	card.style.height = `${sourceRect.height}px`;
	const startX = sourceRect.left + sourceRect.width / 2;
	const startY = sourceRect.top + sourceRect.height / 2;
	const targetX = targetRect.left + targetRect.width / 2;
	const targetY = targetRect.top + targetRect.height / 2;
	card.style.left = `${startX}px`;
	card.style.top = `${startY}px`;
	card.classList.add('motion-enter');
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
				duration: ANIM_TIMINGS.attack.sourceDuration,
				easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
			});
			sourceMotionPromise = sourceAnim.finished.catch(() => {
				sourceEl.style.transform = '';
			});
		} catch (err) {
			sourceMotionPromise = null;
		}
	}
	if (!sourceMotionPromise) {
		sourceMotionPromise = new Promise((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				resolve();
			};
			sourceEl.style.transition = `transform ${ANIM_TIMINGS.attack.sourcePhase1 / 1000}s cubic-bezier(0.4, 0, 0.2, 1)`;
			sourceEl.style.transform = `translate(${sourceTravelX}px, ${sourceTravelY}px)`;
			setTimeout(() => {
				sourceEl.style.transition = `transform ${ANIM_TIMINGS.attack.sourcePhase2 / 1000}s ease-out`;
				sourceEl.style.transform = initialInlineTransform;
				setTimeout(() => {
					sourceEl.style.transition = '';
					finish();
				}, ANIM_TIMINGS.attack.sourcePhase2);
			}, ANIM_TIMINGS.attack.sourcePhase1);
			setTimeout(finish, ANIM_TIMINGS.attack.overlaySafety);
		});
	}
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

	// (sequence logic for split animations is handled in playSplitAnimation)


	const overlayPromise = new Promise((resolve) => {
		let finished = false;
		const complete = () => {
			if (finished) return;
			finished = true;
			_releaseMotionCard(card);
			resolve();
		};
		requestAnimationFrame(() => {
			// make visible and move to target; CSS transitions handle interpolation
			card.classList.remove('motion-enter');
			card.classList.add('motion-visible');
			// force style/layout flush so the transition will pick up the subsequent left/top change
			void card.offsetWidth;
			card.style.left = `${targetX}px`;
			card.style.top = `${targetY}px`;
			setTimeout(() => {
				// exit animation
				card.classList.remove('motion-visible');
				card.classList.add('motion-exit');
				setTimeout(complete, ANIM_TIMINGS.attack.overlayExit);
			}, ANIM_TIMINGS.attack.overlayApproach);
		});
		// safety fallback: ensure completion after a maximum time
		setTimeout(complete, ANIM_TIMINGS.attack.overlaySafety);
	});

	return Promise.all([overlayPromise, sourceMotionPromise]).then(() => { });

}

export function playSplitAnimation({
	layer,
	owner,
	beforeValues = [],
	afterValues = [],
	handRefs,
	fallbackHands
}) {
	if (!layer) return Promise.resolve();
	const ownerHands = handRefs;
	if (!ownerHands || ownerHands.length < 2) return Promise.resolve();
	const leftEl = ownerHands[0];
	const rightEl = ownerHands[1];
	if (!leftEl || !rightEl) return Promise.resolve();

	const formatForAnimation = (value) => (value === 0 ? 'X' : value.toString());

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
	const fallback = fallbackHands?.[owner] ?? [0, 0];
	const beforeLeft = coerceValue(beforeValues, 0, fallback[0] ?? 0);
	const beforeRight = coerceValue(beforeValues, 1, fallback[1] ?? 0);
	const afterLeft = coerceValue(afterValues, 0, beforeLeft);
	const afterRight = coerceValue(afterValues, 1, beforeRight);

	// use cached child refs if available to avoid repeated querySelector calls
	const leftTextEl = leftEl._fingerCountEl || leftEl.querySelector('.finger-count');
	const rightTextEl = rightEl._fingerCountEl || rightEl.querySelector('.finger-count');
	const originalLeftVisibility = leftEl.style.visibility || '';
	const originalRightVisibility = rightEl.style.visibility || '';
	// hide originals while motion cards are animating
	leftEl.style.visibility = 'hidden';
	rightEl.style.visibility = 'hidden';

	const durations = ANIM_TIMINGS.split;

	const markHandState = (lVal, rVal) => {
		if (leftTextEl) {
			const newLeft = formatHandValue(lVal);
			if (leftTextEl.textContent !== newLeft) leftTextEl.textContent = newLeft;
		}
		if (rightTextEl) {
			const newRight = formatHandValue(rVal);
			if (rightTextEl.textContent !== newRight) rightTextEl.textContent = newRight;
		}
		leftEl.classList.toggle('dead', (lVal === 0 || lVal === 5));
		rightEl.classList.toggle('dead', (rVal === 0 || rVal === 5));
	};

	const createCard = (rect, initialValue) => {
		const card = _acquireMotionCard(owner);
		card.style.width = `${rect.width}px`;
		card.style.height = `${rect.height}px`;
		card.style.left = `${rect.left + rect.width / 2}px`;
		card.style.top = `${rect.top + rect.height / 2}px`;
		card.style.transform = 'translate(-50%, -50%)';
		card._inner.textContent = formatForAnimation(initialValue);
		layer.appendChild(card);
		return card;
	};

	const leftCard = createCard(leftRect, beforeLeft);
	const rightCard = createCard(rightRect, beforeRight);

	// Phase 1: move left/right to center
	const moveToCenter = () => new Promise((resolve) => {
		let done = 0;
		const checkDone = () => {
			done++;
			if (done >= 2) resolve();
		};

		[leftCard, rightCard].forEach((card, idx) => {
			const startX = idx === 0 ? leftCenterX : rightCenterX;
			const startY = idx === 0 ? leftCenterY : rightCenterY;
			card.style.left = `${startX}px`;
			card.style.top = `${startY}px`;
			card.classList.add('motion-enter');
			requestAnimationFrame(() => {
				card.classList.remove('motion-enter');
				card.classList.add('motion-visible');
				// flush
				void card.offsetWidth;
				card.style.left = `${centerX}px`;
				card.style.top = `${centerY}px`;
				setTimeout(() => {
					checkDone();
				}, durations.approach + durations.hold);
			});
		});
	});

	// Phase 2: show center combined card
	const showCenter = () => new Promise((resolve) => {
		const centerCard = _acquireMotionCard(owner);
		centerCard.classList.add('split-impact');
		centerCard.style.width = `${Math.max(leftRect.width, rightRect.width)}px`;
		centerCard.style.height = `${Math.max(leftRect.height, rightRect.height)}px`;
		centerCard.style.left = `${centerX}px`;
		centerCard.style.top = `${centerY}px`;
		centerCard.style.transform = 'translate(-50%, -50%)';
		centerCard._inner.textContent = formatForAnimation(afterLeft + afterRight);
		layer.appendChild(centerCard);

		// At merge: update visible numbers to merged value (originals are hidden, but keep state consistent)
		markHandState(afterLeft + afterRight, afterLeft + afterRight);

		requestAnimationFrame(() => {
			centerCard.classList.add('motion-enter');
			requestAnimationFrame(() => {
				centerCard.classList.remove('motion-enter');
				centerCard.classList.add('motion-visible');
				void centerCard.offsetWidth;
				setTimeout(() => {
					centerCard.classList.remove('motion-visible');
					centerCard.classList.add('motion-exit');
					setTimeout(() => {
						_releaseMotionCard(centerCard);
						resolve();
					}, durations.fade);
				}, durations.approach + durations.hold);
			});
		});
	});

	// Phase 3: spawn result cards at center and animate outwards to final positions
	const spawnResults = () => new Promise((resolve) => {
		const resLeft = _acquireMotionCard(owner);
		const resRight = _acquireMotionCard(owner);

		resLeft._inner.textContent = formatForAnimation(afterLeft);
		resRight._inner.textContent = formatForAnimation(afterRight);

		resLeft.style.left = `${centerX}px`;
		resLeft.style.top = `${centerY}px`;
		resRight.style.left = `${centerX}px`;
		resRight.style.top = `${centerY}px`;

		layer.appendChild(resLeft);
		layer.appendChild(resRight);

		[resLeft, resRight].forEach((card) => {
			card.classList.add('motion-enter');
		});
		requestAnimationFrame(() => {
			[resLeft, resRight].forEach((card) => {
				card.classList.remove('motion-enter');
				card.classList.add('motion-visible');
				void card.offsetWidth;
			});
			// before splitting outward, update original hand numbers to the split results
			markHandState(afterLeft, afterRight);

			// move them outwards
			resLeft.style.left = `${leftCenterX}px`;
			resLeft.style.top = `${leftCenterY}px`;
			resRight.style.left = `${rightCenterX}px`;
			resRight.style.top = `${rightCenterY}px`;

			setTimeout(() => {
				// exit
				resLeft.classList.remove('motion-visible');
				resLeft.classList.add('motion-exit');
				resRight.classList.remove('motion-visible');
				resRight.classList.add('motion-exit');
				setTimeout(() => {
					_releaseMotionCard(resLeft);
					_releaseMotionCard(resRight);
					resolve();
				}, durations.fade);
			}, durations.retreat + durations.fade);
		});
	});

	const seqPromise = moveToCenter()
		.then(() => {
			// when both cards have reached center, hide the originals
			leftCard.classList.remove('motion-visible');
			leftCard.classList.add('motion-exit');
			rightCard.classList.remove('motion-visible');
			rightCard.classList.add('motion-exit');
			_releaseMotionCard(leftCard);
			_releaseMotionCard(rightCard);
			return showCenter();
		})
		.then(() => spawnResults());

	const restoreDelay = durations.approach + durations.hold + Math.floor(durations.retreat * 0.6);
	const restorePromise = new Promise((resolve) => {
		setTimeout(() => {
			// do not change numbers here; numbers updated at merge and split
			resolve();
		}, restoreDelay);
	});

	return Promise.all([seqPromise, restorePromise])
		.catch(() => { })
		.finally(() => {
			// restore hand styles and visibility
			leftEl.style.transition = '';
			rightEl.style.transition = '';
			leftEl.style.visibility = originalLeftVisibility;
			rightEl.style.visibility = originalRightVisibility;
		});
}
