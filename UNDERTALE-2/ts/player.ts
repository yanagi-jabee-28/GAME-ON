/**
 * このファイルは、プレイヤー（ハート）に関するすべてのロジックを管理します。
 * - プレイヤーの位置、HP、色などの状態管理
 * - プレイヤーの移動処理
 * - ダメージ処理と無敵時間
 * - ゲームオーバー時の破壊演出
 * - プレイヤーを表すSVGの読み込みと操作
 */
import {
	COLORS,
	DAMAGE_COOLDOWN_MS,
	DIRECTION_MAP,
	GAMEOVER_DELAY_MS,
	SPEED,
} from "./constants.ts";

// --- プレイヤーの状態を管理する変数 ---

/** プレイヤーのX座標 (プレイフィールド左上基準) */
let x = 0;
/** プレイヤーのY座標 (プレイフィールド左上基準) */
let y = 0;
/** ハートのSVG要素 */
let heartSvg: SVGSVGElement | null = null;
/** ハートの形状を定義するSVGパス要素 */
let heartPath: SVGGeometryElement | null = null;
/** 現在のハートの色のインデックス (COLORS配列に対応) */
let currentIndex = 6; // 初期色は赤
/** 現在のハートの色 */
let currentColor = COLORS[currentIndex];
/** 最大HP */
const MAX_HP = 20;
/** 現在のHP */
let hp = MAX_HP;
/** 最後にダメージを受けて無敵状態が終わる時刻のタイムスタンプ */
let lastDamageExpiry = 0;
/** プレイヤーが死亡したかどうかのフラグ */
let isDead = false;
/** 無敵状態の終了を管理するタイマーID */
let invulnerabilityTimer: number | null = null;
/** ハートが「壊れかけている」画像を表示する時間 (ミリ秒) */
const BROKING_DISPLAY_MS = 900;

/**
 * ハートが破壊されたときに、破片が飛び散るアニメーションを生成します。
 * @param {number} [count=12] - 生成する破片の数。
 */
