const playfield = document.getElementById("playfield");
const heart = document.getElementById("heart") as HTMLElement | null;
const entityLayer = document.getElementById("entity-layer");

if (
	!(playfield instanceof HTMLElement) ||
	!heart ||
	!(entityLayer instanceof HTMLElement)
) {
	throw new Error("必要な要素が見つかりませんでした。");
}

const pressedKeys = new Set<string>();
const speed = 180; // pixels per second
const directionMap: Record<string, Readonly<[number, number]>> = {
	arrowup: [0, -1],
	w: [0, -1],
	arrowdown: [0, 1],
	s: [0, 1],
	arrowleft: [-1, 0],
	a: [-1, 0],
	arrowright: [1, 0],
	d: [1, 0],
};

let x = 0;
let y = 0;
let lastTimestamp = performance.now();
let heartSvg: SVGSVGElement | null = null;
// ソウルカラーを HSL で定義（順序は切り替わる順）
const colors: string[] = [
	"hsl(180 100% 50%)", // 水色: 忍耐
	"hsl(30 100% 50%)", // オレンジ: 勇気
	"hsl(220 100% 50%)", // 青: 誠実
	"hsl(285 100% 50%)", // 紫: 不屈
	"hsl(120 100% 50%)", // 緑: 親切
	"hsl(60 100% 50%)", // 黄: 正義
	"hsl(0 100% 50%)", // 赤: 決意
	"hsl(0 0% 100%)", // 白: モンスター
];

// 現在の色インデックス（初期は赤 = 決意）。colors 配列のインデックスで管理します。
let currentIndex = 6;
let currentColor = colors[currentIndex];

type EntityShape = "circle" | "square";

type Entity = {
	id: number;
	element: HTMLDivElement;
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	size: number;
	rotation: number;
	rotationSpeed: number;
	shape: EntityShape;
	color: string;
};

type EntitySpawnOptions = {
	position: { x: number; y: number };
	velocity?: { x: number; y: number };
	size?: number;
	shape?: EntityShape;
	color?: string;
	rotationSpeed?: number;
};

const entities: Entity[] = [];
let nextEntityId = 1;

const spawnEntity = ({
	position,
	velocity = { x: 0, y: 0 },
	size = 24,
	shape = "circle",
	color = "hsl(0 0% 90%)",
	rotationSpeed = 0,
}: EntitySpawnOptions) => {
	const element = document.createElement("div");
	element.classList.add("entity");
	if (shape === "circle") {
		element.classList.add("entity--circle");
	}
	element.style.width = `${size}px`;
	element.style.height = `${size}px`;
	element.style.background = color;
	element.style.transform = `translate(${position.x}px, ${position.y}px)`;
	entityLayer.appendChild(element);

	const entity: Entity = {
		id: nextEntityId++,
		element,
		position: { ...position },
		velocity: { ...velocity },
		size,
		rotation: 0,
		rotationSpeed,
		shape,
		color,
	};

	entities.push(entity);
	return entity;
};

const updateEntities = (deltaSeconds: number) => {
	const stageWidth = playfield.clientWidth;
	const stageHeight = playfield.clientHeight;
	const removalMargin = 160;

	for (let i = entities.length - 1; i >= 0; i -= 1) {
		const entity = entities[i];
		entity.position.x += entity.velocity.x * deltaSeconds;
		entity.position.y += entity.velocity.y * deltaSeconds;
		entity.rotation += entity.rotationSpeed * deltaSeconds;

		const translate = `translate(${entity.position.x}px, ${entity.position.y}px)`;
		const rotate =
			entity.rotation !== 0 ? ` rotate(${entity.rotation}rad)` : "";
		entity.element.style.transform = translate + rotate;

		const isOutOfBounds =
			entity.position.x < -removalMargin ||
			entity.position.x > stageWidth + removalMargin ||
			entity.position.y < -removalMargin ||
			entity.position.y > stageHeight + removalMargin;

		if (isOutOfBounds) {
			entity.element.remove();
			entities.splice(i, 1);
		}
	}
};

