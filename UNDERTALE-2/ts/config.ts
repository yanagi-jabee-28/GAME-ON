/**
 * このファイルは、ゲームバランスに関わる設定値を管理します。
 *
 * 【constants.ts との違い】
 * - constants.ts: システム定数（UI、キーバインド、技術的パラメータ）
 * - config.ts: ゲームバランス設定（プレイヤー/敵のステータス、ダメージ、攻撃パターン）
 *
 * このファイルで値を調整することで、ゲームの難易度やバランスを変更できます。
 */

import type { EnemyAttackPattern, EnemyData } from "./types.ts";

// ========================================
// プレイヤー設定
// ========================================

/**
 * プレイヤーの初期ステータス
 */
export const PLAYER_CONFIG = {
	/** プレイヤー名 */
	name: "CHARA",
	/** レベル */
	level: 1,
	/** 最大HP */
	maxHp: 20,
	/** 初期HP */
	currentHp: 20,
	/** 移動速度 (ピクセル/秒) */
	speed: 180,
	/** ダメージを受けた後の無敵時間 (ミリ秒) */
	invincibilityMs: 250,
} as const;

/**
 * プレイヤーの視覚効果設定
 */
export const PLAYER_VISUAL_CONFIG = {
	/** ダメージを受けた際の最低不透明度 (0.0 ~ 1.0) */
	damageMinOpacity: 0.3,
	/** ハートが破壊されてからゲームオーバー画面表示までの待機時間 (ミリ秒) */
	gameoverDelayMs: 700,
	/** ハートの色変更パレット */
	heartColors: [
		"hsl(180 100% 50%)", // Cyan (シアン)
		"hsl(30 100% 50%)", // Orange (オレンジ)
		"hsl(220 100% 50%)", // Blue (青)
		"hsl(285 100% 50%)", // Purple (紫)
		"hsl(120 100% 50%)", // Green (緑)
		"hsl(60 100% 50%)", // Yellow (黄)
		"hsl(0 100% 50%)", // Red (赤)
		"hsl(0 0% 100%)", // White (白)
	],
} as const;

// ========================================
// 戦闘設定
// ========================================

/**
 * 戦闘システムの基本設定
 */
export const COMBAT_CONFIG = {
	/** 戦闘の持続時間 (ミリ秒) - Fightボタンを押してからエンティティ攻撃が終了するまで */
	durationMs: 10000,
	/** 攻撃バーのアニメーション時間 (ミリ秒) */
	attackBarDurationMs: 1000,
} as const;

/**
 * 攻撃バーのタイミング判定設定
 */
export const ATTACK_TIMING_CONFIG = {
	/** 最大攻撃力（中央でヒットした時） */
	maxDamage: 100,
	/** 最小攻撃力（端でヒットした時） */
	minDamage: 10,
	/** PERFECT判定の範囲（中央から±この値以内） */
	perfectRange: 0.1, // 10%以内
	/** GOOD判定の範囲（中央から±この値以内） */
	goodRange: 0.25, // 25%以内
	/** OK判定の範囲（中央から±この値以内） */
	okRange: 0.4, // 40%以内
	// それ以外はMISS扱い
} as const;

/**
 * 攻撃バーの位置（0.0～1.0）から攻撃力を計算します。
 * 中央（0.5）が最高値で、端に行くほど低下します。
 * @param position - 攻撃バーの位置（0.0～1.0、0.5が中央）
 * @returns 計算された攻撃力
 */
export function calculateAttackDamage(position: number): number {
	const { maxDamage, minDamage } = ATTACK_TIMING_CONFIG;
	// 中央（0.5）からの距離を計算（0.0～0.5）
	const distanceFromCenter = Math.abs(position - 0.5);
	// 距離に応じて線形的に減衰（0.0が中央、0.5が端）
	const damageRatio = 1 - distanceFromCenter / 0.5;
	// 最小値と最大値の範囲で計算
	return Math.round(minDamage + (maxDamage - minDamage) * damageRatio);
}

