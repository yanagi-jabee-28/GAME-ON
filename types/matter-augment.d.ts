// Local augmentation for Matter types used in this project
import Matter from 'matter-js';

declare module 'matter-js' {
	interface Body {
		_id?: string;
		meta?: Record<string, any>;
	}
}

export { };
