import {
	COLORS,
	DAMAGE_COOLDOWN_MS,
	DIRECTION_MAP,
	GAMEOVER_DELAY_MS,
	SPEED,
} from "./constants.ts";

let x = 0;
let y = 0;
let heartSvg: SVGSVGElement | null = null;
let heartPath: SVGGeometryElement | null = null;
let currentIndex = 6;
let currentColor = COLORS[currentIndex];
const MAX_HP = 20;
let hp = MAX_HP;
let lastDamageExpiry = 0;
let isDead = false;
let invulnerabilityTimer: number | null = null;
const BROKING_DISPLAY_MS = 900;

const spawnHeartShards = (count = 12) => {
	try {
		const container = getHeartElement();
		const rect = container.getBoundingClientRect();
		const shards: HTMLElement[] = [];
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
			s.style.transform = "translate(0px,0px) scale(1)";
			container.appendChild(s);
			shards.push(s);

			const baseAngle = (i / count) * Math.PI * 2;
			const jitter = (Math.random() - 0.5) * (Math.PI / count);
			const angle = baseAngle + jitter;
			const speed = 60 + Math.random() * 120; // px
			const dx = Math.cos(angle) * speed;
			const dy = Math.sin(angle) * speed - 10;
			const rotate = (Math.random() - 0.5) * 540;
			const duration = 600 + Math.random() * 700; // ms

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
					easing: "cubic-bezier(.2,.8,.2,1)",
				},
			).onfinish = () => {
				if (s.parentElement === container) container.removeChild(s);
			};
		}
	} catch (err) {
		console.error("spawnHeartShards failed", err);
	}
};

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
		// ignore
	}
};

export const takeDamage = (amount: number) => {
	const now = performance.now();
	if (now < lastDamageExpiry) return false;
	lastDamageExpiry = now + DAMAGE_COOLDOWN_MS;
	hp = Math.max(0, hp - amount);
	updateHpUi();
	if (hp === 0 && !isDead) {
		isDead = true;
		const stopEvt = new CustomEvent("gamestop", { detail: { hp } });
		document.dispatchEvent(stopEvt);
		triggerGameOver();
	}
	return true;
};

const triggerGameOver = async () => {
	try {
		const heartEl = getHeartElement();
		if (heartSvg && heartSvg.parentElement === heartEl) {
			heartEl.removeChild(heartSvg);
			heartSvg = null;
			heartPath = null;
		}

		const brokingUrl = new URL(
			"../assets/heart-shape-svgrepo-com-broking.svg",
			import.meta.url,
		).href;
		const brokenUrl = new URL(
			"../assets/heart-shape-svgrepo-com-broken.svg",
			import.meta.url,
		).href;

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

		let brokingSvg: SVGSVGElement | null = null;
		try {
			brokingSvg = await loadAndAppend(brokingUrl);
		} catch {
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

		try {
			heartSvg = await loadAndAppend(brokenUrl);
			const finalPath = heartSvg.querySelector("path");
			if (finalPath instanceof SVGGeometryElement) heartPath = finalPath;
			await new Promise((res) => setTimeout(res, 400));
			spawnHeartShards(14);
			if (heartSvg && heartSvg.parentElement === heartEl) {
				heartEl.removeChild(heartSvg);
				heartSvg = null;
				heartPath = null;
			}
		} catch {
			const img = document.createElement("img");
			img.src = brokenUrl;
			img.style.width = "100%";
			img.style.height = "100%";
			heartEl.appendChild(img);
			await new Promise((res) => setTimeout(res, 400));
			spawnHeartShards(14);
			if (img.parentElement === heartEl) heartEl.removeChild(img);
		}

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

export const updatePlayerPosition = (
	deltaSeconds: number,
	pressedKeys: Set<string>,
	playfield: HTMLElement,
) => {
	if (isDead) return; // dead cannot move
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
	document.dispatchEvent(
		new CustomEvent("player:heartColorChange", {
			detail: { color: currentColor },
		}),
	);
};

export const setHeartOpacity = (wasHit: boolean) => {
	const heartEl = getHeartElement();
	if (wasHit) {
		heartEl.style.opacity = `${0.3}`;
		// clear any existing timer
		if (invulnerabilityTimer != null) {
			clearTimeout(invulnerabilityTimer);
			invulnerabilityTimer = null;
		}
		// compute remaining invulnerability time using lastDamageExpiry
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

	// not hit => ensure opacity is full and cancel any pending timer
	heartEl.style.opacity = "1";
	if (invulnerabilityTimer != null) {
		clearTimeout(invulnerabilityTimer);
		invulnerabilityTimer = null;
	}
};

export const clampPlayerToBounds = (playfield: HTMLElement) => {
	const maxX = playfield.clientWidth - getHeartElement().clientWidth;
	const maxY = playfield.clientHeight - getHeartElement().clientHeight;
	x = Math.max(0, Math.min(x, maxX));
	y = Math.max(0, Math.min(y, maxY));
	getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
};

// Center the heart in the middle of the provided playfield and update internal coords
export const centerPlayer = (playfield: HTMLElement) => {
	try {
		const heartEl = getHeartElement();
		x = (playfield.clientWidth - heartEl.clientWidth) / 2;
		y = (playfield.clientHeight - heartEl.clientHeight) / 2;
		heartEl.style.transform = `translate(${x}px, ${y}px)`;
	} catch (_err) {
		// ignore
	}
};

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
		const path = heartSvg.querySelector("path");
		if (path instanceof SVGGeometryElement) {
			heartPath = path;
			heartPath.style.fill = currentColor;
		}
		document.dispatchEvent(
			new CustomEvent("player:heartColorChange", {
				detail: { color: currentColor },
			}),
		);
		const playfield = document.getElementById("playfield");
		if (!playfield) throw new Error("#playfield が見つかりません");
		x = (playfield.clientWidth - getHeartElement().clientWidth) / 2;
		y = (playfield.clientHeight - getHeartElement().clientHeight) / 2;
		getHeartElement().style.transform = `translate(${x}px, ${y}px)`;
	} catch (error) {
		console.error("SVG の読み込みに失敗しました:", error);
	}
};
