import {
	ENTITY_DAMAGE,
	ENTITY_MIN_OPACITY,
	FADE_DURATION,
	LIFETIME,
	REMOVAL_MARGIN,
} from "./constants.js";
import debug, { isSpawnMarkersEnabled } from "./debug.js";
import {
	getHeartElement,
	getHeartPath,
	getHeartSvg,
	getPlayerPosition,
	setHeartOpacity,
	takeDamage,
} from "./player.js";
import type { Entity, EntitySpawnOptions } from "./types.js";

/** ゲーム内に存在するすべてのエンティティを格納する配列 */
const entities: Entity[] = [];
/** 次に生成されるエンティティに割り当てるID */
let nextEntityId = 1;
/** ハートに当たったエンティティを削除するかどうかのフラグ */
let removeBulletsOnHit = true; // default: remove entities when they hit the player
/** エンティティがプレイヤーを追尾（ホーミング）するかどうかのフラグ */
let homingEnabled = false;

/**
 * 現在のすべてのエンティティを取得する
 * @returns {Entity[]} エンティティの配列
 */
export const getEntities = () => entities;

/**
 * ハート衝突時にエンティティを削除する設定を更新する
 * @param {boolean} value - 削除する場合はtrue
 */
export const setRemoveBulletsOnHit = (value: boolean) => {
	removeBulletsOnHit = value;
};

/**
 * エンティティのホーミング設定を更新する
 * @param {boolean} value - ホーミングを有効にする場合はtrue
 */
export const setHomingEnabled = (value: boolean) => {
	homingEnabled = value;
};

/**
 * ハート衝突時にエンティティを削除する設定を取得する
 * @returns {boolean} 削除が有効な場合はtrue
 */
export const getRemoveBulletsOnHit = () => removeBulletsOnHit;

/**
 * エンティティのホーミング設定を取得する
 * @returns {boolean} ホーミングが有効な場合はtrue
 */
export const getHomingEnabled = () => homingEnabled;

/**
 * エンティティの衝突判定に使用するサンプルポイントを取得する
 * @param {Entity} entity - 対象のエンティティ
 * @returns {{ x: number; y: number }[]} サンプルポイントの座標配列
 */
/* 既存の粗いサンプルポイント生成は廃止し、形状ベースの判定へ置き換えました */

/**
 * ポイントがポリゴン内にあるか判定する（非高速だが信頼性あり）
 */
const pointInPolygon = (
	x: number,
	y: number,
	poly: { x: number; y: number }[],
) => {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i].x,
			yi = poly[i].y;
		const xj = poly[j].x,
			yj = poly[j].y;

		const intersect =
			yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
};

/** ローカル座標系での三角形ポリゴン（clip-pathと一致） */
const TRIANGLE_UNIT_POLYGON = [
	{ x: 0.5, y: 0 },
	{ x: 0, y: 0.866 },
	{ x: 1, y: 0.866 },
];

/** ローカル座標系での星形ポリゴン（clip-pathと一致） */
const STAR_UNIT_POLYGON = [
	{ x: 0.5, y: 0 },
	{ x: 0.61, y: 0.35 },
	{ x: 0.98, y: 0.35 },
	{ x: 0.68, y: 0.57 },
	{ x: 0.79, y: 0.91 },
	{ x: 0.5, y: 0.7 },
	{ x: 0.21, y: 0.91 },
	{ x: 0.32, y: 0.57 },
	{ x: 0.02, y: 0.35 },
	{ x: 0.39, y: 0.35 },
];

/** サンプリング間隔（ピクセル）。1px ごとにサンプリングして精度を最優先 */
const COLLISION_SAMPLE_STEP = 1;

/**
 * ワールド座標のポイントがエンティティ形状内に含まれるかどうかを判定する
 * @param {number} worldX
 * @param {number} worldY
 * @param {Entity} entity
 * @param {number} rotationCos - エンティティ回転の余弦（キャッシュして渡す）
 * @param {number} rotationSin - エンティティ回転の正弦（キャッシュして渡す）
 */
