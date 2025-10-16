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
 * キーボードの入力キーと、それに対応する移動方向のベクトルを定義します。
 * [x方向, y方向] の形式で、-1, 0, 1 のいずれかの値を持ちます。
 * これにより、矢印キーとWASDキーの両方で操作できるようになります。
 */
export const DIRECTION_MAP: Record<string, Readonly<[number, number]>> = {
	arrowup: [0, -1], // 上
	w: [0, -1], // 上
	arrowdown: [0, 1], // 下
	s: [0, 1], // 下
	arrowleft: [-1, 0], // 左
	a: [-1, 0], // 左
	arrowright: [1, 0], // 右
	d: [1, 0], // 右
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