const startDemoScenario = () => {
	const width = playfield.clientWidth;
	const height = playfield.clientHeight;

	// 初回スポーン: 三方向からプレイヤーエリアへ向かう図形
	spawnEntity({
		position: { x: width / 2 - 18, y: -80 },
		velocity: { x: 0, y: 60 },
		size: 36,
		color: "hsl(0 80% 60%)",
		shape: "circle",
	});

	spawnEntity({
		position: { x: -80, y: height * 0.35 },
		velocity: { x: 90, y: 0 },
		size: 28,
		color: "hsl(210 75% 55%)",
		shape: "square",
		rotationSpeed: Math.PI / 2,
	});

	spawnEntity({
		position: { x: width + 40, y: height + 40 },
		velocity: { x: -70, y: -85 },
		size: 34,
		color: "hsl(280 70% 58%)",
		shape: "circle",
	});

	// デモ: ランダムに新しい弾を生成
	window.setInterval(() => {
		const edge = Math.floor(Math.random() * 4);
		const speed = 80 + Math.random() * 60;
		let position: { x: number; y: number };

		const target = {
			x: width / 2 + (Math.random() - 0.5) * width * 0.6,
			y: height / 2 + (Math.random() - 0.5) * height * 0.6,
		};

		switch (edge) {
			case 0:
				position = { x: Math.random() * width, y: -60 };
				break;
			case 1:
				position = { x: width + 60, y: Math.random() * height };
				break;
			case 2:
				position = { x: Math.random() * width, y: height + 60 };
				break;
			default:
				position = { x: -60, y: Math.random() * height };
		}

		const vector = {
			x: target.x - position.x,
			y: target.y - position.y,
		};
		const vectorLength = Math.hypot(vector.x, vector.y) || 1;
		const velocity = {
			x: (vector.x / vectorLength) * speed,
			y: (vector.y / vectorLength) * speed,
		};

		spawnEntity({
			position,
			velocity,
			size: 20 + Math.random() * 16,
			shape: Math.random() > 0.5 ? "circle" : "square",
			color: `hsl(${Math.floor(Math.random() * 360)} 80% 60%)`,
			rotationSpeed: (Math.random() - 0.5) * Math.PI,
		});
	}, 1600);
};

const clamp = (value: number, min: number, max: number) => {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
};

const updatePosition = (deltaSeconds: number) => {
	let dx = 0;
	let dy = 0;

	pressedKeys.forEach((key) => {
		const direction = directionMap[key];
		if (direction) {
			dx += direction[0];
			dy += direction[1];
		}
	});

	if (dx !== 0 || dy !== 0) {
		const length = Math.hypot(dx, dy) || 1;
		dx /= length;
		dy /= length;

		x += dx * speed * deltaSeconds;
		y += dy * speed * deltaSeconds;

		const maxX = playfield.clientWidth - heart.clientWidth;
		const maxY = playfield.clientHeight - heart.clientHeight;
		x = clamp(x, 0, maxX);
		y = clamp(y, 0, maxY);

		heart.style.transform = `translate(${x}px, ${y}px)`;
	}
};

const loop = (timestamp: number) => {
	const delta = (timestamp - lastTimestamp) / 1000;
	lastTimestamp = timestamp;
	updatePosition(delta);
	updateEntities(delta);
	requestAnimationFrame(loop);
};

const handleKeyDown = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (directionMap[key]) {
		pressedKeys.add(key);
		event.preventDefault();
	} else if (key === " ") {
		changeHeartColor();
		event.preventDefault();
	}
};

const changeHeartColor = () => {
	currentIndex = (currentIndex + 1) % colors.length;
	currentColor = colors[currentIndex];
	if (heartSvg) {
		const path = heartSvg.querySelector("path");
		if (path) {
			path.style.fill = currentColor;
		}
	}
};

const handleKeyUp = (event: KeyboardEvent) => {
	const key = event.key.toLowerCase();
	if (pressedKeys.delete(key)) {
		event.preventDefault();
	}
};

document.addEventListener("keydown", handleKeyDown, { passive: false });
document.addEventListener("keyup", handleKeyUp, { passive: false });
window.addEventListener("blur", () => pressedKeys.clear());

const loadSvg = async () => {
	try {
		const response = await fetch("./assets/heart-shape-svgrepo-com.svg");
		const svgText = await response.text();
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
		heartSvg = svgDoc.documentElement as unknown as SVGSVGElement;
		heartSvg.style.width = "100%";
		heartSvg.style.height = "100%";
		heart.appendChild(heartSvg);
		// 初期色を設定
		const path = heartSvg.querySelector("path");
		if (path) {
			path.style.fill = currentColor;
		}
		centerHeart();
		startDemoScenario();
		requestAnimationFrame(loop);
	} catch (error) {
		console.error("SVG の読み込みに失敗しました:", error);
	}
};

const centerHeart = () => {
	x = (playfield.clientWidth - heart.clientWidth) / 2;
	y = (playfield.clientHeight - heart.clientHeight) / 2;
	heart.style.transform = `translate(${x}px, ${y}px)`;
};

loadSvg();
