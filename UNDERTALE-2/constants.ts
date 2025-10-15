/** プレイヤー（ハート）の移動速度（px/s） */
export const SPEED = 180;
/** ハートがダメージを受けた際の最低不透明度 */
export const HEART_MIN_OPACITY = 0.3;
/** エンティティがハートと衝突した際の最低不透明度 */
export const ENTITY_MIN_OPACITY = 0.3;
/** プレイフィールド外のエンティティを削除する際のマージン */
export const REMOVAL_MARGIN = 160;
/** エンティティが消える前のフェードアウト時間 (秒) */
export const FADE_DURATION = 0.5;
/** エンティティの生存期間 (秒) */
export const LIFETIME = 5;

/** ハートが巡回するカラーパレット */
export const COLORS: string[] = [
	"hsl(180 100% 50%)", // Cyan
	"hsl(30 100% 50%)", // Orange
	"hsl(220 100% 50%)", // Blue
	"hsl(285 100% 50%)", // Purple
	"hsl(120 100% 50%)", // Green
	"hsl(60 100% 50%)", // Yellow
	"hsl(0 100% 50%)", // Red
	"hsl(0 0% 100%)", // White
];

/** キー入力と移動方向ベクトルのマッピング */
export const DIRECTION_MAP: Record<string, Readonly<[number, number]>> = {
	arrowup: [0, -1],
	w: [0, -1],
	arrowdown: [0, 1],
	s: [0, 1],
	arrowleft: [-1, 0],
	a: [-1, 0],
	arrowright: [1, 0],
	d: [1, 0],
};

/** エンティティが与えるダメージ（プレイヤーに当たったとき） */
export const ENTITY_DAMAGE = 10;

/** プレイヤーステータス表示のフォントサイズ（CSSで使用する単位付き文字列） */
export const PLAYER_STATUS_FONT_SIZE = "1rem";

/** ハートの表示サイズ（CSS 単位付き文字列） */
export const HEART_SIZE = "30px";
/** 破片演出が終わった後、GAMEOVER 画面を表示するまでの待機時間（ミリ秒） */
export const GAMEOVER_DELAY_MS = 700;
