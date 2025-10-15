import {
	detectCollisions as _detectCollisions,
	getEntities,
} from "./entity.ts";

/**
 * Defensive wrapper around detectCollisions.
 * Ensures the shared entities array contains only well-formed objects
 * before invoking the original detection routine.
 */
export const detectCollisionsSafe = () => {
	try {
		const ents = getEntities();
		// compact any undefined / null / malformed entries to avoid crashes
		for (let i = ents.length - 1; i >= 0; i--) {
			const e = ents[i] as any;
			if (!e || typeof e !== "object" || !e.position) {
				ents.splice(i, 1);
			}
		}
		// call the original detection routine
		_detectCollisions();
	} catch (err) {
		// If something still goes wrong, log and continue so the game loop doesn't die
		console.error("detectCollisionsSafe caught:", err);
	}
};
