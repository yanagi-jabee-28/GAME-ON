export type EntityShape = "circle" | "square" | "star" | "triangle";

export type Entity = {
	id: number;
	element: HTMLDivElement;
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	size: number;
	rotation: number;
	rotationSpeed: number;
	shape: EntityShape;
	color: string;
	lifetime: number;
	collisionOpacity: number;
};

export type EntitySpawnOptions = {
	position: { x: number; y: number };
	velocity?: { x: number; y: number };
	size?: number;
	shape?: EntityShape;
	color?: string;
	rotationSpeed?: number;
};
