/**
 * このファイルは、エンティティ（敵の攻撃など、プレイヤー以外の動くオブジェクト）の
 * 生成、更新、削除、および衝突判定に関するロジックを管理します。
 */
import {
	BLASTER_CONFIG,
	ENTITY_DAMAGE,
	ENTITY_MIN_OPACITY,
	FADE_DURATION,
	HOMING_FORCE,
	LIFETIME,
	REMOVAL_MARGIN,
} from "./constants.ts";
import debug, { isSpawnMarkersEnabled } from "./debug.ts";
import {
	getHeartElement,
	getHeartPath,
	getHeartSvg,
	getPlayerPosition,
	isHeartActive,
	setHeartOpacity,
	takeDamage,
} from "./player.ts";
import type {
	BlasterSpawnOptions,
	Entity,
	EntitySpawnOptions,
} from "./types.ts";

/** ゲーム内に存在するすべてのエンティティを格納する配列 */
const entities: Entity[] = [];
/** 次に生成されるエンティティに割り当てる一意のID */
let nextEntityId = 1;
/**
 * ハートに当たったエンティティを削除するかどうかのフラグ。
 * trueの場合、衝突したエンティティは消滅します。
 * デバッグ用に 'T' キーで切り替え可能です。
 */
let removeBulletsOnHit = true;
/**
 * エンティティがプレイヤーを追尾（ホーミング）するかどうかのフラグ。
 * デバッグ用に 'H' キーで切り替え可能です。
 */
let homingEnabled = false;

/** 戦闘終了後など、一時的にブラスター本体の生成を抑止するフラグ */
let blasterSpawningSuppressed = false;

/** ブラスターの生成可否を切り替えます（予兆→本体の生成を抑止） */
export const suppressBlasterSpawns = (suppress: boolean) => {
	blasterSpawningSuppressed = suppress;
};

/** エンティティの描画幅を取得します。widthが指定されていればそちらを優先します。 */
const getEntityWidth = (entity: Entity) => entity.width ?? entity.size;

/** エンティティの描画高さを取得します。heightが指定されていればそちらを優先します。 */
const getEntityHeight = (entity: Entity) => entity.height ?? entity.size;

/** 値を指定範囲に丸め込みます。 */
const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

/**
 * 現在ゲーム内に存在するすべてのエンティティの配列を取得します。
 * @returns {Entity[]} エンティティの配列。
 */
export const getEntities = () => entities;

/**
 * ハート衝突時にエンティティを削除する設定を更新します。
 * @param {boolean} value - trueで削除、falseで削除しない。
 */
export const setRemoveBulletsOnHit = (value: boolean) => {
	removeBulletsOnHit = value;
};

/**
 * エンティティのホーミング（追尾）設定を更新します。
 * @param {boolean} value - trueでホーミング有効、falseで無効。
 */
export const setHomingEnabled = (value: boolean) => {
	homingEnabled = value;
};

/** ハート衝突時にエンティティを削除する設定が有効か返します。 */
export const getRemoveBulletsOnHit = () => removeBulletsOnHit;
/** ホーミング設定が有効か返します。 */
export const getHomingEnabled = () => homingEnabled;

/**
 * ゲーム内に存在するすべてのエンティティを即時にクリアします。
 * DOM要素も合わせて削除されます。
 */
export const clearAllEntities = () => {
	for (const e of entities) {
		try {
			e.element.remove();
		} catch {
			// 要素がすでに存在しない場合などのエラーは無視
		}
	}
	// 配列を空にする
	entities.length = 0;
};

/**
 * 画面上の全てのブラスター（予兆・本体）を即時に除去します。
 * - 予兆: .blaster-telegraph を全削除
 * - 本体: shape === "beam"（および .entity--blaster）を配列・DOMから削除
 */
