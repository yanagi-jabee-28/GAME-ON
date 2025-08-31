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
		// スリープを有効化（低速で静止へ移行しやすくする）
		world.allowSleep = true;

		// 数値安定性: 四元数正規化を強制
		if (typeof world.quatNormalizeFast !== 'undefined') world.quatNormalizeFast = true;
		if (typeof world.quatNormalizeSkip !== 'undefined') world.quatNormalizeSkip = 0;

		const defaultMaterial = new CANNON.Material('defaultMaterial');
		const diceMaterial = new CANNON.Material('diceMaterial');
		// Back-compat single contact or pair-specific contacts
		const contacts = pCfg.contacts || {};
		const legacy = pCfg.contact || { friction: 0.4, restitution: 0.1 };
		const diceVsBowlCfg = contacts.diceVsBowl || legacy;
		const diceVsDiceCfg = contacts.diceVsDice || legacy;
		const defaultCfg = contacts.default || legacy;
		function buildContactOptions(src) {
			const o = {};
			const base = {
				contactEquationStiffness: pCfg.contactEquationStiffness,
				contactEquationRelaxation: pCfg.contactEquationRelaxation,
				frictionEquationStiffness: pCfg.frictionEquationStiffness,
				frictionEquationRelaxation: pCfg.frictionEquationRelaxation
			};
			const srcAll = Object.assign({}, base, src || {});
			if (srcAll.friction != null) o.friction = srcAll.friction;
			if (srcAll.restitution != null) o.restitution = srcAll.restitution;
			if (srcAll.contactEquationStiffness != null) o.contactEquationStiffness = srcAll.contactEquationStiffness;
			if (srcAll.contactEquationRelaxation != null) o.contactEquationRelaxation = srcAll.contactEquationRelaxation;
			if (srcAll.frictionEquationStiffness != null) o.frictionEquationStiffness = srcAll.frictionEquationStiffness;
			if (srcAll.frictionEquationRelaxation != null) o.frictionEquationRelaxation = srcAll.frictionEquationRelaxation;
			return o;
		}
		// Apply default world contact baseline when available
		// 明示的にデフォルトの ContactMaterial を作り、世界に登録する。
		// これによりライブラリ標準の接触処理（摩擦・反発・剛性）が適切に使われる。
		try {
			const defaultContactMat = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, buildContactOptions(defaultCfg));
			world.defaultContactMaterial = defaultContactMat;
			world.addContactMaterial(defaultContactMat);
		} catch (e) {
			// 古い cannon ビルド等で問題が出た場合はフォールバックして既存の値に書き込む
			if (world.defaultContactMaterial) {
				if (defaultCfg.friction != null) world.defaultContactMaterial.friction = defaultCfg.friction;
				if (defaultCfg.restitution != null) world.defaultContactMaterial.restitution = defaultCfg.restitution;
			}
		}

		// ソルバの許容誤差を設定（小さくすると安定するがコストが上がる）
		world.solver.tolerance = (pCfg.solverTolerance != null) ? pCfg.solverTolerance : 1e-6;

		// World のステップ後フックで全体的な微調整（回転摩擦・速度クランプ等）を行う
		// 物理ステップ内で行うため、ライブラリの更新サイクルに沿った自然な挙動となる。
		try {
			const diceCfgGlobal = (window.AppConfig && window.AppConfig.dice) || {};
			const rollingFrictionGlobal = diceCfgGlobal.rollingFrictionTorque || 0;
			const maxLinearGlobal = diceCfgGlobal.maxLinearVelocity || 12.0;
			const maxAngularGlobal = diceCfgGlobal.maxAngularVelocity || 40.0;
			world.addEventListener('postStep', function () {
				for (let i = 0; i < world.bodies.length; i++) {
					const b = world.bodies[i];
					if (!b || b.mass <= 0) continue; // static body は無視
					// 線形速度のクランプ
					if (b.velocity) {
						const vm = b.velocity.length();
						if (vm > maxLinearGlobal) {
							b.velocity.scale(maxLinearGlobal / vm, b.velocity);
						}
					}
					// 角速度のクランプ
					if (b.angularVelocity) {
						const am = b.angularVelocity.length();
						if (am > maxAngularGlobal) {
							b.angularVelocity.scale(maxAngularGlobal / am, b.angularVelocity);
						}
					}
					// 疑似転がり摩擦トルク（微小トルクで回転を減衰）
					if (rollingFrictionGlobal > 0 && b.angularVelocity && b.angularVelocity.length() > 1e-4) {
						const av = b.angularVelocity;
						const k = -rollingFrictionGlobal;
						b.torque.x += k * av.x;
						b.torque.y += k * av.y;
						b.torque.z += k * av.z;
					}
					// tip-nudge: ほとんど静止して角・辺で止まりそうなサイコロを軽く揺らす
					try {
						const cfg = (window.AppConfig && window.AppConfig.dice) || {};
						const tn = cfg.tipNudge || {};
						if (tn.enabled && b.sleepState !== CANNON.Body.SLEEPING) {
							const vmag = (b.velocity && b.velocity.length()) || 0;
							const amag = (b.angularVelocity && b.angularVelocity.length()) || 0;
							if (vmag <= (tn.linearThreshold || 0.06) && amag <= (tn.angularThreshold || 0.06)) {
								// find most-upward face normal by testing body orientation against axis normals
								// use body.quaternion to compute world-space face normals for cube axes
								const q = b.quaternion;
								// candidate normals (cube local axes)
								const locals = [new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(-1, 0, 0), new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(0, -1, 0), new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(0, 0, -1)];
								let maxDot = -2; let maxIdx = -1; const up = new CANNON.Vec3(0, 1, 0);
								for (let li = 0; li < locals.length; li++) {
									const w = locals[li].clone();
									q.vmult(w, w); // rotate to world
									const d = w.dot(up);
									if (d > maxDot) { maxDot = d; maxIdx = li; }
								}
								// if top face is nearly vertical (edge/corner), apply small random torque
								if (maxDot < (tn.faceAlignThreshold || 0.92)) {
									const s = tn.nudgeStrength || 0.02;
									// small random torque perpendicular to up
									const rx = (Math.random() - 0.5) * s;
									const ry = (Math.random() - 0.5) * s;
									const rz = (Math.random() - 0.5) * s;
									b.torque.x += rx;
									b.torque.y += ry;
									b.torque.z += rz;
								}
							}
						}
					} catch (e) { /* ignore tip-nudge failures */ }
				}
			});
		} catch (e) { /* ignore if world events unsupported */ }
		// Dice vs Bowl (bowl uses defaultMaterial)
		world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, defaultMaterial, buildContactOptions(diceVsBowlCfg)));
		// Dice vs Dice
		world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, buildContactOptions(diceVsDiceCfg)));

		return { world, defaultMaterial, diceMaterial };
	}

	function createBowlCollider(world, defaultMaterial, opts) {
		opts = opts || {};
		const cfg = window.AppConfig || {};
		const bowlCfg = cfg.bowl || {};
		const flatCfg = (bowlCfg && bowlCfg.flatBottom) || {};
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
		// performance: cache created box shapes to avoid allocating many identical shapes
		const shapeCache = new Map();
		// precompute angular trig table to avoid Math.cos/sin in inner loops
		const angleCount = angularSegments || 32;
		const cosTable = new Array(angleCount);
		const sinTable = new Array(angleCount);
		for (let ai = 0; ai < angleCount; ai++) {
			const theta = (ai / angleCount) * Math.PI * 2;
			cosTable[ai] = Math.cos(theta);
			sinTable[ai] = Math.sin(theta);
		}

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
				const x = rMid * cosTable[a % angleCount];
				const z = rMid * sinTable[a % angleCount];
				let y;
				if (useSphere) {
					// create a single shell tile spanning inner->outer surface so thickness config matters
					if (rMid > sphereR) continue; // outside outer sphere
					// outer surface y (negative downward)
					const yOuter = -Math.sqrt(Math.max(0, sphereR * sphereR - rMid * rMid));
					// inner surface y (if within inner radius), else clamp to outer
					const yInner = (rMid <= sphereInnerR) ? -Math.sqrt(Math.max(0, sphereInnerR * sphereInnerR - rMid * rMid)) : yOuter;
					// skip if above opening（openingY のみで判断）
					if (yOuter > sphereOpeningY) continue;
					// フラット底の半径内は後で別プレートを置くので中⼼側リングをスキップ（高さ条件は変えない）
					const flatRadius = (flatCfg && flatCfg.enabled && flatCfg.radius) ? flatCfg.radius : 0;
					if (flatRadius > 0 && rOuter <= flatRadius) continue;
					// compute box half-height as half the shell thickness at this ring
					// prefer configured sphereThickness/2 so config controls overall thickness
					let impliedHalf = Math.abs((yOuter - yInner) / 2);
					const configHalf = Math.max(0.01, sphereThickness / 2);
					let halfHeight = Math.max(impliedHalf, configHalf);
					const centerY = (yOuter + yInner) / 2;
					// reuse boxes of same dimensions
					const key = Math.round(tileHalfX * 1000) + '_' + Math.round(halfHeight * 1000) + '_' + Math.round(tileHalfZ * 1000);
					let shellBox = shapeCache.get(key);
					if (!shellBox) {
						shellBox = new CANNON.Box(new CANNON.Vec3(tileHalfX, halfHeight, tileHalfZ));
						shapeCache.set(key, shellBox);
					}
					bowlBody.addShape(shellBox, new CANNON.Vec3(x, centerY, z));
					tileCount++;
					// ensure center coverage for r==0 when profile indicates a hole
					if (r === 0 && rInner === 0) {
						const coverKey = 'c_' + Math.round(0.05 * 1000) + '_' + Math.round(halfHeight * 1000) + '_' + Math.round(0.05 * 1000);
						let coverBox = shapeCache.get(coverKey);
						if (!coverBox) {
							coverBox = new CANNON.Box(new CANNON.Vec3(0.05, halfHeight, 0.05));
							shapeCache.set(coverKey, coverBox);
						}
						bowlBody.addShape(coverBox, new CANNON.Vec3(0, (yInner + yOuter) / 2, 0));
						tileCount++;
					}
				} else {
					y = sampleProfile(rMid);
					// add simple flat tile for lathe/profile mode - reuse boxes by size
					const key = Math.round(tileHalfX * 1000) + '_' + Math.round(tileHalfY * 1000) + '_' + Math.round(tileHalfZ * 1000);
					let box = shapeCache.get(key);
					if (!box) {
						box = new CANNON.Box(new CANNON.Vec3(tileHalfX, tileHalfY, tileHalfZ));
						shapeCache.set(key, box);
					}
					bowlBody.addShape(box, new CANNON.Vec3(x, y - tileHalfY, z));
					tileCount++;
				}
			}
		}

		// フラットな底面の物理プレート（すり抜け防止）
		try {
			const flatRadius = (flatCfg && flatCfg.enabled && flatCfg.radius) ? flatCfg.radius : 0;
			const flatThick = Math.max(0.02, (flatCfg && flatCfg.thickness) ? flatCfg.thickness : 0.1);
			if (useSphere && flatRadius > 0) {
				// 球の底面高さ
				const yFlat = -Math.sqrt(Math.max(0, sphereR * sphereR - flatRadius * flatRadius));
				// 底面と重ならないよう上方向へ半厚み分オフセット
				const halfY = flatThick / 2;
				const plate = new CANNON.Box(new CANNON.Vec3(flatRadius, halfY, flatRadius));
				bowlBody.addShape(plate, new CANNON.Vec3(0, yFlat + halfY, 0));
				tileCount++;
			}
		} catch (e) { console.warn('Could not add flat bottom plate', e); }

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
		// スリープしきい値（転がり続けを防止）
		body.allowSleep = true;
		body.sleepSpeedLimit = (cfg.sleepSpeedLimit != null) ? cfg.sleepSpeedLimit : 0.1; // これ以下の速度で
		body.sleepTimeLimit = (cfg.sleepTimeLimit != null) ? cfg.sleepTimeLimit : 1.0; // 指定時間継続でsleep
		// 任意: 内部バラスト（重心をわずかに下げ、角・辺立ちをさらに抑制）
		try {
			const ballast = cfg.ballast || {};
			if (ballast.enabled) {
				const br = Math.min(Math.max(0.01, ballast.radius || 0.2), half - 0.02);
				const by = -Math.abs(ballast.offsetY || 0.15);
				const layers = Math.max(1, Math.floor(ballast.layers || 1));
				const sphere = new CANNON.Sphere(br);
				// 賢い質量分布: 下側に集中させて重心を下げ、安定性を高める
				const totalMass = body.mass;
				const ballastMass = totalMass * 0.3; // 全体の30%をバラストに
				const perLayerMass = ballastMass / layers;
				for (let i = 0; i < layers; i++) {
					const frac = (layers <= 1) ? 0 : (i / (layers - 1));
					const oy = by * (0.6 + 0.4 * frac); // 少しずつ下に重ねる
					const shapeId = body.addShape(sphere, new CANNON.Vec3(0, oy, 0));
					// 各層の質量を設定（下側ほど重く）
					const layerMass = perLayerMass * (1 + frac * 0.5);
					body.shapeMaterialMasses[shapeId] = layerMass;
				}
				body.updateMassProperties();
			}
		} catch (e) { /* optional ballast failed: ignore */ }
		world.addBody(body);
		return body;
	}

	window.PhysicsHelper = {
		createWorld,
		createBowlCollider,
		createDiceBody
	};
})();
