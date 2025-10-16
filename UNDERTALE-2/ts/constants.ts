/**
 * プレイヤー領域（player-overlay）に表示するテキストのフォントサイズ
 * CSSの単位（rem, pxなど）を含む文字列で指定します。
 */
export const PLAYER_OVERLAY_FONT_SIZE = "1.5rem";
/**
 * ゲーム全体で共有される設定値を定義するファイルです。
 * これらの値を変更することで、ゲームの挙動を簡単に調整できます。
 */

/**
 * プレイヤー（ハート）の移動速度 (ピクセル/秒)
 * この値を大きくすると、ハートが速く動きます。
 */
export const SPEED = 180;

/**
 * ハートがダメージを受けた際の最低不透明度
 * 0に近いほど透明になり、1に近いほど不透明になります。
 * 無敵状態の視覚的な表現に使われます。
 */
export const HEART_MIN_OPACITY = 0.3;

/**
 * エンティティ（敵の攻撃）がハートと衝突した際の最低不透明度
 * 衝突時にエンティティが少し透明になる演出に使われます。
 */
export const ENTITY_MIN_OPACITY = 0.3;

/**
 * プレイフィールドの画面外に出たエンティティを削除する際のマージン (ピクセル)
 * このマージン領域に入ったエンティティは、画面外とみなされて削除されます。
 * これにより、見えない場所でエンティティが無限に存在し続けるのを防ぎます。
 */
export const REMOVAL_MARGIN = 160;

/**
 * エンティティが消える前のフェードアウトにかかる時間 (秒)
 * エンティティは寿命が尽きる前に、この時間で徐々に透明になります。
 */
export const FADE_DURATION = 0.5;

/**
 * エンティティが画面内に存在し続ける時間 (秒)
 * この時間が経過すると、エンティティはフェードアウトを開始します。
 */
export const LIFETIME = 4.5;

/**
 * デバッグ用にハートの色を変更する際のカラーパレット
 * 'G'キーを押すと、この配列の順番でハートの色が変わります。
 */
export const COLORS: string[] = [
	"hsl(180 100% 50%)", // Cyan (シアン)
	"hsl(30 100% 50%)", // Orange (オレンジ)
	"hsl(220 100% 50%)", // Blue (青)
	"hsl(285 100% 50%)", // Purple (紫)
	"hsl(120 100% 50%)", // Green (緑)
	"hsl(60 100% 50%)", // Yellow (黄)
	"hsl(0 100% 50%)", // Red (赤)
	"hsl(0 0% 100%)", // White (白)
];

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

/**
 * エンティティがプレイヤーに与えるダメージ量
 * この値が大きいほど、1回の衝突で受けるダメージが増えます。
 */
export const ENTITY_DAMAGE = 10;

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

/**
 * プレイヤーのHPが0になった後、破壊演出を経て「GAMEOVER」画面が表示されるまでの待機時間 (ミリ秒)
 */
export const GAMEOVER_DELAY_MS = 700;

/**
 * プレイヤーがダメージを受けた後の無敵時間 (ミリ秒)
 * この時間内は、連続してダメージを受けることはありません。
 */
export const DAMAGE_COOLDOWN_MS = 250;

/**
 * エンティティの攻撃が続く時間（戦闘の持続時間） (ミリ秒)
 * Fightボタンを押してから、エンティティの攻撃が終了するまでの時間です。
 * この時間が経過すると、エンティティの出現が停止し、通常状態に戻ります。
 */
export const COMBAT_DURATION_MS = 10000;

/**
 * 攻撃ボックスのサイズと速度に関する設定値
 */
export const ATTACK_BOX_WIDTH = 20; // 攻撃ボックスの幅 (ピクセル)
export const ATTACK_BOX_HEIGHT = 240; // 攻撃ボックスの高さ (ピクセル)
export const ATTACK_BOX_SPEED = 720; // 攻撃ボックスの速度 (ピクセル/秒)
export const ATTACK_BOX_DURATION_MS = 1000; // 攻撃ボックスのアニメーション時間 (ミリ秒)

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

/**
 * エンティティのホーミング（追尾）の強さ（曲がる力の倍率）
 */
export const HOMING_FORCE = 150;
