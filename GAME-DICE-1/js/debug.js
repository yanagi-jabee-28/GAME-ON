(function () {
	function setupCameraControls(scene, camera, renderer, cfg) {
		cfg = cfg || {};
		const enabled = cfg.enabled;
		if (!enabled) return { dispose: () => { } };

		let isDown = false;
		let startX = 0, startY = 0;
		let yaw = 0, pitch = 0;
		const rotateSpeed = cfg.rotateSpeed || 0.005;
		const zoomSpeed = cfg.zoomSpeed || 1.0;

		function onDown(e) {
			isDown = true; startX = e.clientX; startY = e.clientY;
		}
		function onUp() { isDown = false; }
		function onMove(e) {
			if (!isDown) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			yaw -= dx * rotateSpeed;
			pitch -= dy * rotateSpeed;
			startX = e.clientX; startY = e.clientY;
			updateCamera();
		}
		function onWheel(e) {
			const delta = Math.sign(e.deltaY);
			camera.position.multiplyScalar(1 + delta * 0.05 * zoomSpeed);
		}

		function updateCamera() {
			const radius = camera.position.length();
			const x = Math.sin(yaw) * Math.cos(pitch) * radius;
			const y = Math.sin(pitch) * radius;
			const z = Math.cos(yaw) * Math.cos(pitch) * radius;
			camera.position.set(x, y, z);
			camera.lookAt(0, 0, 0);
		}

		renderer.domElement.addEventListener('mousedown', onDown);
		document.addEventListener('mouseup', onUp);
		document.addEventListener('mousemove', onMove);
		renderer.domElement.addEventListener('wheel', onWheel);

		return {
			dispose() {
				renderer.domElement.removeEventListener('mousedown', onDown);
				document.removeEventListener('mouseup', onUp);
				document.removeEventListener('mousemove', onMove);
				renderer.domElement.removeEventListener('wheel', onWheel);
			}
		};
	}

	window.DebugTools = { setupCameraControls };
})();
