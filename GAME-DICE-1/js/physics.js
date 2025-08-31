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
		let maxR = opts.maxR || bowlCfg.maxR || 6.0;
		const radialSlices = opts.radialSlices || bowlCfg.radialSlices || 32;
		const angularSegments = opts.angularSegments || bowlCfg.angularSegments || 128;
		const useSphere = bowlCfg.sphere && bowlCfg.sphere.enabled;
		const sphereR = (bowlCfg.sphere && bowlCfg.sphere.radius) || maxR;
		const sphereThickness = (bowlCfg.sphere && (bowlCfg.sphere.thickness != null)) ? bowlCfg.sphere.thickness : 0.3;
		const sphereInnerR = Math.max(0.001, sphereR - sphereThickness);
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

		// when using sphere mode, align radial sampling to the sphere radius
		if (useSphere) maxR = sphereR;

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
					// create a single shell tile spanning inner->outer surface so thickness config matters
					if (rMid > sphereR) continue; // outside outer sphere
					// outer surface y (negative downward)
					const yOuter = -Math.sqrt(Math.max(0, sphereR * sphereR - rMid * rMid));
					// inner surface y (if within inner radius), else clamp to outer
					const yInner = (rMid <= sphereInnerR) ? -Math.sqrt(Math.max(0, sphereInnerR * sphereInnerR - rMid * rMid)) : yOuter;
					// skip if above opening
					if (yOuter > sphereOpeningY) continue;
					// compute box half-height as half the shell thickness at this ring
					// prefer configured sphereThickness/2 so config controls overall thickness
					let impliedHalf = Math.abs((yOuter - yInner) / 2);
					const configHalf = Math.max(0.01, sphereThickness / 2);
					let halfHeight = Math.max(impliedHalf, configHalf);
					const centerY = (yOuter + yInner) / 2;
					const shellBox = new CANNON.Box(new CANNON.Vec3(tileHalfX, halfHeight, tileHalfZ));
					bowlBody.addShape(shellBox, new CANNON.Vec3(x, centerY, z));
					tileCount++;
					// ensure center coverage for r==0 when profile indicates a hole
					if (r === 0 && rInner === 0) {
						const coverBox = new CANNON.Box(new CANNON.Vec3(0.05, halfHeight, 0.05));
						bowlBody.addShape(coverBox, new CANNON.Vec3(0, (yInner + yOuter) / 2, 0));
						tileCount++;
					}
				} else {
					y = sampleProfile(rMid);
					// add simple flat tile for lathe/profile mode
					const box = new CANNON.Box(new CANNON.Vec3(tileHalfX, tileHalfY, tileHalfZ));
					const localOffset = new CANNON.Vec3(x, y - tileHalfY, z);
					bowlBody.addShape(box, localOffset);
					tileCount++;
				}
			}
		}

		// optionally add a small central physics cover to avoid a hole at the center
		try {
			const globalCfg = window.AppConfig || {};
			const centerCfg = (globalCfg.bowl && globalCfg.bowl.centerCover && globalCfg.bowl.centerCover.physics) || {};
			if (centerCfg.enabled) {
				// skip if profile already starts at r=0 (no hole)
				const minR = (profilePoints && profilePoints.length) ? profilePoints[0].r : 0.0;
				if (useSphere) {
					// sphere-mode: add a center cover sized by sphereThickness
					const coverRadius = Math.max(centerCfg.size || 0.3, (1 / (bowlCfg && bowlCfg.radialSlices ? bowlCfg.radialSlices : radialSlices)) * (bowlCfg && bowlCfg.maxR ? bowlCfg.maxR : maxR) + 0.01);
					const halfY = Math.max(0.01, sphereThickness / 2);
					const coverBox = new CANNON.Box(new CANNON.Vec3(coverRadius, halfY, coverRadius));
					// center between outer and inner surfaces at r=0
					const yOuter = -sphereR;
					const yInner = -sphereInnerR;
					const centerY = (yOuter + yInner) / 2;
					bowlBody.addShape(coverBox, new CANNON.Vec3(0, centerY, 0));
					tileCount++;
				} else {
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