export const removeAllBlasters = () => {
	try {
		const telegraphs =
			document.querySelectorAll<HTMLElement>(".blaster-telegraph");
		telegraphs.forEach((el) => {
			try {
				el.remove();
			} catch {}
		});
	} catch {}
	for (let i = entities.length - 1; i >= 0; i--) {
		const ent = entities[i];
		if (!ent) continue;
		// ブラスター本体（ビーム）は shape === 'beam' として生成される
		// 念のためクラス名でも判定
		const isBlaster =
			ent.shape === "beam" || ent.element.classList.contains("entity--blaster");
		if (isBlaster) {
			try {
				ent.element.remove();
			} catch {}
			entities.splice(i, 1);
		}
	}
};

/**
 * 点が多角形の内側にあるかどうかを判定します (Point-in-Polygon)。
 * レイキャスティング法を用いた、信頼性の高い判定方法です。
 * @param {number} x - 点のX座標。
 * @param {number} y - 点のY座標。
 * @param {{ x: number; y: number }[]} poly - 多角形の頂点座標の配列。
 * @returns {boolean} - 点が内側にあればtrue。
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

/** 三角形エンティティの衝突判定に使う単位ポリゴン (幅1, 高さ約0.866) */
const TRIANGLE_UNIT_POLYGON = [
	{ x: 0.5, y: 0 },
	{ x: 0, y: 0.866 },
	{ x: 1, y: 0.866 },
];

/** 星形エンティティの衝突判定に使う単位ポリゴン (幅1, 高さ1) */
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

/** 衝突判定の際に、エンティティの表面を走査する間隔 (ピクセル) */
const COLLISION_SAMPLE_STEP = 1;

/**
 * 指定されたワールド座標の点が、特定のエンティティの形状内に含まれるかを判定します。
 * 円、四角、三角、星形の衝突判定に対応しています。
 * @param {number} worldX - 判定する点のワールドX座標。
 * @param {number} worldY - 判定する点のワールドY座標。
 * @param {Entity} entity - 対象のエンティティ。
 * @param {number} rotationCos - エンティティの回転角度のコサイン値。
 * @param {number} rotationSin - エンティティの回転角度のサイン値。
 * @returns {boolean} - 点がエンティティ内にあればtrue。
 */
const isPointInEntity = (
	worldX: number,
	worldY: number,
	entity: Entity,
	rotationCos: number,
	rotationSin: number,
) => {
	// ビーム形状の場合は、幅と高さを使用
	if (entity.shape === "beam") {
		const halfWidth = (entity.width ?? entity.size) / 2;
		const halfHeight = (entity.height ?? entity.size) / 2;
		const centerX = entity.position.x + halfWidth;
		const centerY = entity.position.y + halfHeight;
		const dx = worldX - centerX;
		const dy = worldY - centerY;

		// 回転を打ち消してローカル座標に変換
		const localX = rotationCos * dx + rotationSin * dy;
		const localY = -rotationSin * dx + rotationCos * dy;

		// 長方形の衝突判定
		return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
	}

	const radius = entity.size / 2;
	const centerX = entity.position.x + radius;
	const centerY = entity.position.y + radius;
	const dx = worldX - centerX;
	const dy = worldY - centerY;

	// 円形の場合、中心からの距離で判定
	if (entity.shape === "circle") {
		return dx * dx + dy * dy <= radius * radius;
	}

	// 回転しているエンティティの場合、回転を打ち消してローカル座標に変換
	const localX = rotationCos * dx + rotationSin * dy + radius;
	const localY = -rotationSin * dx + rotationCos * dy + radius;

	// ローカル座標が 0 ～ size の範囲外なら、明らかに外側
	if (
		localX < 0 ||
		localX > entity.size ||
		localY < 0 ||
		localY > entity.size
	) {
		return false;
	}

	// 四角形の場合は、この時点で内側と確定
	if (entity.shape === "square") {
		return true;
	}

	// 三角形・星形の場合、正規化された座標で pointInPolygon 判定
	const normalizedX = localX / entity.size;
	const normalizedY = localY / entity.size;
	const polygon =
		entity.shape === "triangle"
			? TRIANGLE_UNIT_POLYGON
			: entity.shape === "star"
				? STAR_UNIT_POLYGON
				: null;

	if (!polygon) return true; // 不明な形状は常に衝突とみなす
	return pointInPolygon(normalizedX, normalizedY, polygon);
};