const isPointInEntity = (
	worldX: number,
	worldY: number,
	entity: Entity,
	rotationCos: number,
	rotationSin: number,
) => {
	const radius = entity.size / 2;
	const centerX = entity.position.x + radius;
	const centerY = entity.position.y + radius;
	const dx = worldX - centerX;
	const dy = worldY - centerY;

	if (entity.shape === "circle") {
		return dx * dx + dy * dy <= radius * radius;
	}

	// 回転を打ち消してローカル座標（左上原点）に変換
	const localX = rotationCos * dx + rotationSin * dy + radius;
	const localY = -rotationSin * dx + rotationCos * dy + radius;

	if (
		localX < 0 ||
		localX > entity.size ||
		localY < 0 ||
		localY > entity.size
	) {
		return false;
	}

	if (entity.shape === "square") {
		return true;
	}

	const normalizedX = localX / entity.size;
	const normalizedY = localY / entity.size;
	const polygon =
		entity.shape === "triangle"
			? TRIANGLE_UNIT_POLYGON
			: entity.shape === "star"
				? STAR_UNIT_POLYGON
				: null;

	if (!polygon) {
		return true;
	}

	return pointInPolygon(normalizedX, normalizedY, polygon);
};

/**
 * 新しいエンティティを生成し、ゲームに追加する
 * @param {EntitySpawnOptions} options - エンティティの生成オプション
 * @returns {Entity} 生成されたエンティティオブジェクト
 */
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

	// デバッグが有効ならスポーン位置を可視化する
	if (isSpawnMarkersEnabled()) {
		debug.markSpawn(position, `id:${entity.id}`);
	}
	return entity;
};

/**
 * すべてのエンティティの状態を更新する（座標、回転、生存期間など）
 * @param {number} deltaSeconds - 前回のフレームからの経過時間（秒）
 * @param {HTMLElement} playfield - プレイフィールドのHTML要素
 */
export const updateEntities = (
	deltaSeconds: number,
	playfield: HTMLElement,
) => {
	const stageWidth = playfield.clientWidth;
	const stageHeight = playfield.clientHeight;

	// 逆順ループにして削除発生時のインデックスずれを防ぐ
	for (let i = entities.length - 1; i >= 0; i--) {
		const entity = entities[i];
		entity.lifetime -= deltaSeconds;

		// 寿命切れは即座に除去
		if (entity.lifetime <= 0) {
			entity.element.remove();
			entities.splice(i, 1);
			continue;
		}

		const originalSpeed = Math.hypot(entity.velocity.x, entity.velocity.y);

		// ホーミング有効時は等速のままプレイヤー方向へ滑らかに旋回
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
				// プレイヤーへの方向ベクトル
				const targetDirX = dx / dist;
				const targetDirY = dy / dist;
				// 現在の進行方向ベクトル
				const currentDirX = entity.velocity.x / originalSpeed;
				const currentDirY = entity.velocity.y / originalSpeed;
				// 進行方向に対する垂線ベクトル（旋回方向を決めるため）
				const perpX = -currentDirY;
				const perpY = currentDirX;
				// 垂線ベクトルと目標方向ベクトルの内積で、左右どちらに曲がるべきか判断
				const dot = perpX * targetDirX + perpY * targetDirY;
				// 旋回力
				const force = originalSpeed * 2.5;
				const accX = perpX * force * Math.sign(dot);
				const accY = perpY * force * Math.sign(dot);
				// 速度を更新
				entity.velocity.x += accX * deltaSeconds;
				entity.velocity.y += accY * deltaSeconds;
				// 速度が元の速度を超えないように正規化
				const newSpeed = Math.hypot(entity.velocity.x, entity.velocity.y);
				if (newSpeed > 0) {
					entity.velocity.x = (entity.velocity.x / newSpeed) * originalSpeed;
					entity.velocity.y = (entity.velocity.y / newSpeed) * originalSpeed;
				}
			}
		}

		// 座標と回転を更新
		entity.position.x += entity.velocity.x * deltaSeconds;
		entity.position.y += entity.velocity.y * deltaSeconds;
		entity.rotation += entity.rotationSpeed * deltaSeconds;

		// DOMへ現在の座標と回転を反映
		const translate = `translate(${entity.position.x}px, ${entity.position.y}px)`;
		const rotate =
			entity.rotation !== 0 ? ` rotate(${entity.rotation}rad)` : "";
		entity.element.style.transform = translate + rotate;

		// 残り寿命に応じてフェードアウトさせる
		const fadeOpacity =
			entity.lifetime > FADE_DURATION
				? 1
				: Math.max(0, entity.lifetime / FADE_DURATION);
		entity.element.style.opacity = `${fadeOpacity * entity.collisionOpacity}`;

		// プレイフィールド外へ大きく逸れたエンティティは破棄
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

