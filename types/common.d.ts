// Common types used across multiple games
export type GameState =
	| "initializing"
	| "ready"
	| "playing"
	| "paused"
	| "ended";

// Common event types
export interface CollisionEvent {
	body: unknown;
	contact: {
		getImpactVelocityAlongNormal(): number;
	};
}

// Common utility types
export type Point2D = {
	x: number;
	y: number;
};

export type Size2D = {
	width: number;
	height: number;
};

export type RGBA = {
	r: number;
	g: number;
	b: number;
	a?: number;
};

// Common configuration types
export interface PhysicsSettings {
	gravity: number;
	timeStep: number;
	maxSubSteps?: number;
}

export interface RenderSettings {
	width: number;
	height: number;
	pixelRatio?: number;
	background?: string;
}

// Common game object types
export interface GameObject {
	id: string;
	position: Point2D;
	rotation?: number;
	scale?: Point2D;
	visible?: boolean;
}

// Audio types
export interface AudioSettings {
	masterVolume: number;
	sfxVolume: number;
	musicVolume: number;
	enabled: boolean;
}

// Performance monitoring
export interface PerformanceMetrics {
	fps: number;
	frameTime: number;
	memoryUsage?: number;
}

// Material/Physics interaction types
export interface MaterialConfig {
	name: string;
	density?: number;
	friction?: number;
	restitution?: number;
}

// Rotator types (for pachinko and similar games)
export interface RotatorConfig {
	id: string;
	enabled: boolean;
	mode: "constant" | "programmed" | "inertial";
	anglePerSecond?: number;
	kind?: string;
}

declare global {
	interface Window {
		__recordPhysicsPerf__?: (frameMs: number) => void;
		__pachi_sizedReady?: boolean;
		__pachi_stylesLoaded?: boolean;
		__pachi_stylesheetTimeout?: boolean;
	}
}

// Viteでメディアファイルをインポート可能にするための宣言
declare module "*.mp3" {
	const src: string;
	export default src;
}