/**
 * 新しいエンティティを生成し、ゲームに追加します。
 * @param {EntitySpawnOptions} options - エンティティの生成オプション。
 * @returns {Entity} - 生成されたエンティティオブジェクト。
 */
export const spawnEntity = ({
	position,
	velocity = { x: 0, y: 0 },
	size = 24,
	width,
	height,
	shape = "circle",
	color = "hsl(0 0% 90%)",
	rotationSpeed = 0,
	lifetime,
	damage,
	removeOnHit,
}: EntitySpawnOptions) => {
	// ビームの場合は幅と高さを設定（デフォルト: 幅200px, 高さ20px）
	const actualWidth = shape === "beam" ? (width ?? 200) : (width ?? size);
	const actualHeight = shape === "beam" ? (height ?? 20) : (height ?? size);
	const resolvedDamage = damage ?? ENTITY_DAMAGE;
	// ダメージ未指定時は既定値を採用し、既存攻撃との整合を取る
	const resolvedRemoveOnHit = removeOnHit ?? true;

	// DOM要素を作成
	const element = document.createElement("div");
	element.classList.add("entity");
	if (shape === "circle") element.classList.add("entity--circle");
	else if (shape === "star") element.classList.add("entity--star");
	else if (shape === "triangle") element.classList.add("entity--triangle");
	else if (shape === "beam") element.classList.add("entity--beam");

	element.style.width = `${actualWidth}px`;
	element.style.height = `${actualHeight}px`;
	element.style.background = color;
	element.style.transform = `translate(${position.x}px, ${position.y}px)`;

	// エンティティレイヤーに追加
	const layer = document.getElementById("entity-layer");
	if (layer instanceof HTMLElement) layer.appendChild(element);

	// エンティティオブジェクトを作成
	const entity: Entity = {
		id: nextEntityId++,
		element,
		position: { ...position },
		velocity: { ...velocity },
		size: shape === "beam" ? Math.max(actualWidth, actualHeight) : size,
		width: actualWidth,
		height: actualHeight,
		rotation: 0,
		rotationSpeed,
		shape,
		color,
		damage: resolvedDamage,
		removeOnHit: resolvedRemoveOnHit,
		lifetime: lifetime ?? LIFETIME,
		collisionOpacity: 1,
		fading: false,
	};
	entities.push(entity);

	// デバッグマーカーが有効なら、スポーン位置に印をつける
	if (isSpawnMarkersEnabled()) {
		debug.markSpawn(position, `id:${entity.id}`);
	}
	return entity;
};

