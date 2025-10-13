import { COLORS, DIRECTION_MAP, SPEED } from "./constants.js";

let x = 0;
let y = 0;
let heartSvg: SVGSVGElement | null = null;
let heartPath: SVGGeometryElement | null = null;
let currentIndex = 6;
let currentColor = COLORS[currentIndex];

/** 現在のハート座標を返す */
export const getPlayerPosition = () => ({ x, y });
/** ハートのDOM要素を取得し、存在しなければ例外を送出する */
export const getHeartElement = (): HTMLElement => {
	const el = document.getElementById("heart");
	if (!el) throw new Error("#heart が見つかりません");
	return el as HTMLElement;
};
/** 描画済みのハートSVGを返す */
export const getHeartSvg = () => heartSvg;
/** ハートSVG内のパスを返す */
export const getHeartPath = () => heartPath;

/**
 * プレイヤーの座標を入力キーと経過時間から更新する
 * @param deltaSeconds 前フレームからの経過秒数
 * @param pressedKeys 押下中キーの集合（小文字）
 * @param playfield 移動範囲となるプレイフィールド要素
 */
export const updatePlayerPosition = (
	deltaSeconds: number,
	pressedKeys: Set<string>,
	playfield: HTMLElement,
) => {
	let dx = 0;
	let dy = 0;
	pressedKeys.forEach((key) => {
		const direction = DIRECTION_MAP[key as keyof typeof DIRECTION_MAP];
		if (direction) {
			dx += direction[0];
			dy += direction[1];
		}
	});

	if (dx !== 0 || dy !== 0) {
		// 対角移動でも一定速度となるように正規化
		const length = Math.hypot(dx, dy) || 1;
		dx /= length;
		dy /= length;
		x += dx * SPEED * deltaSeconds;
		y += dy * SPEED * deltaSeconds;

		const maxX = playfield.clientWidth - getHeartElement().clientWidth;
		const maxY = playfield.clientHeight - getHeartElement().clientHeight;
		x = Math.max(0, Math.min(x, maxX));
		y = Math.max(0, Math.min(y, maxY));

		getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
	}
};

/** ハートの色をカラーパレット順に切り替える */
export const changeHeartColor = () => {
	currentIndex = (currentIndex + 1) % COLORS.length;
	currentColor = COLORS[currentIndex];
	if (heartPath) {
		heartPath.style.fill = currentColor;
	} else if (heartSvg) {
		const path = heartSvg.querySelector("path");
		if (path instanceof SVGGeometryElement) {
			heartPath = path;
			heartPath.style.fill = currentColor;
		}
	}
};

/** 被弾状況に応じてハートの不透明度を更新する */
export const setHeartOpacity = (wasHit: boolean) => {
	getHeartElement().style.opacity = wasHit ? `${0.3}` : "1";
};

/**
 * ハートのSVGを非同期に読み込み、初期位置と色を設定する
 * エラー時には詳細をコンソールへ出力する
 */
export const loadSvg = async () => {
	try {
		const response = await fetch("./assets/heart-shape-svgrepo-com.svg");
		const svgText = await response.text();
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
		heartSvg = svgDoc.documentElement as unknown as SVGSVGElement;
		heartSvg.style.width = "100%";
		heartSvg.style.height = "100%";
		getHeartElement().appendChild(heartSvg);
		const path = heartSvg.querySelector("path");
		if (path instanceof SVGGeometryElement) {
			heartPath = path;
			heartPath.style.fill = currentColor;
		}
		const playfield = document.getElementById("playfield");
		if (!playfield) throw new Error("#playfield が見つかりません");
		x = (playfield.clientWidth - getHeartElement().clientWidth) / 2;
		y = (playfield.clientHeight - getHeartElement().clientHeight) / 2;
		getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
	} catch (error) {
		console.error("SVG の読み込みに失敗しました:", error);
	}
};