/**
 * 攻撃バーの位置から判定ランクを取得します。
 * @param position - 攻撃バーの位置（0.0～1.0、0.5が中央）
 * @returns 判定ランク（"PERFECT" | "GOOD" | "OK" | "MISS"）
 */
export function getAttackRank(
	position: number,
): "PERFECT" | "GOOD" | "OK" | "MISS" {
	const { perfectRange, goodRange, okRange } = ATTACK_TIMING_CONFIG;
	const distanceFromCenter = Math.abs(position - 0.5);

	if (distanceFromCenter <= perfectRange) return "PERFECT";
	if (distanceFromCenter <= goodRange) return "GOOD";
	if (distanceFromCenter <= okRange) return "OK";
	return "MISS";
}

// ========================================
// エンティティ（弾幕攻撃）設定
// ========================================

/**
 * エンティティの基本設定
 */
export const ENTITY_CONFIG = {
	/** エンティティが与えるダメージ量 */
	damage: 2,
	/** エンティティの寿命 (秒) */
	lifetime: 4.5,
	/** 消滅前のフェードアウト時間 (秒) */
	fadeDuration: 0.5,
	/** 衝突時の最低不透明度 (0.0 ~ 1.0) */
	collisionMinOpacity: 0.3,
	/** ホーミング（追尾）の強さ（曲がる力） */
	homingForce: 150,
	/** 画面外削除のマージン (ピクセル) */
	removalMargin: 160,
} as const;

/**
 * ブラスター攻撃の設定
 */
export const BLASTER_CONFIG = {
	/** ブラスターが与えるダメージ量 */
	damage: 2,
	/** 予兆表示時間 (ミリ秒) */
	telegraphDurationMs: 1000,
	/** 本体の滞在時間 (ミリ秒)。0.5秒 = 500ms 以上に設定し、再ヒットを許可 */
	beamDurationMs: 500,
	/** ビームの太さ (ピクセル) */
	thickness: 20,
	/** ビームおよび予兆の基本色 */
	color: "hsla(44 98% 68% / 1)",
	/** 衝突時に自動で削除しない */
	removeOnHit: false,
} as const;

/**
 * スポーン確率に関する設定
 * - blasterChance: ブラスター攻撃を選ぶ確率 (0.0 - 1.0)
 * - entityShapeWeights: 円/四角/三角/星 等の出現重み (相対値)
 */
export const SPAWN_CONFIG = {
	/** ブラスターが選ばれる確率 (0.0 - 1.0) */
	blasterChance: 0.7,
	/** 図形エンティティの出現重み。キーは shape 名、値は相対重み */
	entityShapeWeights: {
		circle: 40,
		square: 25,
		triangle: 20,
		star: 15,
	},
} as const;

/**
 * 敵の初期データ設定。
 * 各敵のHP、攻撃力、防御力などのパラメータをここで定義します。
 */
export const ENEMY_DATA_PRESETS: Record<string, EnemyData> = {
	skull: {
		id: "skull",
		name: "がいこつ",
		maxHp: 95,
		currentHp: 95,
		attack: 5,
		defense: 0,
		attackPatterns: ["basic"],
	},
	fish: {
		id: "fish",
		name: "さかな",
		maxHp: 80,
		currentHp: 80,
		attack: 3,
		defense: 2,
		attackPatterns: ["basic"],
	},
	papyrus: {
		id: "papyrus",
		name: "パピルス",
		maxHp: 99,
		currentHp: 80,
		attack: 8,
		defense: 5,
		attackPatterns: ["basic", "special"],
	},
};

/**
 * 敵の攻撃パターン設定（将来の拡張用）。
 * 各パターンで生成されるエンティティの種類や特性を定義します。
 */
export const ATTACK_PATTERNS: Record<string, EnemyAttackPattern> = {
	basic: {
		id: "basic",
		name: "基本攻撃",
		entities: {
			shape: "circle",
			color: "hsl(0 0% 90%)",
			size: 24,
			damage: 1,
		},
	},
	special: {
		id: "special",
		name: "特殊攻撃",
		entities: {
			shape: "star",
			color: "hsl(60 100% 50%)",
			size: 32,
			damage: 2,
		},
	},
};
