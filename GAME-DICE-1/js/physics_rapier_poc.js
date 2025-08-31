// Rapier PoC wrapper
// Usage:
// 1) Load Rapier WASM/JS in index.html before this script. Example (cdn):
//    <script src="https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.10.0/rapier3d.wasm.js"></script>
// 2) Load this script.
// 3) Call `await PhysicsHelperRapier.createWorld()` to get { world, defaultMaterial, diceMaterial }
// 4) The returned object provides `world.step(dt)` and the helper createDiceBody/createBowlCollider functions.

(function () {
	async function initRapierIfNeeded() {
		// Try several common globals where Rapier may be attached by different builds
		function getGlobalRapier() {
			return window.RAPIER || window.Rapier || window.rapier || window.rapier3d || window.Rapier3d || window.rapier3d_wasm;
		}
		let R = getGlobalRapier();
		if (!R) {
			// Poll for a short time to allow the wasm script to initialize
			const start = Date.now();
			const timeout = 5000; // ms
			while (!R && (Date.now() - start) < timeout) {
				await new Promise(r => setTimeout(r, 100));
				R = getGlobalRapier();
			}
		}
		if (!R) {
			console.warn('Rapier not found on window (checked RAPIER/Rapier/rapier3d). Load Rapier before using the PoC.');
			return null;
		}
		// Some builds expose an async init function
		if (typeof R.init === 'function') {
			try { await R.init(); } catch (e) { console.warn('Rapier init() failed', e); }
		}
		return R;
	}

	async function createWorld() {
		const R = await initRapierIfNeeded();
		if (!R) return null;
		const cfg = window.AppConfig || {};
		const pCfg = cfg.physics || {};
		const g = pCfg.gravity || { x: 0, y: -9.82, z: 0 };
		// Rapier World takes gravity vector
		const world = new R.World({ x: g.x, y: g.y, z: g.z });

		// Helper wrapper so app code can call world.step(dt)
		const wrapper = {
			_world: world,
			step: function (dt, unused, maxSubSteps) {
				// Rapier expects a fixed dt per step; run multiple substeps if needed
				const stepDt = dt || 1 / 60;
				const steps = Math.max(1, Math.ceil((dt || stepDt) / stepDt));
				for (let i = 0; i < Math.max(1, maxSubSteps || 1); i++) {
					this._world.timestep();
				}
			}
		};

		return { world: wrapper, defaultMaterial: {}, diceMaterial: {} };
	}

	function createDiceBody(worldWrapper, diceMaterial, position, size) {
		// Basic PoC: create a dynamic rigid body with a cuboid and corner balls as colliders
		const R = window.RAPIER;
		if (!R) return null;
		size = size || 1;
		const half = size / 2;
		const bodyDesc = R.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z);
		const rb = worldWrapper._world.createRigidBody(bodyDesc);
		// core box
		const core = R.ColliderDesc.cuboid(half, half, half);
		worldWrapper._world.createCollider(core, rb);
		// corner balls
		const r = Math.max(0.01, Math.min((window.AppConfig && window.AppConfig.dice && window.AppConfig.dice.cornerRadius) || 0.12, half - 0.01));
		const ball = R.ColliderDesc.ball(r);
		const offs = [-1, 1];
		for (let ix of offs) for (let iy of offs) for (let iz of offs) {
			const tx = ix * (half - r);
			const ty = iy * (half - r);
			const tz = iz * (half - r);
			worldWrapper._world.createCollider(ball.setTranslation(tx, ty, tz), rb);
		}
		return rb; // Rapier rigid body handle
	}

	function createBowlCollider(worldWrapper, defaultMaterial, opts) {
		// PoC: approximate bowl by creating many static cuboid colliders attached to a single fixed rigid body
		const R = window.RAPIER;
		opts = opts || {};
		const cfg = window.AppConfig || {};
		const bowlCfg = cfg.bowl || {};
		const profilePoints = opts.profilePoints || bowlCfg.profilePoints || [{ r: 0.1, y: -2.2 }, { r: 3.0, y: -1.5 }, { r: 6.0, y: 2.0 }];
		let maxR = opts.maxR || bowlCfg.maxR || 6.0;
		const radialSlices = opts.radialSlices || bowlCfg.radialSlices || 32;
		const angularSegments = opts.angularSegments || bowlCfg.angularSegments || 128;
		const useSphere = bowlCfg.sphere && bowlCfg.sphere.enabled;
		const sphereR = (bowlCfg.sphere && bowlCfg.sphere.radius) || maxR;

		const bodyDesc = R.RigidBodyDesc.fixed();
		const rb = worldWrapper._world.createRigidBody(bodyDesc);

		for (let r = 0; r < radialSlices; r++) {
			const rInner = (r / radialSlices) * maxR;
			const rOuter = ((r + 1) / radialSlices) * maxR;
			const rMid = (rInner + rOuter) / 2;
			for (let a = 0; a < angularSegments; a++) {
				const theta = (a / angularSegments) * Math.PI * 2;
				const x = rMid * Math.cos(theta);
				const z = rMid * Math.sin(theta);
				let y;
				if (useSphere) {
					if (rMid > sphereR) continue;
					y = -Math.sqrt(Math.max(0, sphereR * sphereR - rMid * rMid));
					const tileHalfX = 0.1;
					const tileHalfZ = Math.max((rOuter - rInner) / 2, 0.05);
					const tileHalfY = 0.2;
					const col = R.ColliderDesc.cuboid(tileHalfX, tileHalfY, tileHalfZ).setTranslation(x, y - tileHalfY, z);
					worldWrapper._world.createCollider(col, rb);
				} else {
					y = sampleProfile(rMid);
					const tileHalfX = 0.1;
					const tileHalfZ = Math.max((rOuter - rInner) / 2, 0.05);
					const tileHalfY = 0.25;
					const col = R.ColliderDesc.cuboid(tileHalfX, tileHalfY, tileHalfZ).setTranslation(x, y - tileHalfY, z);
					worldWrapper._world.createCollider(col, rb);
				}
			}
		}

		return { bowlBody: rb, tileCount: radialSlices * angularSegments };
	}

	window.PhysicsHelperRapier = {
		createWorld,
		createDiceBody,
		createBowlCollider
	};
})();
