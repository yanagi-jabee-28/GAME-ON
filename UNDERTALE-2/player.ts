import {
	COLORS,
	DAMAGE_COOLDOWN_MS,
	DIRECTION_MAP,
	GAMEOVER_DELAY_MS,
	SPEED,
} from "./constants.js";

let x = 0;
let y = 0;
let heartSvg: SVGSVGElement | null = null;
let heartPath: SVGGeometryElement | null = null;
let currentIndex = 6;
let currentColor = COLORS[currentIndex];
// プレイヤーのHP管理
const MAX_HP = 20;
let hp = MAX_HP;
let lastDamageTime = 0;
// プレイヤー死亡フラグ（HP=0 のとき移動を無効化する）
let isDead = false;
// 砕け始め（ヒビ）を表示する時間（ミリ秒）
const BROKING_DISPLAY_MS = 900;

// ハート破片（パーティクル）を生成して飛ばす
const spawnHeartShards = (count = 12) => {
	try {
		const container = getHeartElement();
		const rect = container.getBoundingClientRect();
		const shards: HTMLElement[] = [];
			// 均等な角度分布で破片を飛ばす（少しだけ角度と速度にジッターを入れる）
			for (let i = 0; i < count; i++) {
				const s = document.createElement("div");
				s.className = "heart-shard";
				const size = 4 + Math.random() * 8; // px
				s.style.width = `${size}px`;
				s.style.height = `${size}px`;
				s.style.background = currentColor || "#ff4d4d";
				s.style.position = "absolute";
				s.style.left = `${rect.width / 2 - size / 2}px`;
				s.style.top = `${rect.height / 2 - size / 2}px`;
				s.style.borderRadius = "20%";
				s.style.pointerEvents = "none";
				s.style.transform = 'translate(0px,0px) scale(1)';
				container.appendChild(s);
				shards.push(s);

				// 均等角度（ラジアン）
				const baseAngle = (i / count) * Math.PI * 2;
				// 小ジッターを加えて自然に見せる
				const jitter = (Math.random() - 0.5) * (Math.PI / count);
				const angle = baseAngle + jitter;
				// 速度も少しバラつかせる
				const speed = 60 + Math.random() * 120; // px
				const dx = Math.cos(angle) * speed;
				const dy = Math.sin(angle) * speed - 10; // 少し上向きのバイアス
				const rotate = (Math.random() - 0.5) * 540;
				const duration = 600 + Math.random() * 700; // ms

				s.animate(
					[
						{ transform: `translate(0px,0px) rotate(0deg) scale(1)`, opacity: 1 },
						{ transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(0.6)`, opacity: 0 },
					],
					{
						duration,
						easing: "cubic-bezier(.2,.8,.2,1)",
					},
				).onfinish = () => {
					if (s.parentElement === container) container.removeChild(s);
				};
			}
	} catch (err) {
		// ignore DOM errors
		console.error("spawnHeartShards failed", err);
	}
};

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
		const bar = document.querySelector(
			'#player-status .status-hp-bar[role="progressbar"]',
		) as HTMLElement | null;
		const fill = bar?.querySelector(".status-hp-fill") as HTMLElement | null;
		const value = document.querySelector(
			"#player-status .status-hp-value",
		) as HTMLElement | null;
		if (!bar || !fill || !value) return;
		bar.setAttribute("aria-valuenow", String(hp));
		const max = Number(bar.getAttribute("aria-valuemax") ?? MAX_HP) || MAX_HP;
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
	// HP が 0 になったらゲーム処理を止め、プレイヤー移動を無効にしてからアニメを再生
	if (hp === 0 && !isDead) {
		isDead = true;
		// まずゲーム側に停止を通知（game.ts がループを止め、スポーン等を停止します）
		const stopEvt = new CustomEvent("gamestop", { detail: { hp } });
		document.dispatchEvent(stopEvt);
		// その後にビジュアルの破壊アニメーションを再生
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
		const brokingUrl = new URL(
			"./assets/heart-shape-svgrepo-com-broking.svg",
			import.meta.url,
		).href;
		const brokenUrl = new URL(
			"./assets/heart-shape-svgrepo-com-broken.svg",
			import.meta.url,
		).href;

		// helper to load an svg and append
		const loadAndAppend = async (url: string) => {
			const resp = await fetch(url);
			if (!resp.ok) throw new Error(`SVG fetch failed: ${resp.status}`);
			const text = await resp.text();
			const parser = new DOMParser();
			const doc = parser.parseFromString(text, "image/svg+xml");
			const svg = doc.querySelector("svg");
			if (!svg || !(svg instanceof SVGSVGElement))
				throw new Error("invalid svg");
			svg.style.width = "100%";
			svg.style.height = "100%";
			// ensure heart container is visible
			heartEl.style.display = "";
			heartEl.style.opacity = "1";
			heartEl.appendChild(svg);
			return svg as SVGSVGElement;
		};

		// 砕け始めを表示。fetch が失敗した場合は画像要素で代替表示する
		let brokingSvg: SVGSVGElement | null = null;
		try {
			brokingSvg = await loadAndAppend(brokingUrl);
		} catch {
			// fallback to <img>
			const img = document.createElement("img");
			img.src = brokingUrl;
			img.style.width = "100%";
			img.style.height = "100%";
			heartEl.appendChild(img);
			// wait a moment to simulate animation timing
			await new Promise((res) => setTimeout(res, BROKING_DISPLAY_MS));
			if (img.parentElement === heartEl) heartEl.removeChild(img);
		}
		// 500ms 表示してから壊れた状態へ差し替え
		if (brokingSvg) {
			await new Promise((res) => setTimeout(res, BROKING_DISPLAY_MS));
			if (brokingSvg.parentElement === heartEl) heartEl.removeChild(brokingSvg);
		}

		// 最終破片を表示
		// 最終破片を表示（heartSvg に保持しておく）
		// 最終破片を表示（heartSvg に保持しておく）
		try {
			heartSvg = await loadAndAppend(brokenUrl);
			const finalPath = heartSvg.querySelector("path");
			if (finalPath instanceof SVGGeometryElement) heartPath = finalPath;
			// 少しだけ表示してからイベントを発火（表示時間は任意で延長可能）
			await new Promise((res) => setTimeout(res, 400));
			// 破片を飛ばす
			spawnHeartShards(14);
			// 本体のSVGは破片を生成したら削除しておく（破片は DOM に残る）
			if (heartSvg && heartSvg.parentElement === heartEl) {
				heartEl.removeChild(heartSvg);
				heartSvg = null;
				heartPath = null;
			}
		} catch {
			// fallback to image for final broken state
			const img = document.createElement("img");
			img.src = brokenUrl;
			img.style.width = "100%";
			img.style.height = "100%";
			heartEl.appendChild(img);
			await new Promise((res) => setTimeout(res, 400));
			// 破片を飛ばす（フォールバック経路でも同様に）
			spawnHeartShards(14);
			// フォールバックで追加した img 本体は削除しておく
			if (img.parentElement === heartEl) heartEl.removeChild(img);
		}

		// After animation completes, wait a bit so the shard animation settles, then dispatch 'gameover' so overlay can show
		try {
			// 少し余裕を持って待機（破片アニメーションと視覚的余韻）
			await new Promise((res) => setTimeout(res, GAMEOVER_DELAY_MS));
			const evt = new CustomEvent("gameover", { detail: { hp } });
			document.dispatchEvent(evt);
		} catch (err) {
			console.error("failed to dispatch gameover event", err);
		}
	} catch (err) {
		console.error("game over animation failed", err);
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
	if (isDead) return; // 死亡時は移動を無効化
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
