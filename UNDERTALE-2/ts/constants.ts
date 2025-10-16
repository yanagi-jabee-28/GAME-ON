/**
 * ゲームのシステム定数を定義するファイルです。
 * 
 * 【config.ts との違い】
 * - constants.ts: システム定数（UI、キーバインド、技術的パラメータ）
 * - config.ts: ゲームバランス設定（プレイヤー/敵のステータス、ダメージ、攻撃パターン）
 * 
 * このファイルは主に技術的な定数やUI設定を扱います。
 * ゲームバランスの調整は config.ts で行ってください。
 */

import {
	PLAYER_CONFIG,
	PLAYER_VISUAL_CONFIG,
	ENTITY_CONFIG,
	COMBAT_CONFIG,
} from "./config.ts";

// ========================================
// ゲームバランス設定からの再エクスポート
// （後方互換性のため、既存のコードが動作するように）
// ========================================

/** @deprecated config.ts の PLAYER_CONFIG.speed を使用してください */
export const SPEED = PLAYER_CONFIG.speed;

/** @deprecated config.ts の PLAYER_VISUAL_CONFIG.damageMinOpacity を使用してください */
export const HEART_MIN_OPACITY = PLAYER_VISUAL_CONFIG.damageMinOpacity;

/** @deprecated config.ts の ENTITY_CONFIG.collisionMinOpacity を使用してください */
export const ENTITY_MIN_OPACITY = ENTITY_CONFIG.collisionMinOpacity;

/** @deprecated config.ts の ENTITY_CONFIG.removalMargin を使用してください */
export const REMOVAL_MARGIN = ENTITY_CONFIG.removalMargin;

/** @deprecated config.ts の ENTITY_CONFIG.fadeDuration を使用してください */
export const FADE_DURATION = ENTITY_CONFIG.fadeDuration;

/** @deprecated config.ts の ENTITY_CONFIG.lifetime を使用してください */
export const LIFETIME = ENTITY_CONFIG.lifetime;

/** @deprecated config.ts の PLAYER_VISUAL_CONFIG.heartColors を使用してください */
export const COLORS: string[] = [...PLAYER_VISUAL_CONFIG.heartColors];

// ========================================
// UI関連の定数
// ========================================

/**
 * プレイヤー領域（player-overlay）に表示するテキストのフォントサイズ
 * CSSの単位（rem, pxなど）を含む文字列で指定します。
 */
export const PLAYER_OVERLAY_FONT_SIZE = "1.5rem";

/**
 * プレイヤーのステータス表示（名前、レベル、HP）の基本フォントサイズ
 * CSSの単位（rem, pxなど）を含む文字列で指定します。
 */
export const PLAYER_STATUS_FONT_SIZE = "1rem";

/**
 * プレイヤー（ハート）の基本表示サイズ
 * CSSの単位（rem, pxなど）を含む文字列で指定します。
 */
export const HEART_SIZE = "30px";

/**
 * 行動選択ボタン（FIGHT, ACTなど）の基本フォントサイズ
 * CSSの単位（rem, pxなど）を含む文字列で指定します。
 */
export const ACTION_BUTTON_FONT_SIZE = "1.2rem";

// ========================================
// キーバインディング設定
// ========================================

/**
 * キーバインディング設定
 * ゲーム内で使用するすべてのキーを機能ごとに定義します。
 * ここでキーを追加・変更することで、ゲーム全体の操作を統一的に変更できます。
 */
export const KEY_BINDINGS = {
	/** 決定キー（メニュー選択、メッセージ送り等） */
	CONFIRM: ["z", "Enter"] as const,
	/** キャンセルキー（メニューを戻る等） */
	CANCEL: ["x", "Escape"] as const,
	/** メニューキー */
	MENU: ["c"] as const,
	/** 上移動キー */
	MOVE_UP: ["ArrowUp", "w", "W"] as const,
	/** 下移動キー */
	MOVE_DOWN: ["ArrowDown", "s", "S"] as const,
	/** 左移動キー */
	MOVE_LEFT: ["ArrowLeft", "a", "A"] as const,
	/** 右移動キー */
	MOVE_RIGHT: ["ArrowRight", "d", "D"] as const,
} as const;

/**
 * キーから移動方向のベクトルを取得するマップ
 * KEY_BINDINGSの移動キーから自動生成されます。
 * [x方向, y方向] の形式で、-1, 0, 1 のいずれかの値を持ちます。
 */
export const DIRECTION_MAP: Record<string, Readonly<[number, number]>> = {
	...Object.fromEntries(
		KEY_BINDINGS.MOVE_UP.map((k: string) => [
			k.toLowerCase(),
			[0, -1] as const,
		]),
	),
	...Object.fromEntries(
		KEY_BINDINGS.MOVE_DOWN.map((k: string) => [
			k.toLowerCase(),
			[0, 1] as const,
		]),
	),
	...Object.fromEntries(
		KEY_BINDINGS.MOVE_LEFT.map((k: string) => [
			k.toLowerCase(),
			[-1, 0] as const,
		]),
	),
	...Object.fromEntries(
		KEY_BINDINGS.MOVE_RIGHT.map((k: string) => [
			k.toLowerCase(),
			[1, 0] as const,
		]),
	),
};

