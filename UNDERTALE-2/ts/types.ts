/**
 * このファイルでは、プロジェクト全体で共有されるTypeScriptの「型」を定義します。
 * 型を定義することで、コードの可読性が向上し、予期せぬエラーを防ぐことができます。
 * 例えば、`Entity` 型は、エンティティがどのようなプロパティを持つべきかを明確に示します。
 */

/**
 * エンティティの形状を表す型。
 * これにより、形状を文字列で指定する際にタイポなどを防ぐことができます。
 */
export type EntityShape = "circle" | "square" | "star" | "triangle";

/**
 * ゲーム内に登場するエンティティ（敵の攻撃など）の構造を定義する型。
 */
export type Entity = {
	/** エンティティを一位に識別するためのID */
	id: number;
	/** エンティティに対応するHTML要素 */
	element: HTMLDivElement;
	/** 現在の位置 (x, y座標) */
	position: { x: number; y: number };
	/** 現在の速度 (x, y方向のベクトル) */
	velocity: { x: number; y: number };
	/** エンティティのサイズ (ピクセル) */
	size: number;
	/** 現在の回転角度 (ラジアン) */
	rotation: number;
	/** 回転速度 (ラジアン/秒) */
	rotationSpeed: number;
	/** エンティティの形状 */
	shape: EntityShape;
	/** エンティティの色 */
	color: string;
	/** 残りの寿命 (秒) */
	lifetime: number;
	/** 衝突時に適用される不透明度 (0.0 ~ 1.0) */
	collisionOpacity: number;
	/** フェードアウト中かどうかのフラグ */
	fading: boolean;
};

/**
 * `spawnEntity` 関数で新しいエンティティを生成する際のオプションを定義する型。
 * `position` 以外は省略可能です。
 */
export type EntitySpawnOptions = {
	/** 生成する位置 (必須) */
	position: { x: number; y: number };
	/** 初速度 (省略時: { x: 0, y: 0 }) */
	velocity?: { x: number; y: number };
	/** サイズ (省略時: 24) */
	size?: number;
	/** 形状 (省略時: 'circle') */
	shape?: EntityShape;
	/** 色 (省略時: 'hsl(0 0% 90%)') */
	color?: string;
	/** 回転速度 (省略時: 0) */
	rotationSpeed?: number;
};

/**
 * 画面上部に表示される敵シンボルの種類を定義する型。
 */
export type EnemySymbolType = "emoji" | "image";

/**
 * 敵シンボルの構造を定義する型。
 */
export type EnemySymbol = {
	/** シンボルを一位に識別するためのID */
	id: string;
	/** シンボルの種類 */
	type: EnemySymbolType;
	/** シンボルの内容 (絵文字の文字列、または画像のURL) */
	content: string;
	/** シンボルに対応するHTML要素 (DOMに追加された後に設定される) */
	element?: HTMLElement | Text;
};