/** ブラスター攻撃を生成します。予兆を経て画面全体に伸びる矩形を表示します。 */
export const spawnBlasterAttack = ({
	side = "left",
	offsetRatio,
	telegraphDurationMs,
	beamDurationMs,
	thickness,
	color,
	damage,
	removeOnHit,
}: BlasterSpawnOptions = {}) => {
	const playfield = document.getElementById("playfield");
	const layer = document.getElementById("entity-layer");
	if (!(playfield instanceof HTMLElement) || !(layer instanceof HTMLElement))
		return;

	const {
		damage: defaultDamage,
		telegraphDurationMs: defaultTelegraphMs,
		beamDurationMs: defaultBeamMs,
		thickness: defaultThickness,
		color: defaultColor,
		removeOnHit: defaultRemoveOnHit,
	} = BLASTER_CONFIG;
	// 毎回設定を読んでブラスターのバランス調整を一括管理する

	const resolvedTelegraph = telegraphDurationMs ?? defaultTelegraphMs;
	const resolvedBeamDuration = beamDurationMs ?? defaultBeamMs;
	const resolvedThickness = thickness ?? defaultThickness;
	const resolvedColor = color ?? defaultColor;
	const resolvedDamage = damage ?? defaultDamage;
	const resolvedRemoveOnHit = removeOnHit ?? defaultRemoveOnHit;

	const stageWidth = playfield.clientWidth;
	const stageHeight = playfield.clientHeight;
	const telegraphSize = Math.max(resolvedThickness * 1.15, 56);
	const axisLength =
		side === "left" || side === "right" ? stageHeight : stageWidth;
	const ratio =
		offsetRatio != null && Number.isFinite(offsetRatio)
			? clamp(offsetRatio, 0, 1)
			: Math.random();
	const center = clamp(
		ratio * axisLength,
		telegraphSize / 2,
		axisLength - telegraphSize / 2,
	);

	const telegraph = document.createElement("div");
	telegraph.className = `blaster-telegraph blaster-telegraph--${side}`;
	telegraph.style.width = `${telegraphSize}px`;
	telegraph.style.height = `${telegraphSize}px`;
	telegraph.style.setProperty("--blaster-color", resolvedColor);

	if (side === "left" || side === "right") {
		telegraph.style.top = `${center - telegraphSize / 2}px`;
		const offset =
			side === "left" ? -telegraphSize * 0.6 : stageWidth - telegraphSize * 0.4;
		telegraph.style.left = `${offset}px`;
	} else {
		telegraph.style.left = `${center - telegraphSize / 2}px`;
		const offset =
			side === "top" ? -telegraphSize * 0.6 : stageHeight - telegraphSize * 0.4;
		telegraph.style.top = `${offset}px`;
	}

	layer.appendChild(telegraph);

	const overshoot = 120;
	const beamLifetimeSeconds = Math.max(resolvedBeamDuration, 120) / 1000;

	const spawnBeam = () => {
		// 戦闘終了などで生成抑止中なら、予兆だけ消して本体は生成しない
		if (blasterSpawningSuppressed) {
			if (telegraph.parentElement) telegraph.remove();
			return;
		}
		if (telegraph.parentElement) telegraph.remove();

		let width: number;
		let height: number;
		let x: number;
		let y: number;

		if (side === "left" || side === "right") {
			width = stageWidth + overshoot * 2;
			height = resolvedThickness;
			x = -overshoot;
			y = center - resolvedThickness / 2;
		} else {
			width = resolvedThickness;
			height = stageHeight + overshoot * 2;
			y = -overshoot;
			x = center - resolvedThickness / 2;
		}

		const entity = spawnEntity({
			position: { x, y },
			velocity: { x: 0, y: 0 },
			shape: "beam",
			width,
			height,
			color: resolvedColor,
			rotationSpeed: 0,
			lifetime: beamLifetimeSeconds,
			damage: resolvedDamage,
			removeOnHit: resolvedRemoveOnHit,
		});
		entity.element.classList.add("entity--blaster");
		entity.element.dataset.blasterSide = side;
		entity.element.classList.add(
			side === "left" || side === "right"
				? "entity--blaster-horizontal"
				: "entity--blaster-vertical",
		);
		entity.element.style.setProperty("--blaster-color", resolvedColor);
		const gradientDirection =
			side === "left"
				? "90deg"
				: side === "right"
					? "270deg"
					: side === "top"
						? "180deg"
						: "0deg";
		const gradient = `linear-gradient(${gradientDirection}, color-mix(in srgb, ${resolvedColor} 6%, transparent) 0%, color-mix(in srgb, ${resolvedColor} 85%, transparent) 45%, color-mix(in srgb, ${resolvedColor} 15%, transparent) 100%)`;
		entity.element.style.background = gradient;
		entity.element.style.boxShadow = `0 0 36px ${resolvedColor}`;
		entity.element.animate(
			[
				{ opacity: 0, filter: "brightness(1.25)" },
				{ opacity: 1, filter: "brightness(1)" },
			],
			{ duration: 120, easing: "linear", fill: "forwards" },
		);
	};

	const telegraphTimer = window.setTimeout(spawnBeam, resolvedTelegraph);
	// 念のため、予兆が長時間残らないように安全策を設定
	window.setTimeout(
		() => {
			window.clearTimeout(telegraphTimer);
			if (telegraph.parentElement) telegraph.remove();
		},
		resolvedTelegraph + resolvedBeamDuration + 800,
	);
};

/**
 * すべてのエンティティの状態を更新します (位置、回転、寿命など)。
 * この関数は、ゲームループ内で毎フレーム呼び出されます。
 * @param {number} deltaSeconds - 前のフレームからの経過時間 (秒)。
 * @param {HTMLElement} playfield - プレイフィールドのDOM要素。
 */
