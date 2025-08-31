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
			const camPos = (this.cfg && this.cfg.render && this.cfg.render.cameraPosition) || { x: 0, y: 10, z: 12 };
			this.camera.position.set(camPos.x, camPos.y, camPos.z);
			this.camera.lookAt(0, 0, 0);

			this.renderer = new THREE.WebGLRenderer({ antialias: true });
			this.renderer.setSize(window.innerWidth, window.innerHeight);
			this.renderer.shadowMap.enabled = true;
			// use softer shadow algorithm when available
			if (THREE.PCFSoftShadowMap) this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
			this.container.appendChild(this.renderer.domElement);

			const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
			this.scene.add(ambientLight);
			const dir = new THREE.DirectionalLight(0xffffff, 0.6);
			dir.position.set(5, 10, 7.5);
			dir.castShadow = true;
			// tune shadow map size and bias for smoother, less aliased shadows
			dir.shadow.mapSize.width = 2048;
			dir.shadow.mapSize.height = 2048;
			dir.shadow.bias = -0.0005;
			if (dir.shadow.radius !== undefined) dir.shadow.radius = 3;
			// enlarge shadow camera to cover bowl area
			const d = 12;
			if (dir.shadow.camera) {
				dir.shadow.camera.near = 1;
				dir.shadow.camera.far = 50;
				if (dir.shadow.camera.left !== undefined) {
					dir.shadow.camera.left = -d;
					dir.shadow.camera.right = d;
					dir.shadow.camera.top = d;
					dir.shadow.camera.bottom = -d;
				}
			}
			this.scene.add(dir);
			// add a subtle hemisphere fill light to reduce harsh contrast
			const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.35);
			this.scene.add(hemi);

			// physics
			const ph = PhysicsHelper.createWorld();
			this.world = ph.world;
			// Rapier PoC is optional; expose detection
			if (window.PhysicsHelperRapier) console.log('Rapier PoC available via PhysicsHelperRapier');
			this.defaultMaterial = ph.defaultMaterial;
			this.diceMaterial = ph.diceMaterial;
			this.cfg = window.AppConfig || {};
			this.diceCfg = this.cfg.dice || {};
			this.uiCfg = this.cfg.ui || {};

			// add hemisphere bowl (visual + physics)
			const bowlMesh = this.createBowlMesh();
			this.scene.add(bowlMesh);
			const bowl = PhysicsHelper.createBowlCollider(this.world, this.defaultMaterial);
			console.log('Physics bowl tiles:', bowl.tileCount);

			// create three dice placed so they don't overlap
			const diceCount = this.diceCfg.count || 3;
			const spacing = this.diceCfg.spacing || 1.6;
			for (let i = 0; i < diceCount; i++) {
				const x = (i - (diceCount - 1) / 2) * spacing;
				const pos = new THREE.Vector3(x, this.diceCfg.initialHeight || 5, 0);
				const diceObjN = this.createDice(pos);
				this.dice.push(diceObjN);
				this.scene.add(diceObjN.mesh);
				this.world.addBody(diceObjN.body);
			}
			// Throw the dice once on startup so they're not static at spawn.
			setTimeout(() => this.throwDice(), this.uiCfg.autoThrowDelay || 50);

			this.rollButton.addEventListener('click', this.throwDice);
			window.addEventListener('resize', this.onWindowResize);
			this.animate();

			// debug camera controls
			const debugCfg = (window.AppConfig && window.AppConfig.debug) || {};
			this._debugControls = window.DebugTools && window.DebugTools.setupCameraControls(this.scene, this.camera, this.renderer, debugCfg);
			// expose switch helper: call window.app.useRapierPoC() from console to swap to Rapier PoC world
			this.useRapierPoC = async () => {
				if (!window.PhysicsHelperRapier) { console.warn('Rapier PoC not loaded'); return; }
				const rap = PhysicsHelperRapier;
				const rph = await rap.createWorld();
				if (!rph) { console.warn('Rapier init failed'); return; }
				// remove current physics bodies
				this.dice.forEach(d => { try { this.world._world && this.world._world.removeBody && this.world._world.removeBody(d.body); } catch (e) { } });
				// create rapier bowl and dice (note: PoC returns rapier rigid bodies)
				const bowl = rap.createBowlCollider(rph.world, null);
				this.dice = [];
				const diceCount = this.diceCfg.count || 3;
				for (let i = 0; i < diceCount; i++) {
					const x = (i - (diceCount - 1) / 2) * (this.diceCfg.spacing || 1.6);
					const pos = new THREE.Vector3(x, this.diceCfg.initialHeight || 5, 0);
					const rb = rap.createDiceBody(rph.world, null, pos, this.diceCfg.size || 1);
					this.dice.push({ mesh: null, body: rb });
				}
				this.world = rph.world;
				console.log('Switched to Rapier PoC world');
			};
		}

		createBowlMesh() {
			const cfg = window.AppConfig || {};
			const bowlCfg = cfg.bowl || {};
			const flatCfg = (bowlCfg && bowlCfg.flatBottom) || {};
			let profile;
			if (bowlCfg.sphere && bowlCfg.sphere.enabled) {
				// create inner + outer hemisphere geometries to represent a shell with thickness
				const r = bowlCfg.sphere.radius || 6.0; // outer radius
				const thickness = (bowlCfg.sphere.thickness != null) ? bowlCfg.sphere.thickness : 0.3;
				const innerR = Math.max(0.001, r - thickness);
				// 球殻の開始角は openingY のみで決定（flatBottom に影響させない）
				const flatRadius = (flatCfg.enabled && flatCfg.radius) ? flatCfg.radius : 0;
				const openingY = (bowlCfg.sphere && bowlCfg.sphere.openingY != null) ? bowlCfg.sphere.openingY : 0.0;
				const thetaStart = Math.acos(Math.max(-1, Math.min(1, openingY / r))); // openingY=0 => PI/2
				const thetaLength = Math.max(0.0001, Math.PI - thetaStart); // 開口から底まで
				const widthSeg = bowlCfg.angularSegments || 128;
				const heightSeg = Math.max(8, Math.floor((bowlCfg.sphere.sampleCount || 72) / 2));
				const outerG = new THREE.SphereGeometry(r, widthSeg, heightSeg, 0, Math.PI * 2, thetaStart, thetaLength);
				const innerG = new THREE.SphereGeometry(innerR, widthSeg, heightSeg, 0, Math.PI * 2, thetaStart, thetaLength);
				outerG.computeVertexNormals(); innerG.computeVertexNormals();
				if (typeof outerG.computeBoundingSphere === 'function') outerG.computeBoundingSphere();
				if (typeof innerG.computeBoundingSphere === 'function') innerG.computeBoundingSphere();
				// build meshes: inner uses BackSide, outer uses FrontSide so shell looks solid
				const outerMat = new THREE.MeshStandardMaterial({ color: bowlCfg.centerCover && bowlCfg.centerCover.visual && bowlCfg.centerCover.visual.color ? bowlCfg.centerCover.visual.color : 0xA1887F, roughness: 0.72, metalness: 0.08, side: THREE.FrontSide });
				const innerMat = new THREE.MeshStandardMaterial({ color: bowlCfg.centerCover && bowlCfg.centerCover.visual && bowlCfg.centerCover.visual.color ? bowlCfg.centerCover.visual.color : 0xA1887F, roughness: 0.6, metalness: 0.05, side: THREE.BackSide });
				const outerMesh = new THREE.Mesh(outerG, outerMat);
				const innerMesh = new THREE.Mesh(innerG, innerMat);
				outerMesh.castShadow = true; outerMesh.receiveShadow = true;
				innerMesh.castShadow = false; innerMesh.receiveShadow = true;
				const group = new THREE.Group();
				group.add(outerMesh);
				group.add(innerMesh);
				// add a thin ring at the opening to hide the seam between inner and outer shells
				try {
					const rOuterAtOpening = Math.sqrt(Math.max(0, r * r - openingY * openingY));
					const rInnerAtOpening = Math.sqrt(Math.max(0, innerR * innerR - openingY * openingY));
					if (rOuterAtOpening > rInnerAtOpening + 0.001) {
						const ringGeom = new THREE.RingGeometry(rInnerAtOpening, rOuterAtOpening, widthSeg);
						if (typeof ringGeom.computeBoundingSphere === 'function') ringGeom.computeBoundingSphere();
						const ringMat = new THREE.MeshStandardMaterial({ color: bowlCfg.centerCover && bowlCfg.centerCover.visual && bowlCfg.centerCover.visual.color ? bowlCfg.centerCover.visual.color : 0xA1887F, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.1 });
						const ring = new THREE.Mesh(ringGeom, ringMat);
						ring.rotation.x = -Math.PI / 2;
						ring.position.y = openingY + 0.001; // slight offset to avoid z-fighting
						ring.receiveShadow = true;
						group.add(ring);
					}
				} catch (e) { /* non-critical: continue without ring */ }

				// フラットな底面（見た目）
				if (flatRadius > 0 && flatCfg.enabled) {
					const flatGeom = new THREE.CircleGeometry(flatRadius, widthSeg);
					const flatMat = new THREE.MeshStandardMaterial({ color: bowlCfg.centerCover && bowlCfg.centerCover.visual && bowlCfg.centerCover.visual.color ? bowlCfg.centerCover.visual.color : 0xA1887F, roughness: 0.7, metalness: 0.1 });
					const flatMesh = new THREE.Mesh(flatGeom, flatMat);
					flatMesh.rotation.x = -Math.PI / 2;
					flatMesh.position.y = -Math.sqrt(Math.max(0, r * r - flatRadius * flatRadius)) + 0.001;
					flatMesh.receiveShadow = true;
					group.add(flatMesh);
				}
				// set profile so later code remains safe (use inner radius for profile sampling)
				profile = [new THREE.Vector2(0, -innerR)];
				var g = group;
			} else {
				profile = (bowlCfg.profilePoints || [{ r: 0.1, y: -2.2 }, { r: 3.0, y: -1.5 }, { r: 6.0, y: 2.0 }]).map(p => new THREE.Vector2(p.r, p.y));
				const segments = bowlCfg.angularSegments || 128;
				var g = new THREE.LatheGeometry(profile, segments);
				g.computeVertexNormals();
				if (typeof g.computeBoundingSphere === 'function') g.computeBoundingSphere();
			}
			// prefer BackSide for sphere interior so the inner surface is visible
			const useBack = bowlCfg.sphere && bowlCfg.sphere.enabled;
			let mesh;
			if (g.type === 'Group') {
				// already created inner/outer meshes; ensure they receive/cast shadows and have bounding data
				g.traverse(child => {
					if (child.isMesh) {
						child.receiveShadow = true; child.castShadow = true;
						if (child.geometry && typeof child.geometry.computeBoundingSphere === 'function') child.geometry.computeBoundingSphere();
					}
				});
				mesh = g;
			} else {
				const m = new THREE.MeshStandardMaterial({ color: bowlCfg.centerCover && bowlCfg.centerCover.visual && bowlCfg.centerCover.visual.color ? bowlCfg.centerCover.visual.color : 0xA1887F, roughness: 0.7, metalness: 0.1, side: useBack ? THREE.BackSide : THREE.DoubleSide });
				if (g && g.computeBoundingSphere && typeof g.computeBoundingSphere === 'function') g.computeBoundingSphere();
				mesh = new THREE.Mesh(g, m);
				mesh.receiveShadow = true;
			}
			// add optional visual center cover to hide hole
			const profileStartsAtZero = profile.length && profile[0].x === 0;
			if (!profileStartsAtZero && bowlCfg.centerCover && bowlCfg.centerCover.enabled && bowlCfg.centerCover.visual && bowlCfg.centerCover.visual.enabled) {
				// ensure cap is at least large enough to cover the first ring tile gap
				const radialSlices = bowlCfg.radialSlices || 16;
				const maxR = bowlCfg.maxR || 6.0;
				const firstRingOuter = (1 / radialSlices) * maxR; // outer radius of first radial slice
				const autoRadius = firstRingOuter + 0.02;
				const configured = (bowlCfg.centerCover.visual.radius != null) ? bowlCfg.centerCover.visual.radius : 0.5;
				const radius = Math.max(configured, autoRadius);
				const color = bowlCfg.centerCover.visual.color || 0xA1887F;
				const capGeom = new THREE.CircleGeometry(radius, 32);
				if (typeof capGeom.computeBoundingSphere === 'function') capGeom.computeBoundingSphere();
				const capMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: 0.1 });
				const cap = new THREE.Mesh(capGeom, capMat);
				cap.rotation.x = -Math.PI / 2;
				cap.position.y = profile[0].y + 0.01; // slightly above to avoid z-fighting
				cap.receiveShadow = true;
				if (mesh.type === 'Group') mesh.add(cap); else mesh.add(cap);
			}
			return mesh;
		}

		createDice(position) {
			const size = (this.diceCfg && this.diceCfg.size) || 1;
			const half = size / 2;
			const g = new THREE.BoxGeometry(size, size, size);
			if (g && typeof g.computeBoundingSphere === 'function') g.computeBoundingSphere();
			if (g && typeof g.computeBoundingBox === 'function') g.computeBoundingBox();
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

			// place dice so they don't overlap, add a little random jitter
			const separationThrow = this.diceCfg.spacing || 1.6;
			const jitterXMax = this.diceCfg.jitterX || 0.2;
			const jitterZMax = this.diceCfg.jitterZ || 0.6;
			const velScale = this.diceCfg.initialVelocityScale || 4;
			const angScale = this.diceCfg.angularVelocityScale || 15;
			this.dice.forEach((d, i) => {
				const b = d.body;
				const jitterX = (Math.random() - 0.5) * jitterXMax;
				const jitterZ = (Math.random() - 0.5) * jitterZMax;
				const x = (i - (this.dice.length - 1) / 2) * separationThrow + jitterX;
				const z = jitterZ;
				b.position.set(x, this.diceCfg.initialHeight || 5, z);
				if (b.quaternion) b.quaternion.set(0, 0, 0, 1);
				// 前回の力・トルクをクリア
				if (b.force) b.force.set(0, 0, 0);
				if (b.torque) b.torque.set(0, 0, 0);
				b.velocity.set((Math.random() - 0.5) * velScale, 0, (Math.random() - 0.5) * velScale);
				b.angularVelocity.set((Math.random() - 0.5) * angScale, (Math.random() - 0.5) * angScale, (Math.random() - 0.5) * angScale);
				// スリープ中だと動かないため必ず起こす
				if (typeof b.wakeUp === 'function') b.wakeUp();
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
			// 不規則なフレーム間隔でも安定するようサブステップを許容
			this.world.step(1 / 60, undefined, (this.cfg && this.cfg.physics && this.cfg.physics.maxSubSteps) || 5);
			// 疑似転がり摩擦（微小トルク）＋適応ダンピング
			const rft = (this.diceCfg && this.diceCfg.rollingFrictionTorque) || 0;
			const adCfg = (this.cfg && this.cfg.physics && this.cfg.physics.adaptiveDamping) || {};
			this.dice.forEach(d => {
				const b = d.body;
				if (b.angularVelocity) {
					const av = b.angularVelocity;
					const len = av.length();
					let dampingFactor = 1.0;
					// 賢い適応ダンピング: 角速度が高いときに強化
					if (adCfg.enabled && len > (adCfg.angularThreshold || 0.5)) {
						dampingFactor = adCfg.boostFactor || 2.0;
					}
					// 転がり摩擦トルク
					if (rft > 0 && len > 1e-3) {
						const k = -rft * dampingFactor; // 減衰方向
						b.torque.x += k * av.x;
						b.torque.y += k * av.y;
						b.torque.z += k * av.z;
					}
					// 適応角ダンピング
					if (adCfg.enabled && len > 1e-3) {
						const ad = (this.diceCfg && this.diceCfg.angularDamping) || 0.01;
						const extraDamp = ad * (dampingFactor - 1.0);
						b.angularDamping = ad + extraDamp;
					}
				}
				// 見た目更新
				d.mesh.position.copy(b.position);
				d.mesh.quaternion.copy(b.quaternion);
			});
			if (this.isCheckingResult) {
				// wait until all dice have settled, then show each top face
				let allStill = true;
				for (let i = 0; i < this.dice.length; i++) {
					const db = this.dice[i].body;
					if (db.angularVelocity.length() > (this.uiCfg.resultAngularThreshold || 0.1) || db.velocity.length() > (this.uiCfg.resultVelocityThreshold || 0.1)) { allStill = false; break; }
				}
				if (allStill) {
					const faces = this.dice.map(d => this.getDiceFace(d.mesh));
					this.resultElement.textContent = faces.join(', ');
					this.isCheckingResult = false;
				}
			}
			try {
				// Pre-render sanitization: ensure geometries and texture maps have the fields three.js expects
				this.scene.traverse(obj => {
					if (obj.isMesh) {
						if (obj.geometry) {
							if (!obj.geometry.boundingSphere && typeof obj.geometry.computeBoundingSphere === 'function') obj.geometry.computeBoundingSphere();
							if (!obj.geometry.boundingBox && typeof obj.geometry.computeBoundingBox === 'function') obj.geometry.computeBoundingBox();
						}
						const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
						mats.forEach(m => {
							if (!m) return;
							if (m.map) {
								if (m.map.center === undefined || m.map.center === null) m.map.center = new THREE.Vector2(0.5, 0.5);
							}
						});
					}
				});
				this.renderer.render(this.scene, this.camera);
			} catch (err) {
				console.error('Render error caught:', err);
				// Inspect scene to find potential culprit meshes/geometry
				this.scene.traverse(obj => {
					if (obj.isMesh) {
						if (obj.geometry && !obj.geometry.boundingSphere) console.warn('Mesh missing boundingSphere', obj);
						const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
						mats.forEach(m => {
							if (!m) return;
							if (m.map && (m.map.center === undefined || m.map.center === null)) console.warn('Material map missing center', obj, m.map);
						});
					}
				});
				throw err;
			}
		}

		onWindowResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }
	}

	window.DiceRollerApp = DiceRollerApp;
})();
