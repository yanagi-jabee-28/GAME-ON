// Local augmentation for Matter types used in this project
declare module "matter-js" {
	interface Body {
		_id?: string;
		meta?: Record<string, unknown>;
		render?: {
			layer?: number;
			fillStyle?: string;
			strokeStyle?: string;
			lineWidth?: number;
			[key: string]: unknown;
		};
		material?: unknown; // Material property for collision handling
		oneWay?: {
			blockDir?: string;
			dir?: string;
			enabled?: boolean;
		};
		sensorData?: {
			id?: string;
			[key: string]: unknown;
		};
	}

	namespace Engine {
		interface ITiming {
			isFixed?: boolean;
		}
	}

	interface IEngine {
		timing?: {
			timeScale?: number;
			[key: string]: unknown;
		};
	}

	interface IBodyRenderOptions {
		layer?: number;
		fillStyle?: string;
		strokeStyle?: string;
		lineWidth?: number;
		[key: string]: unknown;
	}

	namespace Render {
		interface IRenderDefinition {
			pixelRatio?: string | number;
		}

		// static method bodies that gets overridden
		function bodies(
			render: Render,
			bodies: Body[],
			context: CanvasRenderingContext2D,
		): void;
	}
}

// Object creation specification interfaces
export interface BallOptions {
	render?: {
		fillStyle?: string;
		strokeStyle?: string;
		lineWidth?: number;
		[key: string]: unknown;
	};
	material?: string;
	[key: string]: unknown;
}

export interface ObjectSpec {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	angle?: number;
	isStatic?: boolean;
	render?: {
		fillStyle?: string;
		strokeStyle?: string;
		lineWidth?: number;
		layer?: number;
		[key: string]: unknown;
	};
	material?: string;
	label?: string;
	vertices?: Array<{ x: number; y: number }>;
	oneWay?: {
		blockDir?: string;
		dir?: string;
		enabled?: boolean;
	};
	offsetX?: number;
	offsetY?: number;
	offset?: {
		x?: number;
		y?: number;
	};
	pivotMode?: string;
	pivot?: {
		mode?: string;
		x?: number;
		y?: number;
	};
	fillStyle?: string;
	layer?: number;
	[key: string]: unknown;
}
