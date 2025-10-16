/**
 * このファイルは、ゲーム内の敵やその他のゲームデータの設定を管理します。
 * 敵のステータス、攻撃パターンなどを一元管理することで、
 * バランス調整や拡張が容易になります。
 */

import type { EnemyData, EnemyAttackPattern } from "./types.ts";

/**
 * 敵の初期データ設定。
 * 各敵のHP、攻撃力、防御力などのパラメータをここで定義します。
 */
export const ENEMY_DATA_PRESETS: Record<string, EnemyData> = {
	skull: {
		id: "skull",
		name: "がいこつ",
		maxHp: 30,
		currentHp: 30,
		attack: 5,
		defense: 0,
		attackPatterns: ["basic"],
	},
	fish: {
		id: "fish",
		name: "さかな",
		maxHp: 20,
		currentHp: 20,
		attack: 3,
		defense: 2,
		attackPatterns: ["basic"],
	},
	papyrus: {
		id: "papyrus",
		name: "パピルス",
		maxHp: 50,
		currentHp: 50,
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