/**
 * エンティティとプレイヤー（ハート）との衝突判定を行う
 */
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
		const rotationCos = Math.cos(entity.rotation);
		const rotationSin = Math.sin(entity.rotation);

		// まずはAABBで粗い衝突判定を行う
		if (
			entityRight < heartLeft ||
			entityLeft > heartRight ||
			entityBottom < heartTop ||
			entityTop > heartBottom
		) {
			entity.collisionOpacity = 1; // 衝突していない場合は不透明度を元に戻す
			continue;
		}

		// AABBでヒットしたものだけ、エンティティの見た目領域に沿って厳密判定
		let hit = false;
		// サンプリング領域をエンティティの矩形に限定し、ピクセル近似で判定
		for (
			let sx = Math.floor(entityLeft);
			sx <= Math.ceil(entityRight);
			sx += COLLISION_SAMPLE_STEP
		) {
			if (hit) break;
			for (
				let sy = Math.floor(entityTop);
				sy <= Math.ceil(entityBottom);
				sy += COLLISION_SAMPLE_STEP
			) {
				// サンプル点がハートのバウンディングボックス外ならスキップ
				if (
					sx < heartLeft ||
					sx > heartRight ||
					sy < heartTop ||
					sy > heartBottom
				)
					continue;

				// サンプル点がエンティティ形状の内部かどうかをローカル判定
				if (
					!isPointInEntity(sx + 0.5, sy + 0.5, entity, rotationCos, rotationSin)
				)
					continue;

				// スクリーン座標 → SVG座標へ変換して、ハート内か確認
				svgPoint.x = stageRect.left + sx;
				svgPoint.y = stageRect.top + sy;
				const transformed = svgPoint.matrixTransform(inverseMatrix);
				try {
					if (heartPath.isPointInFill(transformed)) {
						hit = true;
						break;
					}
				} catch {
					// isPointInFillが失敗した場合は安全にスキップ
				}
			}
		}

		if (hit) {
			// プレイヤーにヒットしたのでダメージを与える（成功した場合は無敵時間等が働いた）
			const damaged = takeDamage(ENTITY_DAMAGE);
			if (removeBulletsOnHit) {
				// 衝突時にエンティティを削除する設定の場合
				entity.element.remove();
				entities.splice(i, 1);
			} else {
				// 衝突したエンティティを半透明にする
				entity.collisionOpacity = ENTITY_MIN_OPACITY;
			}
			// ダメージが反映された場合はハートの被弾フィードバックを有効にする
			if (damaged) heartWasHit = true;
		} else {
			entity.collisionOpacity = 1; // 衝突していない場合は不透明度を元に戻す
		}
	}

	// ハートが一度でもヒットしたかどうかに基づいて、ハートの不透明度を設定
	setHeartOpacity(heartWasHit);
};