const spawnHeartShards = (count = 12) => {
	try {
		const container = getHeartElement();
		const rect = container.getBoundingClientRect();
		const shards: HTMLElement[] = [];
		for (let i = 0; i < count; i++) {
			const s = document.createElement("div");
			s.className = "heart-shard";
			const size = 4 + Math.random() * 8; // 破片のサイズをランダムに
			s.style.width = `${size}px`;
			s.style.height = `${size}px`;
			s.style.background = currentColor || "#ff4d4d"; // 現在のハートの色を使用
			s.style.position = "absolute";
			// ハートの中心から生成
			s.style.left = `${rect.width / 2 - size / 2}px`;
			s.style.top = `${rect.height / 2 - size / 2}px`;
			s.style.borderRadius = "20%";
			s.style.pointerEvents = "none";
			s.style.transform = "translate(0px,0px) scale(1)";
			container.appendChild(s);
			shards.push(s);

			// 飛び散る方向と速度をランダムに設定
			const baseAngle = (i / count) * Math.PI * 2; // 基本角度
			const jitter = (Math.random() - 0.5) * (Math.PI / count); // 角度のばらつき
			const angle = baseAngle + jitter;
			const speed = 60 + Math.random() * 120;
			const dx = Math.cos(angle) * speed;
			const dy = Math.sin(angle) * speed - 10; // 少し上向きに
			const rotate = (Math.random() - 0.5) * 540;
			const duration = 600 + Math.random() * 700;

			// Web Animations API を使ってアニメーションを実行
			s.animate(
				[
					{ transform: `translate(0px,0px) rotate(0deg) scale(1)`, opacity: 1 },
					{
						transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(0.6)`,
						opacity: 0,
					},
				],
				{
					duration,
					easing: "cubic-bezier(.2,.8,.2,1)", // イージング
				},
			).onfinish = () => {
				// アニメーション完了後にDOMから削除
				if (s.parentElement === container) container.removeChild(s);
			};
		}
	} catch (err) {
		console.error("spawnHeartShards failed", err);
	}
};

// --- ゲッター関数 (外部からプレイヤーの状態を取得するために使用) ---
export const getPlayerPosition = () => ({ x, y });
export const getHeartElement = (): HTMLElement => {
	const el = document.getElementById("heart");
	if (!el) throw new Error("#heart が見つかりません");
	return el as HTMLElement;
};
export const getHeartSvg = () => heartSvg;
export const getHeartPath = () => heartPath;
export const getHeartColor = () => currentColor;
export const getHp = () => hp;

/**
 * HPバーとテキスト表示を現在のHPに合わせて更新します。
 */
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
		// UI更新のエラーはゲーム進行に影響させない
	}
};

/**
 * プレイヤーにダメージを与えます。無敵時間中はダメージを受けません。
 * HPが0になった場合、ゲームオーバー処理を開始します。
 * @param {number} amount - ダメージ量。
 * @returns {boolean} - ダメージが実際に適用された場合はtrue。
 */
export const takeDamage = (amount: number) => {
	const now = performance.now();
	// 無敵時間中かチェック
	if (now < lastDamageExpiry) return false;

	// 無敵時間を更新
	lastDamageExpiry = now + DAMAGE_COOLDOWN_MS;
	hp = Math.max(0, hp - amount);
	updateHpUi();

	// HPが0になったらゲームオーバー処理
	if (hp === 0 && !isDead) {
		isDead = true;
		// ゲームループを停止させるためのイベントを発行
		const stopEvt = new CustomEvent("gamestop", { detail: { hp } });
		document.dispatchEvent(stopEvt);
		// 破壊演出を開始
		triggerGameOver();
	}
	return true;
};

/**
 * ゲームオーバー時のハート破壊アニメーションと画面遷移を管理します。
 */
const triggerGameOver = async () => {
	try {
		const heartEl = getHeartElement();
		// 元のハートSVGを削除
		if (heartSvg && heartSvg.parentElement === heartEl) {
			heartEl.removeChild(heartSvg);
			heartSvg = null;
			heartPath = null;
		}

		// 破壊演出用のSVG URL
		const brokingUrl = new URL(
			"../assets/heart-shape-svgrepo-com-breking.svg",
			import.meta.url,
		).href;
		const brokenUrl = new URL(
			"../assets/heart-shape-svgrepo-com-broken.svg",
			import.meta.url,
		).href;

		/** SVGを読み込んでDOMに追加するヘルパー関数 */
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
			// SVG内のすべての図形の色を現在のハートの色に設定
			try {
				const shapes = svg.querySelectorAll(
					"path, circle, rect, polygon, ellipse",
				);
				shapes.forEach((el) => {
					try {
						if (!(el instanceof SVGElement)) return;
						const attrFill = el.getAttribute("fill");
						const inlineFill = (el.style?.fill ?? "").toLowerCase();
						const hasFill =
							(attrFill == null || attrFill.toLowerCase() !== "none") &&
							inlineFill !== "none";
						if (hasFill) el.style.fill = currentColor;
					} catch {}
				});
			} catch {}
			heartEl.style.display = "";
			heartEl.style.opacity = "1";
			heartEl.appendChild(svg);
			return svg as SVGSVGElement;
		};

		// 1. 「壊れかけ」のハートを表示
		let brokingSvg: SVGSVGElement | null = null;
		try {
			brokingSvg = await loadAndAppend(brokingUrl);
		} catch {
			// SVGが失敗した場合、画像でフォールバック
			const img = document.createElement("img");
			img.src = brokingUrl;
			img.style.width = "100%";
			img.style.height = "100%";
			heartEl.appendChild(img);
			await new Promise((res) => setTimeout(res, BROKING_DISPLAY_MS));
			if (img.parentElement === heartEl) heartEl.removeChild(img);
		}
		if (brokingSvg) {
			await new Promise((res) => setTimeout(res, BROKING_DISPLAY_MS));
			if (brokingSvg.parentElement === heartEl) heartEl.removeChild(brokingSvg);
		}

		// 2. 「完全に壊れた」ハートを表示し、破片を飛ばす
		try {
			heartSvg = await loadAndAppend(brokenUrl);
			const finalPath = heartSvg.querySelector("path");
			if (finalPath instanceof SVGGeometryElement) heartPath = finalPath;
			await new Promise((res) => setTimeout(res, 400));
			spawnHeartShards(14); // 破片アニメーション
			if (heartSvg && heartSvg.parentElement === heartEl) {
				heartEl.removeChild(heartSvg);
				heartSvg = null;
				heartPath = null;
			}
		} catch {
			// SVGが失敗した場合、画像でフォールバック
			const img = document.createElement("img");
			img.src = brokenUrl;
			// ...
			heartEl.appendChild(img);
			await new Promise((res) => setTimeout(res, 400));
			spawnHeartShards(14);
			if (img.parentElement === heartEl) heartEl.removeChild(img);
		}

		// 3. GAMEOVER画面を表示するためのイベントを発行
		try {
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
 * 押されているキーに基づいてプレイヤーの位置を更新します。
 * @param {number} deltaSeconds - 前のフレームからの経過時間 (秒)。
 * @param {Set<string>} pressedKeys - 現在押されているキーのセット。
 * @param {HTMLElement} playfield - プレイフィールドのDOM要素。
 */
export const updatePlayerPosition = (
	deltaSeconds: number,
	pressedKeys: Set<string>,
	playfield: HTMLElement,
) => {
	if (isDead) return; // 死亡中は移動不可

	let dx = 0;
	let dy = 0;
	// 押されているキーから移動ベクトルを合成
	pressedKeys.forEach((key) => {
		const direction = DIRECTION_MAP[key as keyof typeof DIRECTION_MAP];
		if (direction) {
			dx += direction[0];
			dy += direction[1];
		}
	});

	// 移動がある場合のみ処理
	if (dx !== 0 || dy !== 0) {
		// 斜め移動が速くならないようにベクトルを正規化
		const length = Math.hypot(dx, dy) || 1;
		dx /= length;
		dy /= length;

		// 位置を更新
		x += dx * SPEED * deltaSeconds;
		y += dy * SPEED * deltaSeconds;

		// プレイフィールドの範囲内に位置を制限 (クランプ)
		const heartEl = getHeartElement();
		const maxX = playfield.clientWidth - heartEl.clientWidth;
		const maxY = playfield.clientHeight - heartEl.clientHeight;
		x = Math.max(0, Math.min(x, maxX));
		y = Math.max(0, Math.min(y, maxY));

		// DOM要素の位置を更新
		heartEl.style.transform = `translate(${x}px, ${y}px)`;
	}
};

/**
 * ハートの色をカラーパレットの次の色に変更します (デバッグ用)。
 */
export const changeHeartColor = () => {
	currentIndex = (currentIndex + 1) % COLORS.length;
	currentColor = COLORS[currentIndex];
	// SVGのパスの色を更新
	if (heartPath) {
		heartPath.style.fill = currentColor;
	} else if (heartSvg) {
		const path = heartSvg.querySelector("path");
		if (path instanceof SVGGeometryElement) {
			heartPath = path;
			heartPath.style.fill = currentColor;
		}
	}
	// 色の変更をUIに通知 (行動選択のハートアイコン色を変えるため)
	document.dispatchEvent(
		new CustomEvent("player:heartColorChange", {
			detail: { color: currentColor },
		}),
	);
};

/**
 * ダメージを受けた際のハートの不透明度（無敵演出）を設定します。
 * @param {boolean} wasHit - ダメージを受けたかどうか。
 */
export const setHeartOpacity = (wasHit: boolean) => {
	const heartEl = getHeartElement();
	if (wasHit) {
		// ダメージを受けたら半透明にする
		heartEl.style.opacity = `${0.3}`;
		// 既存のタイマーをクリア
		if (invulnerabilityTimer != null) {
			clearTimeout(invulnerabilityTimer);
			invulnerabilityTimer = null;
		}
		// 無敵時間が終了したら不透明度を元に戻すタイマーを設定
		const remaining = Math.max(
			0,
			Math.ceil(lastDamageExpiry - performance.now()),
		);
		invulnerabilityTimer = window.setTimeout(() => {
			heartEl.style.opacity = "1";
			invulnerabilityTimer = null;
		}, remaining || DAMAGE_COOLDOWN_MS);
		return;
	}

	// ダメージを受けていない場合は、不透明度を1に戻し、タイマーをキャンセル
	heartEl.style.opacity = "1";
	if (invulnerabilityTimer != null) {
		clearTimeout(invulnerabilityTimer);
		invulnerabilityTimer = null;
	}
};

/**
 * プレイヤーの位置を現在のプレイフィールドの境界内に収めます。
 * @param {HTMLElement} playfield - プレイフィールドのDOM要素。
 */
export const clampPlayerToBounds = (playfield: HTMLElement) => {
	const maxX = playfield.clientWidth - getHeartElement().clientWidth;
	const maxY = playfield.clientHeight - getHeartElement().clientHeight;
	x = Math.max(0, Math.min(x, maxX));
	y = Math.max(0, Math.min(y, maxY));
	getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
};

/**
 * プレイヤーをプレイフィールドの中央に配置します。
 * @param {HTMLElement} playfield - プレイフィールドのDOM要素。
 */
export const centerPlayer = (playfield: HTMLElement) => {
	try {
		const heartEl = getHeartElement();
		// プレイフィールドの中央にハートを配置（ハートのサイズの半分を引いて中央揃え）
		x = (playfield.clientWidth - heartEl.clientWidth) / 2;
		y = (playfield.clientHeight - heartEl.clientHeight) / 2;
		heartEl.style.transform = `translate(${x}px, ${y}px)`;
	} catch (_err) {
		// エラーは無視
	}
};

/**
 * プレイヤー（ハート）のSVGファイルを非同期で読み込み、DOMに追加します。
 */
export const loadSvg = async () => {
	try {
		const url = new URL(
			"../assets/heart-shape-svgrepo-com.svg",
			import.meta.url,
		).href;
		const response = await fetch(url);
		if (!response.ok)
			throw new Error(
				`SVG fetch failed: ${response.status} ${response.statusText} (${url})`,
			);
		const svgText = await response.text();
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
		const svgEl = svgDoc.querySelector("svg");
		if (!svgEl || !(svgEl instanceof SVGSVGElement)) {
			throw new Error("取得したファイルは有効なSVGではありませんでした。");
		}
		heartSvg = svgEl as SVGSVGElement;
		heartSvg.style.width = "100%";
		heartSvg.style.height = "100%";
		getHeartElement().appendChild(heartSvg);

		// SVG内のパスを取得して色を設定
		const path = heartSvg.querySelector("path");
		if (path instanceof SVGGeometryElement) {
			heartPath = path;
			heartPath.style.fill = currentColor;
		}
		// 色の変更をUIに通知
		document.dispatchEvent(
			new CustomEvent("player:heartColorChange", {
				detail: { color: currentColor },
			}),
		);

		// プレイヤーを初期位置（中央）に配置
		const playfield = document.getElementById("playfield");
		if (!playfield) throw new Error("#playfield が見つかりません");
		x = (playfield.clientWidth - getHeartElement().clientWidth) / 2;
		y = (playfield.clientHeight - getHeartElement().clientHeight) / 2;
		getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
	} catch (error) {
		console.error("SVG の読み込みに失敗しました:", error);
	}
};
