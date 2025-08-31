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
		// Back-compat single contact or pair-specific contacts
		const contacts = pCfg.contacts || {};
		const legacy = pCfg.contact || { friction: 0.4, restitution: 0.1 };
		const diceVsBowlCfg = contacts.diceVsBowl || legacy;
		const diceVsDiceCfg = contacts.diceVsDice || legacy;
		const defaultCfg = contacts.default || legacy;
		// Apply default world contact baseline when available
		if (world.defaultContactMaterial) {
			if (defaultCfg.friction != null) world.defaultContactMaterial.friction = defaultCfg.friction;
			if (defaultCfg.restitution != null) world.defaultContactMaterial.restitution = defaultCfg.restitution;
		}
		// Dice vs Bowl (bowl uses defaultMaterial)
		world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, defaultMaterial, diceVsBowlCfg));
		// Dice vs Dice
		world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, diceVsDiceCfg));

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
		const cfg = (window.AppConfig && window.AppConfig.dice) || {};
		const half = size / 2;
		const r = Math.max(0, Math.min(cfg.cornerRadius != null ? cfg.cornerRadius : 0.12, half - 0.01)); // keep a small core
		const body = new CANNON.Body({ mass: 1, position: new CANNON.Vec3(position.x, position.y, position.z), material: diceMaterial });

		if (r > 0) {
			// Rounded cube as compound: core box + edge cylinders + corner spheres
			const core = new CANNON.Box(new CANNON.Vec3(half - r, half - r, half - r));
			body.addShape(core, new CANNON.Vec3(0, 0, 0));

			// Corner spheres (8)
			const cornerSphere = new CANNON.Sphere(r);
			const offs = [-1, 1];
			for (let ix of offs) for (let iy of offs) for (let iz of offs) {
				body.addShape(
					cornerSphere,
					new CANNON.Vec3(ix * (half - r), iy * (half - r), iz * (half - r))
				);
			}

			// Edge cylinders (12) if available
			try {
				if (CANNON.Cylinder) {
					const segs = Math.max(6, cfg.edgeSegments || 8);
					const edgeLen = size - 2 * r; // cylinder height
					const cylY = new CANNON.Cylinder(r, r, edgeLen, segs); // axis along Y by default
					const qX = new CANNON.Quaternion(); // rotate Y->X
					qX.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
					const qZ = new CANNON.Quaternion(); // rotate Y->Z
					qZ.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);

					// Along X edges: centers at (0, ±(half-r), ±(half-r))
					for (let iy of offs) for (let iz of offs) {
						body.addShape(cylY, new CANNON.Vec3(0, iy * (half - r), iz * (half - r)), qX);
					}
					// Along Y edges: centers at (±(half-r), 0, ±(half-r)) — no rotation
					for (let ix of offs) for (let iz of offs) {
						body.addShape(cylY, new CANNON.Vec3(ix * (half - r), 0, iz * (half - r)));
					}
					// Along Z edges: centers at (±(half-r), ±(half-r), 0)
					for (let ix of offs) for (let iy of offs) {
						body.addShape(cylY, new CANNON.Vec3(ix * (half - r), iy * (half - r), 0), qZ);
					}
				}
			} catch (e) {
				console.warn('CANNON.Cylinder not available; using spheres-only rounding');
			}
		} else {
			// Fallback: plain box
			const shape = new CANNON.Box(new CANNON.Vec3(half, half, half));
			body.addShape(shape);
		}

		body.linearDamping = (cfg.linearDamping != null) ? cfg.linearDamping : 0.01;
		body.angularDamping = (cfg.angularDamping != null) ? cfg.angularDamping : 0.01;
		world.addBody(body);
		return body;
	}

	window.PhysicsHelper = {
		createWorld,
		createBowlCollider,
		createDiceBody
	};
})();
