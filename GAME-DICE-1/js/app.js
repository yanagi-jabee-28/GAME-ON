(function () {
	class DiceRollerApp {
		constructor(containerId, resultElementId, rollButtonId) {
			this.container = document.getElementById(containerId);
			this.resultElement = document.getElementById(resultElementId);
			this.rollButton = document.getElementById(rollButtonId);

			this.scene = null;
			this.camera = null;
			this.renderer = null;
			this.world = null;
			this.dice = [];
			this.isCheckingResult = false;
			this.checkResultTimeout = null;

			this.init = this.init.bind(this);
			this.animate = this.animate.bind(this);
			this.throwDice = this.throwDice.bind(this);
			this.onWindowResize = this.onWindowResize.bind(this);
		}

		init() {
			this.scene = new THREE.Scene();
			this.scene.background = new THREE.Color(0xf0f2f5);
			this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
			this.camera.position.set(0, 10, 12);
			this.camera.lookAt(0, 0, 0);

			this.renderer = new THREE.WebGLRenderer({ antialias: true });
			this.renderer.setSize(window.innerWidth, window.innerHeight);
			this.renderer.shadowMap.enabled = true;
			this.container.appendChild(this.renderer.domElement);

			const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
			this.scene.add(ambientLight);
			const dir = new THREE.DirectionalLight(0xffffff, 0.7);
			dir.position.set(5, 10, 7.5);
			dir.castShadow = true;
			this.scene.add(dir);

			// physics
			const ph = PhysicsHelper.createWorld();
			this.world = ph.world;
			this.defaultMaterial = ph.defaultMaterial;
			this.diceMaterial = ph.diceMaterial;

			const bowlMesh = this.createBowlMesh();
			this.scene.add(bowlMesh);
			const bowl = PhysicsHelper.createBowlCollider(this.world, this.defaultMaterial);
			console.log('Physics bowl tiles:', bowl.tileCount);

			const diceObj = this.createDice(new THREE.Vector3(0, 5, 0));
			this.dice.push(diceObj);
			this.scene.add(diceObj.mesh);

			this.world.addBody(diceObj.body);
			// Throw the dice once on startup so they're not static at spawn.
			setTimeout(() => this.throwDice(), 50);

			this.rollButton.addEventListener('click', this.throwDice);
			window.addEventListener('resize', this.onWindowResize);
			this.animate();
		}

		createBowlMesh() {
			const points = [new THREE.Vector2(0.1, -2.2), new THREE.Vector2(3.0, -1.5), new THREE.Vector2(6.0, 2.0)];
			const g = new THREE.LatheGeometry(points, 64);
			const m = new THREE.MeshStandardMaterial({ color: 0xA1887F, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });
			const mesh = new THREE.Mesh(g, m);
			mesh.receiveShadow = true;
			return mesh;
		}

		createDice(position) {
			const size = 1;
			const half = size / 2;
			const g = new THREE.BoxGeometry(size, size, size);
			// Create per-face materials with correct pip layouts (1..6)
			function createFaceMaterial(n, rotationDeg = 0) {
				const canvas = document.createElement('canvas');
				canvas.width = 128; canvas.height = 128;
				const ctx = canvas.getContext('2d');
				// background
				ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 128, 128);
				// rounded rect border
				ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, 120, 120);
				// pip positions
				const positions = {
					1: [[64, 64]],
					2: [[32, 32], [96, 96]],
					3: [[32, 32], [64, 64], [96, 96]],
					4: [[32, 32], [96, 32], [32, 96], [96, 96]],
					5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]],
					6: [[32, 32], [96, 32], [32, 64], [96, 64], [32, 96], [96, 96]]
				}[n] || [[64, 64]];

				// optional rotation
				if (rotationDeg !== 0) {
					ctx.translate(64, 64);
					ctx.rotate(rotationDeg * Math.PI / 180);
					ctx.translate(-64, -64);
				}

				ctx.fillStyle = 'black';
				positions.forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.fill(); });

				const tex = new THREE.CanvasTexture(canvas);
				tex.center = new THREE.Vector2(0.5, 0.5);
				return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.1 });
			}

			// BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
			// Standard die mapping with opposite faces summing to 7:
			// we'll use the order [1, 6, 2, 5, 3, 4] matching +X, -X, +Y, -Y, +Z, -Z
			const faceOrder = [1, 6, 2, 5, 3, 4];
			const materials = faceOrder.map(n => createFaceMaterial(n));
			const mesh = new THREE.Mesh(g, materials);
			mesh.castShadow = true; mesh.position.copy(position);

			const body = PhysicsHelper.createDiceBody(this.world, this.diceMaterial, position, size);
			return { mesh, body };
		}

		throwDice() {
			this.resultElement.textContent = '...';
			this.isCheckingResult = false;
			clearTimeout(this.checkResultTimeout);

			this.dice.forEach(d => {
				const b = d.body;
				b.position.set((Math.random() - 0.5) * 1, 5, (Math.random() - 0.5) * 1);
				b.velocity.set(0, 0, 0);
				b.angularVelocity.set((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
			});
			this.checkResultTimeout = setTimeout(() => this.scheduleResultCheck(), 2000);
		}

		scheduleResultCheck() { this.isCheckingResult = true; }

		getDiceFace(mesh) {
			const faceNormals = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
			const faceValues = [1, 6, 2, 5, 3, 4];
			let maxDot = -1, topFace = -1; const up = new THREE.Vector3(0, 1, 0);
			for (let i = 0; i < faceNormals.length; i++) { const n = faceNormals[i].clone(); n.applyQuaternion(mesh.quaternion); const d = n.dot(up); if (d > maxDot) { maxDot = d; topFace = faceValues[i]; } }
			return topFace;
		}

		animate() {
			requestAnimationFrame(this.animate);
			this.world.step(1 / 60, undefined, 5);
			this.dice.forEach(d => { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); });
			if (this.isCheckingResult) { const die = this.dice[0]; const av = die.body.angularVelocity.length(); const v = die.body.velocity.length(); if (av < 0.1 && v < 0.1) { this.resultElement.textContent = this.getDiceFace(die.mesh); this.isCheckingResult = false; } }
			this.renderer.render(this.scene, this.camera);
		}

		onWindowResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }
	}

	window.DiceRollerApp = DiceRollerApp;
})();
