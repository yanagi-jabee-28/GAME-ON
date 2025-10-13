import {
	ENTITY_MIN_OPACITY,
	FADE_DURATION,
	LIFETIME,
	REMOVAL_MARGIN,
} from "./constants.js";
import {
	getHeartElement,
	getHeartPath,
	getHeartSvg,
	getPlayerPosition,
	setHeartOpacity,
} from "./player.js";
import type { Entity, EntitySpawnOptions } from "./types.js";

const entities: Entity[] = [];
let nextEntityId = 1;
let removeBulletsOnHit = false;
let homingEnabled = false;

export const getEntities = () => entities;
export const setRemoveBulletsOnHit = (value: boolean) => {
	removeBulletsOnHit = value;
};
export const setHomingEnabled = (value: boolean) => {
	homingEnabled = value;
};
export const getRemoveBulletsOnHit = () => removeBulletsOnHit;
export const getHomingEnabled = () => homingEnabled;

const getEntitySamplePoints = (entity: Entity) => {
	const centerX = entity.position.x + entity.size / 2;
	const centerY = entity.position.y + entity.size / 2;
	const radius =
		entity.shape === "circle"
			? entity.size / 2
			: (entity.size / 2) * Math.SQRT2 * 0.8;
	return [
		{ x: centerX, y: centerY },
		{ x: centerX + radius, y: centerY },
		{ x: centerX - radius, y: centerY },
		{ x: centerX, y: centerY + radius },
		{ x: centerX, y: centerY - radius },
	];
};

export const spawnEntity = ({
	position,
	velocity = { x: 0, y: 0 },
	size = 24,
	shape = "circle",
	color = "hsl(0 0% 90%)",
	rotationSpeed = 0,
}: EntitySpawnOptions) => {
	const element = document.createElement("div");
	element.classList.add("entity");
	if (shape === "circle") element.classList.add("entity--circle");
	else if (shape === "star") element.classList.add("entity--star");
	else if (shape === "triangle") element.classList.add("entity--triangle");
	element.style.width = `${size}px`;
	element.style.height = `${size}px`;
	element.style.background = color;
	element.style.transform = `translate(${position.x}px, ${position.y}px)`;
	const layer = document.getElementById("entity-layer");
	if (layer instanceof HTMLElement) layer.appendChild(element);

	const entity: Entity = {
		id: nextEntityId++,
		element,
		position: { ...position },
		velocity: { ...velocity },
		size,
		rotation: 0,
		rotationSpeed,
		shape,
		color,
		lifetime: LIFETIME,
		collisionOpacity: 1,
	};
	entities.push(entity);
	return entity;
};

