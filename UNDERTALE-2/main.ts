const _canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!_canvas) {
	throw new Error("Canvas element #game が見つかりません");
}
const _ctx = _canvas.getContext("2d");
if (!_ctx) {
	throw new Error("2D コンテキストが取得できません");
}

// definite non-null handles for the rest of the file
const CANVAS = _canvas as HTMLCanvasElement;
const CTX = _ctx as CanvasRenderingContext2D;

const state = {
	x: 0,
	y: 0,
	vx: 0,
	vy: 0,
	speed: 220, // pixels per second (max)
	accel: 1500, // pixels per second^2
	friction: 10,
	size: 24,
};

const keys = { up: false, down: false, left: false, right: false };

// Bullets
type Bullet = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
	color: string;
};
const bullets: Bullet[] = [];
let bulletTimer = 0; // seconds
const BULLET_SPAWN_INTERVAL = 1.0; // seconds
const BULLET_SPEED = 80; // px/s downward

// Play area (logical coordinates)
let logicalW = CANVAS.width / (window.devicePixelRatio || 1);
let logicalH = CANVAS.height / (window.devicePixelRatio || 1);
const PLAY_SIZE = 300; // logical pixels (square)
let playX = Math.max(0, (logicalW - PLAY_SIZE) / 2);
let playY = Math.max(0, (logicalH - PLAY_SIZE) / 2);

// Draw a cute heart centered at (x,y)
function drawHeart(x: number, y: number, size: number, color = "#e22") {
	CTX.save();
	CTX.translate(x, y);
	CTX.scale(size / 40, size / 40);
	CTX.beginPath();
	// path for heart shape
	CTX.moveTo(0, 0);
	CTX.bezierCurveTo(-25, -20, -40, 5, 0, 30);
	CTX.bezierCurveTo(40, 5, 25, -20, 0, 0);
	CTX.closePath();
	CTX.fillStyle = color;
	CTX.shadowColor = "rgba(0,0,0,0.6)";
	CTX.shadowBlur = 8;
	CTX.fill();
	CTX.restore();
}

// Input handlers
window.addEventListener("keydown", (e) => {
	const k = e.key.toLowerCase();
	if (k === "arrowup" || k === "w") keys.up = true;
	if (k === "arrowdown" || k === "s") keys.down = true;
	if (k === "arrowleft" || k === "a") keys.left = true;
	if (k === "arrowright" || k === "d") keys.right = true;
});
window.addEventListener("keyup", (e) => {
	const k = e.key.toLowerCase();
	if (k === "arrowup" || k === "w") keys.up = false;
	if (k === "arrowdown" || k === "s") keys.down = false;
	if (k === "arrowleft" || k === "a") keys.left = false;
	if (k === "arrowright" || k === "d") keys.right = false;
});

// Mouse drag
let dragging = false;
CANVAS.addEventListener("mousedown", (e) => {
	const r = CANVAS.getBoundingClientRect();
	const mx = (e.clientX - r.left) * (CANVAS.width / r.width);
	const my = (e.clientY - r.top) * (CANVAS.height / r.height);
	// check near heart
	const dx = mx - state.x;
	const dy = my - state.y;
	if (Math.hypot(dx, dy) < state.size * 1.4) {
		dragging = true;
	}
});
window.addEventListener("mousemove", (e) => {
	if (!dragging) return;
	const r = CANVAS.getBoundingClientRect();
	state.x = (e.clientX - r.left) * (CANVAS.width / r.width);
	state.y = (e.clientY - r.top) * (CANVAS.height / r.height);
	state.vx = 0;
	state.vy = 0;
});
window.addEventListener("mouseup", () => {
	dragging = false;
});

// Resize handling to keep internal canvas size fixed but scale via CSS
function fitCanvas() {
	// Keep logical size fixed (400x400) but adjust if devicePixelRatio changed
	const ratio = window.devicePixelRatio || 1;
	CANVAS.width = 400 * ratio;
	CANVAS.height = 400 * ratio;
	CTX.setTransform(ratio, 0, 0, ratio, 0, 0);
	// recompute logical sizes and play area
	logicalW = CANVAS.width / ratio;
	logicalH = CANVAS.height / ratio;
	playX = Math.max(0, (logicalW - PLAY_SIZE) / 2);
	playY = Math.max(0, (logicalH - PLAY_SIZE) / 2);
	// initialize player in center of play area if not positioned
	if (state.x === 0 && state.y === 0) {
		state.x = playX + PLAY_SIZE / 2;
		state.y = playY + PLAY_SIZE / 2;
	}
}
fitCanvas();
window.addEventListener("resize", fitCanvas);