export const updateEntities = (
	deltaSeconds: number,
	playfield: HTMLElement,
) => {
	const stageWidth = playfield.clientWidth;
	const stageHeight = playfield.clientHeight;

	// 配列を逆順にループすることで、ループ中に要素を削除してもインデックスがずれないようにする
	for (let i = entities.length - 1; i >= 0; i--) {
		const entity = entities[i];
		const entityWidth = getEntityWidth(entity);
		const entityHeight = getEntityHeight(entity);
		entity.lifetime -= deltaSeconds;

		// 寿命が尽きたら削除
		if (entity.lifetime <= 0) {
			entity.element.remove();
			entities.splice(i, 1);
			continue;
		}

		const originalSpeed = Math.hypot(entity.velocity.x, entity.velocity.y);

		// ホーミング（追尾）ロジック
		if (homingEnabled && originalSpeed > 0 && entity.shape !== "beam") {
			const { x: playerX, y: playerY } = getPlayerPosition();
			const playerCenterX = playerX + getHeartElement().clientWidth / 2;
			const playerCenterY = playerY + getHeartElement().clientHeight / 2;
			const entityCenterX = entity.position.x + entityWidth / 2;
			const entityCenterY = entity.position.y + entityHeight / 2;
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
				// 進行方向と垂直なベクトル（法線ベクトル）
				const perpX = -currentDirY;
				const perpY = currentDirX;
				// 法線ベクトルと目標方向ベクトルの内積で、曲がるべき方向を決定
				const dot = perpX * targetDirX + perpY * targetDirY;
				const force = HOMING_FORCE; // 曲がる力の強さ（速度によらず一定）
				// 加速度を計算し、速度に加える
				const accX = perpX * force * Math.sign(dot);
				const accY = perpY * force * Math.sign(dot);
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

		// 位置と回転を更新
		entity.position.x += entity.velocity.x * deltaSeconds;
		entity.position.y += entity.velocity.y * deltaSeconds;
		entity.rotation += entity.rotationSpeed * deltaSeconds;

		// DOM要素のスタイルを更新
		const translate = `translate(${entity.position.x}px, ${entity.position.y}px)`;
		const rotate =
			entity.rotation !== 0 ? ` rotate(${entity.rotation}rad)` : "";
		entity.element.style.transform = translate + rotate;

		// 寿命に基づくフェードアウト処理
		const fadeOpacity =
			entity.lifetime > FADE_DURATION
				? 1
				: Math.max(0, entity.lifetime / FADE_DURATION);
		entity.element.style.opacity = `${fadeOpacity * entity.collisionOpacity}`;

		// フェードアウト期間に入ったことを記録
		if (!entity.fading && entity.lifetime <= FADE_DURATION) {
			entity.fading = true;
		}

		// 画面外に出たエンティティを削除
		const entityLeft = entity.position.x;
		const entityTop = entity.position.y;
		const entityRight = entityLeft + entityWidth;
		const entityBottom = entityTop + entityHeight;
		const isOutOfBounds =
			entityRight < -REMOVAL_MARGIN ||
			entityLeft > stageWidth + REMOVAL_MARGIN ||
			entityBottom < -REMOVAL_MARGIN ||
			entityTop > stageHeight + REMOVAL_MARGIN;
		if (isOutOfBounds) {
			entity.element.remove();
			entities.splice(i, 1);
		}
	}
};

/**
 * エンティティとプレイヤー（ハート）との衝突を判定し、処理します。
 * この関数は、ゲームループ内で毎フレーム呼び出されます。
 */
export const detectCollisions = () => {
	if (!isHeartActive()) return;
	// 安全対策：不正なデータを持つエンティティを事前に除去
	for (let i = entities.length - 1; i >= 0; i--) {
		const e = entities[i];
		if (!e || typeof e !== "object" || !("position" in e)) {
			entities.splice(i, 1);
		}
	}

	const heartSvg = getHeartSvg();
	const heartPath = getHeartPath();
	if (!heartSvg || !heartPath || entities.length === 0) return;

	// 座標変換用のマトリックスを取得
	const heartMatrix = heartSvg.getScreenCTM();
	if (!heartMatrix) return;
	const inverseMatrix = heartMatrix.inverse();

	const playfield = document.getElementById("playfield");
	if (!(playfield instanceof HTMLElement)) return;
	const stageRect = playfield.getBoundingClientRect();
	const svgPoint = heartSvg.createSVGPoint();

	// ハートのバウンディングボックス（矩形領域）を取得
	const { x: heartLeft, y: heartTop } = getPlayerPosition();
	const heartRight = heartLeft + getHeartElement().clientWidth;
	const heartBottom = heartTop + getHeartElement().clientHeight;

	for (let i = entities.length - 1; i >= 0; i--) {
		const entity = entities[i];
		if (!entity || !entity.position) continue;

		// フェードアウト中のエンティティは衝突判定をスキップ
		if (entity.fading) {
			continue;
		}

		try {
			// エンティティのバウンディングボックスを取得
			const entityLeft = entity.position.x;
			const entityTop = entity.position.y;
			const entityWidth = getEntityWidth(entity);
			const entityHeight = getEntityHeight(entity);
			const entityRight = entityLeft + entityWidth;
			const entityBottom = entityTop + entityHeight;
			const rotationCos = Math.cos(entity.rotation);
			const rotationSin = Math.sin(entity.rotation);

			// 大まかな矩形での衝突判定 (AABB: Axis-Aligned Bounding Box)
			// これで衝突していなければ、詳細な判定は不要
			if (
				entityRight < heartLeft ||
				entityLeft > heartRight ||
				entityBottom < heartTop ||
				entityTop > heartBottom
			) {
				entity.collisionOpacity = 1; // 衝突していないので不透明度を1に戻す
				continue;
			}

			// 詳細なピクセルパーフェクト衝突判定
			let hit = false;
			// エンティティの矩形領域をサンプリング
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
					// サンプル点がハートの矩形外ならスキップ
					if (
						sx < heartLeft ||
						sx > heartRight ||
						sy < heartTop ||
						sy > heartBottom
					)
						continue;

					// サンプル点がエンティティの形状内にあるか判定
					if (
						!isPointInEntity(
							sx + 0.5,
							sy + 0.5,
							entity,
							rotationCos,
							rotationSin,
						)
					)
						continue;

					// サンプル点をSVG座標系に変換
					svgPoint.x = stageRect.left + sx;
					svgPoint.y = stageRect.top + sy;
					const transformed = svgPoint.matrixTransform(inverseMatrix);

					// 変換した点がハートのパス（塗りつぶし領域）内にあるか判定
					const isInside = (heartPath as SVGGeometryElement).isPointInFill(
						transformed as unknown as DOMPoint,
					);
					if (isInside) {
						hit = true;
						break;
					}
				}
			}

			if (!hit) {
				entity.collisionOpacity = 1;
				continue;
			}

			// --- 衝突時の処理 ---
			// エンティティを半透明にする
			entity.collisionOpacity = ENTITY_MIN_OPACITY;
			// プレイヤーにダメージを与える
			const damageAmount = entity.damage ?? ENTITY_DAMAGE;
			// 攻撃ごとのダメージ設定を優先し、未設定時のみ従来値を使用
			const wasDamaged = takeDamage(damageAmount);
			// ハートの無敵演出（点滅）を開始
			setHeartOpacity(wasDamaged);

			// 衝突時にエンティティを削除する設定が有効な場合
			const shouldRemoveOnHit = entity.removeOnHit;
			// ブラスターは持続するため removeOnHit=false を尊重する
			if (wasDamaged && removeBulletsOnHit && shouldRemoveOnHit) {
				try {
					entity.element.remove();
				} catch {}
				const idx = entities.findIndex((e) => e.id === entity.id);
				if (idx !== -1) entities.splice(idx, 1);
			}
		} catch (err) {
			// 個々のエンティティでエラーが発生しても、ループを継続する
			console.error("detectCollisionsでエンティティ処理中にエラー:", err);
		}
	}
};