export const updateEntities = (
	deltaSeconds: number,
	playfield: HTMLElement,
) => {
	const stageWidth = playfield.clientWidth;
	const stageHeight = playfield.clientHeight;

	for (let i = entities.length - 1; i >= 0; i--) {
		const entity = entities[i];
		entity.lifetime -= deltaSeconds;
		if (entity.lifetime <= 0) {
			entity.element.remove();
			entities.splice(i, 1);
			continue;
		}

		const originalSpeed = Math.hypot(entity.velocity.x, entity.velocity.y);
		if (homingEnabled && originalSpeed > 0) {
			const { x: playerX, y: playerY } = getPlayerPosition();
			const playerCenterX = playerX + getHeartElement().clientWidth / 2;
			const playerCenterY = playerY + getHeartElement().clientHeight / 2;
			const entityCenterX = entity.position.x + entity.size / 2;
			const entityCenterY = entity.position.y + entity.size / 2;
			const dx = playerCenterX - entityCenterX;
			const dy = playerCenterY - entityCenterY;
			const dist = Math.hypot(dx, dy);
			if (dist > 0) {
				const targetDirX = dx / dist;
				const targetDirY = dy / dist;
				const currentDirX = entity.velocity.x / originalSpeed;
				const currentDirY = entity.velocity.y / originalSpeed;
				const perpX = -currentDirY;
				const perpY = currentDirX;
				const dot = perpX * targetDirX + perpY * targetDirY;
				const force = originalSpeed * 2.5;
				const accX = perpX * force * Math.sign(dot);
				const accY = perpY * force * Math.sign(dot);
				entity.velocity.x += accX * deltaSeconds;
				entity.velocity.y += accY * deltaSeconds;
				const newSpeed = Math.hypot(entity.velocity.x, entity.velocity.y);
				if (newSpeed > 0) {
					entity.velocity.x = (entity.velocity.x / newSpeed) * originalSpeed;
					entity.velocity.y = (entity.velocity.y / newSpeed) * originalSpeed;
				}
			}
		}

		entity.position.x += entity.velocity.x * deltaSeconds;
		entity.position.y += entity.velocity.y * deltaSeconds;
		entity.rotation += entity.rotationSpeed * deltaSeconds;

		const translate = `translate(${entity.position.x}px, ${entity.position.y}px)`;
		const rotate =
			entity.rotation !== 0 ? ` rotate(${entity.rotation}rad)` : "";
		entity.element.style.transform = translate + rotate;

		const fadeOpacity =
			entity.lifetime > FADE_DURATION
				? 1
				: Math.max(0, entity.lifetime / FADE_DURATION);
		entity.element.style.opacity = `${fadeOpacity * entity.collisionOpacity}`;

		const isOutOfBounds =
			entity.position.x < -REMOVAL_MARGIN ||
			entity.position.x > stageWidth + REMOVAL_MARGIN ||
			entity.position.y < -REMOVAL_MARGIN ||
			entity.position.y > stageHeight + REMOVAL_MARGIN;
		if (isOutOfBounds) {
			entity.element.remove();
			entities.splice(i, 1);
		}
	}
};

export const detectCollisions = () => {
	const heartSvg = getHeartSvg();
	const heartPath = getHeartPath();
	if (!heartSvg || !heartPath || entities.length === 0) return;

	const heartMatrix = heartSvg.getScreenCTM();
	if (!heartMatrix) return;
	const inverseMatrix = heartMatrix.inverse();
	const playfield = document.getElementById("playfield");
	if (!(playfield instanceof HTMLElement)) return;
	const stageRect = playfield.getBoundingClientRect();
	const svgPoint = heartSvg.createSVGPoint();
	const { x: heartLeft, y: heartTop } = getPlayerPosition();
	const heartRight = heartLeft + getHeartElement().clientWidth;
	const heartBottom = heartTop + getHeartElement().clientHeight;

	let heartWasHit = false;

	for (let i = entities.length - 1; i >= 0; i--) {
		const entity = entities[i];
		const entityLeft = entity.position.x;
		const entityTop = entity.position.y;
		const entityRight = entityLeft + entity.size;
		const entityBottom = entityTop + entity.size;

		if (
			entityRight < heartLeft ||
			entityLeft > heartRight ||
			entityBottom < heartTop ||
			entityTop > heartBottom
		) {
			entity.collisionOpacity = 1;
			continue;
		}

		const samples = getEntitySamplePoints(entity);
		const hit = samples.some((sample) => {
			if (
				sample.x < heartLeft ||
				sample.x > heartRight ||
				sample.y < heartTop ||
				sample.y > heartBottom
			)
				return false;
			svgPoint.x = stageRect.left + sample.x;
			svgPoint.y = stageRect.top + sample.y;
			const transformed = svgPoint.matrixTransform(inverseMatrix);
			try {
				return heartPath.isPointInFill(transformed);
			} catch {
				return false;
			}
		});

		if (hit) {
			if (removeBulletsOnHit) {
				entity.element.remove();
				entities.splice(i, 1);
			} else {
				entity.collisionOpacity = ENTITY_MIN_OPACITY;
				heartWasHit = true;
			}
		} else {
			entity.collisionOpacity = 1;
		}
	}

	setHeartOpacity(heartWasHit);
};
