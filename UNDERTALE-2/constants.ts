export const SPEED = 180; // pixels per second
export const HEART_MIN_OPACITY = 0.3;
export const ENTITY_MIN_OPACITY = 0.3;
export const REMOVAL_MARGIN = 160;
export const FADE_DURATION = 0.5;
export const LIFETIME = 5;

export const COLORS: string[] = [
	"hsl(180 100% 50%)",
	"hsl(30 100% 50%)",
	"hsl(220 100% 50%)",
	"hsl(285 100% 50%)",
	"hsl(120 100% 50%)",
	"hsl(60 100% 50%)",
	"hsl(0 100% 50%)",
	"hsl(0 0% 100%)",
];

export const DIRECTION_MAP: Record<string, Readonly<[number, number]>> = {
	arrowup: [0, -1],
	w: [0, -1],
	arrowdown: [0, 1],
	s: [0, 1],
	arrowleft: [-1, 0],
	a: [-1, 0],
	arrowright: [1, 0],
	d: [1, 0],
};