/**
 * 指定されたキーが決定キーかどうかを判定します。
 * @param key - チェックするキー
 * @returns 決定キーの場合true
 */
export const isConfirmKey = (key: string): boolean => {
	return KEY_BINDINGS.CONFIRM.includes(key as never);
};

/**
 * 指定されたキーがキャンセルキーかどうかを判定します。
 * @param key - チェックするキー
 * @returns キャンセルキーの場合true
 */
export const isCancelKey = (key: string): boolean => {
	return KEY_BINDINGS.CANCEL.includes(key as never);
};

/**
 * 指定されたキーがメニューキーかどうかを判定します。
 * @param key - チェックするキー
 * @returns メニューキーの場合true
 */
export const isMenuKey = (key: string): boolean => {
	return KEY_BINDINGS.MENU.includes(key as never);
};

/**
 * 指定されたキーが上移動キーかどうかを判定します。
 * @param key - チェックするキー
 * @returns 上移動キーの場合true
 */
export const isMoveUpKey = (key: string): boolean => {
	return KEY_BINDINGS.MOVE_UP.includes(key as never);
};

/**
 * 指定されたキーが下移動キーかどうかを判定します。
 * @param key - チェックするキー
 * @returns 下移動キーの場合true
 */
export const isMoveDownKey = (key: string): boolean => {
	return KEY_BINDINGS.MOVE_DOWN.includes(key as never);
};

/**
 * 指定されたキーが左移動キーかどうかを判定します。
 * @param key - チェックするキー
 * @returns 左移動キーの場合true
 */
export const isMoveLeftKey = (key: string): boolean => {
	return KEY_BINDINGS.MOVE_LEFT.includes(key as never);
};

/**
 * 指定されたキーが右移動キーかどうかを判定します。
 * @param key - チェックするキー
 * @returns 右移動キーの場合true
 */
export const isMoveRightKey = (key: string): boolean => {
	return KEY_BINDINGS.MOVE_RIGHT.includes(key as never);
};

/**
 * 指定されたキーが移動キー（上下左右のいずれか）かどうかを判定します。
 * @param key - チェックするキー
 * @returns 移動キーの場合true
 */
export const isMoveKey = (key: string): boolean => {
	return (
		isMoveUpKey(key) ||
		isMoveDownKey(key) ||
		isMoveLeftKey(key) ||
		isMoveRightKey(key)
	);
};

// ========================================
// ゲームバランス定数（後方互換性のため）
// ========================================

/** @deprecated config.ts の ENTITY_CONFIG.damage を使用してください */
export const ENTITY_DAMAGE = ENTITY_CONFIG.damage;

/** @deprecated config.ts の PLAYER_VISUAL_CONFIG.gameoverDelayMs を使用してください */
export const GAMEOVER_DELAY_MS = PLAYER_VISUAL_CONFIG.gameoverDelayMs;

/** @deprecated config.ts の PLAYER_CONFIG.invincibilityMs を使用してください */
export const DAMAGE_COOLDOWN_MS = PLAYER_CONFIG.invincibilityMs;

/** @deprecated config.ts の COMBAT_CONFIG.durationMs を使用してください */
export const COMBAT_DURATION_MS = COMBAT_CONFIG.durationMs;

// ========================================
// 攻撃バー（Attack Box）の設定
// ========================================

/**
 * 攻撃ボックスのサイズと速度に関する設定値
 */
export const ATTACK_BOX_WIDTH = 20; // 攻撃ボックスの幅 (ピクセル)
export const ATTACK_BOX_HEIGHT = 240; // 攻撃ボックスの高さ (ピクセル)
export const ATTACK_BOX_SPEED = 720; // 攻撃ボックスの速度 (ピクセル/秒)

/** @deprecated config.ts の COMBAT_CONFIG.attackBarDurationMs を使用してください */
export const ATTACK_BOX_DURATION_MS = COMBAT_CONFIG.attackBarDurationMs;

// ========================================
// プレイフィールド（ゲーム領域）の設定
// ========================================

/**
 * プレイフィールド（ゲーム領域）のサイズに関する設定値 (ピクセル)
 * これらは、ウィンドウサイズ変更の最小値、最大値、初期値、および変更ステップを定義します。
 */
export const PLAYFIELD_MIN_WIDTH = 240; // 最小幅
export const PLAYFIELD_MAX_WIDTH = 720; // 最大幅
export const PLAYFIELD_MIN_HEIGHT = 240; // 最小高さ
export const PLAYFIELD_MAX_HEIGHT = 720; // 最大高さ
export const PLAYFIELD_INITIAL_WIDTH = 720; // 初期幅
export const PLAYFIELD_INITIAL_HEIGHT = 240; // 初期高さ
export const PLAYFIELD_SIZE_STEP = 40; // サイズ変更の単位

/** @deprecated config.ts の ENTITY_CONFIG.homingForce を使用してください */
export const HOMING_FORCE = ENTITY_CONFIG.homingForce;
