// アニメーション関連のコード
function animateMove(element, targetX, targetY, callback) {
	const rect = element.getBoundingClientRect();
	const deltaX = targetX - rect.left;
	const deltaY = targetY - rect.top;

	element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
	element.classList.add('move-to-target');

	element.addEventListener('transitionend', () => {
		element.classList.remove('move-to-target');
		element.style.transform = '';
		if (typeof callback === 'function') callback();
	});
}

function animateFadeOut(element, callback) {
	element.classList.add('fade-out');
	element.addEventListener('transitionend', () => {
		element.classList.remove('fade-out');
		if (callback) callback();
	});
}