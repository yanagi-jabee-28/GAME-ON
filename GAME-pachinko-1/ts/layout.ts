const ROOT = document.documentElement;
const DEFAULT_WIDTH = 650;
const DEFAULT_HEIGHT = 900;
const RESERVED_MIN = 160;
const RESERVED_MAX = 420;
const EXTRA_ALLOWANCE = 48;
const VIEWPORT_MARGIN = 0.95; // 同一幅のまま少し余白を残す
const MIN_BOARD_WIDTH = 240;
let updateToken: number | null = null;

type GameDimensions = {
	width: number;
	height: number;
};

function getGameDimensions(): GameDimensions {
	try {
		const cfg = window.GAME_CONFIG;
		if (cfg?.dimensions?.width && cfg.dimensions?.height) {
			return {
				width: Number(cfg.dimensions.width) || DEFAULT_WIDTH,
				height: Number(cfg.dimensions.height) || DEFAULT_HEIGHT,
			};
		}
	} catch (_) {
		/* no-op */
	}
	return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

const BASE_DIMS = getGameDimensions();
const BOARD_ASPECT = BASE_DIMS.width / BASE_DIMS.height;

function getReservedVariable(): number {
	const styles = getComputedStyle(ROOT);
	const raw = parseFloat(styles.getPropertyValue("--game-ui-reserved"));
	return Number.isFinite(raw) ? raw : RESERVED_MIN;
}

function updateViewportHeightVar() {
	const visual = window.visualViewport?.height;
	const inner = window.innerHeight || 0;
	const doc = document.documentElement?.clientHeight || 0;
	const viewportHeight = Math.max(
		0,
		Math.min(inner || visual || doc, visual || inner || doc),
	);
	ROOT.style.setProperty(
		"--game-viewport-height",
		`${viewportHeight || inner || doc}px`,
	);
}

function getElementHeight(el: Element | null): number {
	if (!el || !(el as HTMLElement).getBoundingClientRect) return 0;
	const rect = (el as HTMLElement).getBoundingClientRect();
	return rect.height;
}

function applyReservedSpace(reserved: number) {
	const clamped = Math.min(RESERVED_MAX, Math.max(RESERVED_MIN, reserved));
	ROOT.style.setProperty("--game-ui-reserved", `${Math.round(clamped)}px`);
}

function measureReservedSpace(): number {
	const topBar = document.querySelector(".topbar");
	const controls = document.querySelector(".controls");
	const heading = document.querySelector("body > h1");
	const topBarHeight = getElementHeight(topBar);
	const controlsHeight = getElementHeight(controls);
	const headingHeight = getElementHeight(heading);
	const total = topBarHeight + controlsHeight + headingHeight + EXTRA_ALLOWANCE;
	const reserved = total > 0 ? total : getReservedVariable();
	applyReservedSpace(reserved);
	return Math.min(RESERVED_MAX, Math.max(RESERVED_MIN, reserved));
}

function getViewportWidth(): number {
	const visual = window.visualViewport?.width;
	const inner = window.innerWidth || 0;
	const doc = document.documentElement?.clientWidth || 0;
	const width = Math.max(0, visual || inner || doc);
	return width || BASE_DIMS.width;
}

function applyContainerSize(reservedSpace?: number) {
	const container = document.getElementById("game-container");
	if (!container) return;
	const reserved =
		typeof reservedSpace === "number" ? reservedSpace : getReservedVariable();
	const viewportHeight = (() => {
		const visual = window.visualViewport?.height;
		const inner = window.innerHeight || 0;
		const doc = document.documentElement?.clientHeight || 0;
		return Math.max(0, visual || inner || doc);
	})();
	const availableHeight = Math.max(0, viewportHeight - reserved);
	const maxWidthFromHeight =
		availableHeight > 0 ? availableHeight * BOARD_ASPECT : BASE_DIMS.width;
	const maxWidthFromViewport = getViewportWidth() * VIEWPORT_MARGIN;
	const targetWidth = Math.max(
		MIN_BOARD_WIDTH,
		Math.min(BASE_DIMS.width, maxWidthFromHeight, maxWidthFromViewport),
	);
	const targetHeight = targetWidth / BOARD_ASPECT;
	container.style.width = `${Math.round(targetWidth)}px`;
	container.style.height = `${Math.round(targetHeight)}px`;
	container.style.maxWidth = `${BASE_DIMS.width}px`;
	container.style.maxHeight = `${BASE_DIMS.height}px`;
	container.style.setProperty(
		"aspect-ratio",
		`${BASE_DIMS.width} / ${BASE_DIMS.height}`,
	);
}

function runLayoutUpdate() {
	updateViewportHeightVar();
	const reserved = measureReservedSpace();
	applyContainerSize(reserved);
}

function scheduleMeasure() {
	if (updateToken !== null) {
		cancelAnimationFrame(updateToken);
	}
	updateToken = requestAnimationFrame(() => {
		updateToken = null;
		runLayoutUpdate();
	});
}

function connectObservers() {
	const controls = document.querySelector(".controls");
	if (controls && "ResizeObserver" in window) {
		const ro = new ResizeObserver(() => scheduleMeasure());
		ro.observe(controls);
	}

	const embeddedSlot = document.getElementById("embedded-slot-container");
	if (embeddedSlot) {
		const observer = new MutationObserver(() => scheduleMeasure());
		observer.observe(embeddedSlot, { childList: true, subtree: true });
	}
}

function initLayoutSizing() {
	if (!ROOT) return;
	runLayoutUpdate();
	scheduleMeasure();
	connectObservers();
	window.addEventListener("resize", scheduleMeasure, { passive: true });
	window.addEventListener("orientationchange", scheduleMeasure, {
		passive: true,
	});
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initLayoutSizing, {
		once: true,
	});
} else {
	initLayoutSizing();
}
