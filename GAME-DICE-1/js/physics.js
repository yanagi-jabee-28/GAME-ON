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
		const radialSlices = opts.radialSlices || bowlCfg.radialSlices || 32;
		const angularSegments = opts.angularSegments || bowlCfg.angularSegments || 128;
		const useSphere = bowlCfg.sphere && bowlCfg.sphere.enabled;
		const sphereR = (bowlCfg.sphere && bowlCfg.sphere.radius) || maxR;
		const sphereOpeningY = (bowlCfg.sphere && bowlCfg.sphere.openingY != null) ? bowlCfg.sphere.openingY : 2.0;

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
				let y;
				if (useSphere) {
					// compute y on inner sphere surface for radius rMid
					// sphere eq: x^2 + y^2 + z^2 = sphereR^2 -> for given rMid (distance in xz plane), y = -sqrt(R^2 - rMid^2)
					if (rMid > sphereR) continue; // outside sphere
					y = -Math.sqrt(Math.max(0, sphereR * sphereR - rMid * rMid));
					// if that y is above opening, skip (we only want inner surface up to openingY)
					if (y > sphereOpeningY) continue;
					// ensure inner-most ring (r==0) covers center by forcing rMid small
					if (r === 0 && rInner === 0) {
						// add an extra small central box to guarantee coverage
						const coverBox = new CANNON.Box(new CANNON.Vec3(0.05, tileHalfY, 0.05));
						bowlBody.addShape(coverBox, new CANNON.Vec3(0, sampleProfile(0) + tileHalfY, 0));
						tileCount++;
					}
				} else {
					y = sampleProfile(rMid);
				}

				const box = new CANNON.Box(new CANNON.Vec3(tileHalfX, tileHalfY, tileHalfZ));
				const localOffset = new CANNON.Vec3(x, y - tileHalfY, z);
				bowlBody.addShape(box, localOffset);
				tileCount++;
			}
		}

		// optionally add a small central physics cover to avoid a hole at the center
		try {
			const globalCfg = window.AppConfig || {};
			const centerCfg = (globalCfg.bowl && globalCfg.bowl.centerCover && globalCfg.bowl.centerCover.physics) || {};
			if (centerCfg.enabled) {
				// skip if profile already starts at r=0 (no hole)
				const minR = (profilePoints && profilePoints.length) ? profilePoints[0].r : 0.0;
				if (minR <= 0) {
					console.log('Profile covers center; skipping physics center cover');
				} else {
					// compute radius to cover first ring
					const bowlCfg = globalCfg.bowl || {};
					const cfgRadial = bowlCfg.radialSlices || radialSlices || 16;
					const cfgMaxR = bowlCfg.maxR || maxR || 6.0;
					const firstRingOuter = (1 / cfgRadial) * cfgMaxR;
					const coverRadius = Math.max(centerCfg.size || 0.3, firstRingOuter + 0.01);
					// use a thin cylinder approximation by stacking many thin boxes since cannon.js may lack cylinder shape
					const layers = 2;
					const layerHeight = (centerCfg.size || 0.3) / layers;
					for (let li = 0; li < layers; li++) {
						const halfY = layerHeight / 2;
						const box = new CANNON.Box(new CANNON.Vec3(coverRadius, halfY, coverRadius));
						const y = sampleProfile(0) + halfY + li * (layerHeight);
						bowlBody.addShape(box, new CANNON.Vec3(0, y, 0));
						tileCount++;
					}
				}
			}
		} catch (e) { console.warn('Could not add center physics cover', e); }

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
