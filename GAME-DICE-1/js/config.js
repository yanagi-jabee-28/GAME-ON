// Application configuration - tweak values here for behavior tuning
window.AppConfig = window.AppConfig || {
	physics: {
		gravity: { x: 0, y: -9.82, z: 0 },
		solverIterations: 40,
		maxSubSteps: 5,
		contact: { friction: 0.4, restitution: 0.1 }
	},
	bowl: {
		profilePoints: [{ r: 0.0, y: -2.2 }, { r: 3.0, y: -1.5 }, { r: 6.0, y: 2.0 }],
		maxR: 6.0,
		radialSlices: 16,
		angularSegments: 48,
		tileHalfY: 0.25,
		// Optionally use a sphere interior as the bowl shape
		sphere: {
			enabled: true,
			radius: 6.0,
			openingY: 2.0,
			sampleCount: 72
		},
		// centerCover: visual and/or physics cover for the central hole
		centerCover: {
			enabled: true,
			visual: {
				enabled: true,
				radius: 0.5,
				color: 0xA1887F
			},
			physics: {
				enabled: true,
				size: 0.3 // half-extent for small central box
			}
		}
	},
	dice: {
		count: 3,
		size: 1,
		spacing: 1.6,
		initialHeight: 5,
		jitterX: 0.2,
		jitterZ: 0.6,
		initialVelocityScale: 4,
		angularVelocityScale: 15,
		linearDamping: 0.01,
		angularDamping: 0.01
	},
	render: {
		cameraPosition: { x: 0, y: 10, z: 12 }
	},
	ui: {
		autoThrowDelay: 50,
		resultCheckDelay: 2000,
		resultVelocityThreshold: 0.1,
		resultAngularThreshold: 0.1
	}
};
