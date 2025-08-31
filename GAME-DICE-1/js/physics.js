(function () {
	// Minimal physics helper for Dice app
	function createWorld() {
		const cfg = window.AppConfig || {};
		const pCfg = cfg.physics || {};
		const world = new CANNON.World();
		const g = pCfg.gravity || { x: 0, y: -9.82, z: 0 };
		world.gravity.set(g.x, g.y, g.z);
		if (CANNON.SAPBroadphase) world.broadphase = new CANNON.SAPBroadphase(world);
		else world.broadphase = new CANNON.NaiveBroadphase();
		world.solver.iterations = pCfg.solverIterations || 40;

		const defaultMaterial = new CANNON.Material('defaultMaterial');
		const diceMaterial = new CANNON.Material('diceMaterial');
		const contactCfg = pCfg.contact || { friction: 0.4, restitution: 0.1 };
		const contact = new CANNON.ContactMaterial(diceMaterial, defaultMaterial, contactCfg);
		world.addContactMaterial(contact);

		return { world, defaultMaterial, diceMaterial };
	}

	function createBowlCollider(world, defaultMaterial, opts) {
		opts = opts || {};
		const cfg = window.AppConfig || {};
		const bowlCfg = cfg.bowl || {};
		const profilePoints = opts.profilePoints || bowlCfg.profilePoints || [{ r: 0.1, y: -2.2 }, { r: 3.0, y: -1.5 }, { r: 6.0, y: 2.0 }];
		const maxR = opts.maxR || bowlCfg.maxR || 6.0;
		const radialSlices = opts.radialSlices || bowlCfg.radialSlices || 16;
		const angularSegments = opts.angularSegments || bowlCfg.angularSegments || 48;

		function sampleProfile(r) {
			if (r <= profilePoints[0].r) return profilePoints[0].y;
			for (let i = 0; i < profilePoints.length - 1; i++) {
				const a = profilePoints[i];
				const b = profilePoints[i + 1];
				if (r >= a.r && r <= b.r) {
					const t = (r - a.r) / (b.r - a.r);
					return a.y * (1 - t) + b.y * t;
				}
			}
			return profilePoints[profilePoints.length - 1].y;
		}

		const bowlBody = new CANNON.Body({ mass: 0, material: defaultMaterial });
		let tileCount = 0;

		for (let r = 0; r < radialSlices; r++) {
			const rInner = (r / radialSlices) * maxR;
			const rOuter = ((r + 1) / radialSlices) * maxR;
			const rMid = (rInner + rOuter) / 2;
			const arcApprox = (2 * Math.PI * Math.max(rMid, 0.001)) / angularSegments;
			const tileHalfX = Math.max(arcApprox / 2, 0.05);
			const tileHalfZ = Math.max((rOuter - rInner) / 2, 0.05);
			const tileHalfY = opts.tileHalfY || bowlCfg.tileHalfY || 0.25;

			for (let a = 0; a < angularSegments; a++) {
				const theta = (a / angularSegments) * Math.PI * 2;
				const x = rMid * Math.cos(theta);
				const z = rMid * Math.sin(theta);
				const y = sampleProfile(rMid);

				const box = new CANNON.Box(new CANNON.Vec3(tileHalfX, tileHalfY, tileHalfZ));
				const localOffset = new CANNON.Vec3(x, y - tileHalfY, z);
				bowlBody.addShape(box, localOffset);
				tileCount++;
			}
		}

		bowlBody.updateMassProperties();
		world.addBody(bowlBody);
		return { bowlBody, tileCount };
	}

	function createDiceBody(world, diceMaterial, position, size) {
		size = size || 1;
		const half = size / 2;
		const shape = new CANNON.Box(new CANNON.Vec3(half, half, half));
		const body = new CANNON.Body({ mass: 1, position: new CANNON.Vec3(position.x, position.y, position.z), material: diceMaterial });
		body.addShape(shape);
		body.linearDamping = 0.01;
		body.angularDamping = 0.01;
		world.addBody(body);
		return body;
	}

	window.PhysicsHelper = {
		createWorld,
		createBowlCollider,
		createDiceBody
	};
})();
