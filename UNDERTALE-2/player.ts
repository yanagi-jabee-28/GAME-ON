import { COLORS, DIRECTION_MAP, SPEED } from "./constants.js";

let x = 0;
let y = 0;
let heartSvg: SVGSVGElement | null = null;
let heartPath: SVGGeometryElement | null = null;
let currentIndex = 6;
let currentColor = COLORS[currentIndex];
// プレイヤーのHP管理
const MAX_HP = 20;
let hp = MAX_HP;
const DAMAGE_COOLDOWN_MS = 500; // 被ダメージの無敵時間（ミリ秒）
let lastDamageTime = 0;

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

/** 現在のHPを返す */
export const getHp = () => hp;

/** HP表示をDOMに反映する */
const updateHpUi = () => {
	try {
		const bar = document.querySelector('#player-status .status-hp-bar[role="progressbar"]') as HTMLElement | null;
		const fill = bar?.querySelector('.status-hp-fill') as HTMLElement | null;
		const value = document.querySelector('#player-status .status-hp-value') as HTMLElement | null;
		if (!bar || !fill || !value) return;
		bar.setAttribute('aria-valuenow', String(hp));
		const max = Number(bar.getAttribute('aria-valuemax') ?? MAX_HP) || MAX_HP;
		const pct = max > 0 ? (hp / max) * 100 : 0;
		fill.style.width = `${pct}%`;
		value.textContent = `${hp}\u00A0/\u00A0${max}`;
	} catch {
		// DOM が利用できない場合は安全に無視する
	}
};

/** 指定量のダメージを与える。無敵時間内は false を返す */
export const takeDamage = (amount: number) => {
	const now = performance.now();
	if (now - lastDamageTime < DAMAGE_COOLDOWN_MS) return false;
	lastDamageTime = now;
	hp = Math.max(0, hp - amount);
	updateHpUi();
	// 被弾時のビジュアルフィードバックは呼び出し側で行うためここでは行わない
	// HP が 0 になったらゲームオーバー処理を開始
	if (hp === 0) {
		triggerGameOver();
	}
	return true;
};

/** ゲームオーバー演出: ハートの SVG を砕けるアニメーションへ差し替える */
const triggerGameOver = async () => {
	try {
		const heartEl = getHeartElement();

		// 既存のSVG をクリア（もしあれば）
		if (heartSvg && heartSvg.parentElement === heartEl) {
			heartEl.removeChild(heartSvg);
			heartSvg = null;
			heartPath = null;
		}

		// 砕け始めの SVG を読み込み、短時間表示
		const brokingUrl = new URL("./assets/heart-shape-svgrepo-com-broking.svg", import.meta.url).href;
		const brokenUrl = new URL("./assets/heart-shape-svgrepo-com-broken.svg", import.meta.url).href;

		// helper to load an svg and append
		const loadAndAppend = async (url: string) => {
			const resp = await fetch(url);
			if (!resp.ok) throw new Error(`SVG fetch failed: ${resp.status}`);
			const text = await resp.text();
			const parser = new DOMParser();
			const doc = parser.parseFromString(text, 'image/svg+xml');
			const svg = doc.querySelector('svg');
			if (!svg || !(svg instanceof SVGSVGElement)) throw new Error('invalid svg');
			svg.style.width = '100%';
			svg.style.height = '100%';
			heartEl.appendChild(svg);
			return svg as SVGSVGElement;
		};

		// 砕け始めを表示
		const brokingSvg = await loadAndAppend(brokingUrl);
		// 500ms 表示してから壊れた状態へ差し替え
		await new Promise((res) => setTimeout(res, 500));
		if (brokingSvg.parentElement === heartEl) heartEl.removeChild(brokingSvg);

		// 最終破片を表示
	// 最終破片を表示（heartSvg に保持しておく）
	heartSvg = await loadAndAppend(brokenUrl);
	const finalPath = heartSvg.querySelector('path');
	if (finalPath instanceof SVGGeometryElement) heartPath = finalPath;
	// 少しだけ表示してからイベントを発火（表示時間は任意で延長可能）
	await new Promise((res) => setTimeout(res, 400));

	// dispatch gameover event on document so game.ts can listen
	const evt = new CustomEvent('gameover', { detail: { hp: hp } });
	document.dispatchEvent(evt);
	} catch (err) {
		console.error('game over animation failed', err);
		// それでも gameover イベントは発火する
		const evt = new CustomEvent('gameover', { detail: { hp: hp } });
		document.dispatchEvent(evt);
	}
};

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

/** プレイフィールド内に収まるように現在位置を補正する */
export const clampPlayerToBounds = (playfield: HTMLElement) => {
	const maxX = playfield.clientWidth - getHeartElement().clientWidth;
	const maxY = playfield.clientHeight - getHeartElement().clientHeight;
	x = Math.max(0, Math.min(x, maxX));
	y = Math.max(0, Math.min(y, maxY));
	getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
};

/**
 * ハートのSVGを非同期に読み込み、初期位置と色を設定する
 * エラー時には詳細をコンソールへ出力する
 */
export const loadSvg = async () => {
	try {
		// Resolve the asset relative to this module so builds (Vite, bundlers)
		// and GitHub Pages subpaths are handled correctly.
		const url = new URL("./assets/heart-shape-svgrepo-com.svg", import.meta.url)
			.href;
		const response = await fetch(url);
		if (!response.ok)
			throw new Error(
				`SVG fetch failed: ${response.status} ${response.statusText} (${url})`,
			);
		const svgText = await response.text();
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
		// Try to find a real <svg> element (parser may return HTML on 404 pages)
		const svgEl = svgDoc.querySelector("svg");
		if (!svgEl || !(svgEl instanceof SVGSVGElement)) {
			throw new Error("取得したファイルは有効なSVGではありませんでした。");
		}
		heartSvg = svgEl as SVGSVGElement;
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