let last = performance.now();
function tick(now: number) {
	const dt = Math.min(0.05, (now - last) / 1000);
	last = now;

	// Bullet spawn timer
	bulletTimer += dt;
	if (bulletTimer >= BULLET_SPAWN_INTERVAL) {
		bulletTimer -= BULLET_SPAWN_INTERVAL;
		// spawn from a random side outside the play rectangle (playX,playY,PLAY_SIZE)
		const side = Math.floor(Math.random() * 4); // 0=top,1=right,2=bottom,3=left
		const margin = 12;
		const br = 8;
		let bx = 0;
		let by = 0;
		let bvx = 0;
		let bvy = 0;
		if (side === 0) {
			// top
			bx = playX + Math.random() * (PLAY_SIZE - 20) + 10;
			by = playY - margin - br;
			bvx = (Math.random() - 0.5) * 20;
			bvy = BULLET_SPEED;
		} else if (side === 1) {
			// right
			bx = playX + PLAY_SIZE + margin + br;
			by = playY + Math.random() * (PLAY_SIZE - 20) + 10;
			bvx = -BULLET_SPEED;
			bvy = (Math.random() - 0.5) * 20;
		} else if (side === 2) {
			// bottom
			bx = playX + Math.random() * (PLAY_SIZE - 20) + 10;
			by = playY + PLAY_SIZE + margin + br;
			bvx = (Math.random() - 0.5) * 20;
			bvy = -BULLET_SPEED;
		} else {
			// left
			bx = playX - margin - br;
			by = playY + Math.random() * (PLAY_SIZE - 20) + 10;
			bvx = BULLET_SPEED;
			bvy = (Math.random() - 0.5) * 20;
		}
		bullets.push({ x: bx, y: by, vx: bvx, vy: bvy, r: br, color: "#88f" });
	}

	// If arrow keys / WASD are used, move immediately with speed 0 or 1 per tick (no acceleration)
	const keyDX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
	const keyDY = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
	const KEY_MOVE_SPEED = 120; // pixels per second (magnitude)
	if (keyDX !== 0 || keyDY !== 0) {
		// Normalize so diagonal movement has same magnitude as orthogonal movement
		const len = Math.hypot(keyDX, keyDY);
		const nx = keyDX / len;
		const ny = keyDY / len;
		// Multiply by dt to make movement frame-rate independent
		state.x += nx * KEY_MOVE_SPEED * dt;
		state.y += ny * KEY_MOVE_SPEED * dt;
		state.vx = 0;
		state.vy = 0;
	} else {
		// No key input: continue applying physics (in case other sources set velocity)
		// Apply acceleration (if any external acceleration is used)
		// Note: previously acceleration came only from keys; here it is unused but kept for future features.
		// Apply friction
		state.vx -= state.vx * Math.min(1, state.friction * dt);
		state.vy -= state.vy * Math.min(1, state.friction * dt);

		// Clamp to max speed
		const sp = Math.hypot(state.vx, state.vy);
		if (sp > state.speed) {
			const s = state.speed / sp;
			state.vx *= s;
			state.vy *= s;
		}

		// Update position from velocity
		state.x += state.vx * dt;
		state.y += state.vy * dt;
	}

	// Boundary collision (keep inside play rectangle)
	const margin = state.size;
	const leftBound = playX + margin;
	const topBound = playY + margin;
	const rightBound = playX + PLAY_SIZE - margin;
	const bottomBound = playY + PLAY_SIZE - margin;
	if (state.x < leftBound) {
		state.x = leftBound;
		state.vx = 0;
	}
	if (state.y < topBound) {
		state.y = topBound;
		state.vy = 0;
	}
	if (state.x > rightBound) {
		state.x = rightBound;
		state.vx = 0;
	}
	if (state.y > bottomBound) {
		state.y = bottomBound;
		state.vy = 0;
	}

	// draw
	CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);
	// background square
	CTX.fillStyle = "#111";
	CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);
	// draw play rectangle (visualized)
	CTX.strokeStyle = "#444";
	CTX.lineWidth = 2;
	CTX.strokeRect(playX, playY, PLAY_SIZE, PLAY_SIZE);

	// update & draw bullets
	const logicalW = CANVAS.width / (window.devicePixelRatio || 1);
	const logicalH = CANVAS.height / (window.devicePixelRatio || 1);
	for (let i = bullets.length - 1; i >= 0; i--) {
		const b = bullets[i];
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		// draw
		CTX.fillStyle = b.color;
		CTX.beginPath();
		CTX.arc(b.x, b.y, b.r, 0, Math.PI * 2);
		CTX.fill();
		// remove if fully off logical bounds (any side)
		if (
			b.x + b.r < -20 ||
			b.x - b.r > logicalW + 20 ||
			b.y + b.r < -20 ||
			b.y - b.r > logicalH + 20
		) {
			bullets.splice(i, 1);
		}
	}

	// draw heart (no bobbing)
	drawHeart(state.x, state.y, state.size, "#ff2b5c");

	requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
