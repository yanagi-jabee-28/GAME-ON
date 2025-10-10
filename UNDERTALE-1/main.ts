import nipplejs from "nipplejs";

// Canvas element must be an HTMLCanvasElement for .getContext and width/height
const canvas = document.getElementById("battle-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

// Read CSS dimension variables and convert to numbers
const cssVar = (name) =>
	getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const toPx = (v) => Number(String(v).replace("px", "").trim());

const CANVAS_SIZE = toPx(cssVar("--battle-size"));
const BATTLE_BOX_SIZE = toPx(cssVar("--battle-inner-size"));
const ATTACK_BAR_HEIGHT = toPx(cssVar("--attack-bar-height"));
const PLAYER_SIZE = toPx(cssVar("--player-size"));

// Gameplay sizing/speed constants (single source of truth)
const BATTLE_BOX_BORDER = 4; // canvas stroke width for battle box
const ATTACK_TARGET_ZONE_WIDTH = 10;
const PLAYER_SPEED = 3;
const ATTACK_MARKER_SPEED = 4;
const INVINCIBILITY_FRAMES = 30;
const BULLET_RADIUS = 5;
const BULLET_SPEED = 2;
const HOMING_BULLET_SPEED = 1.5;
const HOMING_TURN_RATE = 0.025;
const BULLET_FADEOUT_FRAMES = 60;
const BULLET_LIFETIME = 300; // frames for homing bullets
const BULLET_OFFSCREEN_MARGIN = 20;
const BULLET_SPAWN_INTERVAL_MS = 700;
const ENEMY_TURN_DURATION_MS = 10000;

// Ensure canvas drawing size follows CSS variable
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

// --- Game State Management ---
let gameState = null; // Initial state set to null to fix bug
let enemyTurnTimer;

const battleBox = {
	width: BATTLE_BOX_SIZE,
	height: BATTLE_BOX_SIZE,
	x: (canvas.width - BATTLE_BOX_SIZE) / 2,
	y: (canvas.height - BATTLE_BOX_SIZE) / 2,
};

const player = {
	x: canvas.width / 2,
	y: canvas.height / 2,
	width: PLAYER_SIZE,
	height: PLAYER_SIZE,
	speed: PLAYER_SPEED,
	isInvincible: false,
	invincibleTimer: 0,
	maxHp: 20,
	hp: 20,
};

const bullets = [];
let bulletSpawnInterval;
const bulletSpawnMode = "top";
let framesSinceLastHoming = 0;

const attackBar = {
	x: battleBox.x,
	y: battleBox.y + battleBox.height / 2 - ATTACK_BAR_HEIGHT / 2,
	width: battleBox.width,
	height: ATTACK_BAR_HEIGHT,
	markerX: battleBox.x,
	markerSpeed: ATTACK_MARKER_SPEED,
	moving: false,
};

const keys = {
	ArrowUp: false,
	ArrowDown: false,
	ArrowLeft: false,
	ArrowRight: false,
};
const joystickVector = { x: 0, y: 0 };

// --- DOM Elements ---
const hpBar = document.getElementById("hp-bar") as HTMLElement;
const hpValue = document.getElementById("hp-value") as HTMLElement;
const gameOverText = document.getElementById("game-over") as HTMLElement;
const fightButton = document.getElementById("fight") as HTMLElement;
const attackButton = document.getElementById("attack-button") as HTMLElement;
const messageWindow = document.getElementById("message-window") as HTMLElement;
const messageContent = document.getElementById(
	"message-content",
) as HTMLElement;

// Enemy DOM refs
const enemyHpBar = document.getElementById("enemy-hp-bar") as HTMLElement;
const enemyHpValue = document.getElementById("enemy-hp-value") as HTMLElement;

// --- 複数敵データ ---
const enemies = [
	{ name: "SKELETON", maxHp: 30, hp: 30 },
	// 今後追加可能: { name: "GHOST", maxHp: 20, hp: 20 }
];
let selectedEnemyIndex = 0;

function getSelectedEnemy() {
	return enemies[selectedEnemyIndex];
}

// 既存のenemy参照箇所は getSelectedEnemy() に置換

function updateEnemyHPDisplay() {
	const enemy = getSelectedEnemy();
	const pct = (Math.max(0, enemy.hp) / enemy.maxHp) * 100;
	enemyHpBar.style.width = pct + "%";
	enemyHpValue.textContent = `${enemy.hp} / ${enemy.maxHp}`;
	document.getElementById("enemy-name").textContent = enemy.name;
}

// --- Option selection (keyboard D-pad) ---
const optionButtons = Array.from(document.querySelectorAll(".option-button"));
let selectionIndex = optionButtons.findIndex((b) =>
	b.classList.contains("selected"),
);
if (selectionIndex === -1) selectionIndex = 0;
function setSelection(idx) {
	idx = Math.max(0, Math.min(optionButtons.length - 1, idx));
	optionButtons.forEach((b, i) => {
		if (i === idx) b.classList.add("selected");
		else b.classList.remove("selected");
	});
	selectionIndex = idx;
}

// clicking with mouse should also update selection
optionButtons.forEach((btn, i) =>
	btn.addEventListener("click", () => setSelection(i)),
);

function drawPlayer() {
	if (player.isInvincible && Math.floor(player.invincibleTimer / 6) % 2 === 0)
		return;
	ctx.fillStyle = "#ff0000";
	ctx.font = `${PLAYER_SIZE}px sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("❤️", player.x, player.y);
}

function updatePlayerPosition() {
	let moveX = 0,
		moveY = 0;
	if (joystickVector.x !== 0 || joystickVector.y !== 0) {
		moveX = joystickVector.x;
		moveY = joystickVector.y;
	} else {
		if (keys.ArrowUp) moveY -= 1;
		if (keys.ArrowDown) moveY += 1;
		if (keys.ArrowLeft) moveX -= 1;
		if (keys.ArrowRight) moveX += 1;
		const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
		if (magnitude > 1) {
			moveX /= magnitude;
			moveY /= magnitude;
		}
	}
	player.x += moveX * player.speed;
	player.y += moveY * player.speed;

	if (player.x - player.width / 2 < battleBox.x)
		player.x = battleBox.x + player.width / 2;
	if (player.x + player.width / 2 > battleBox.x + battleBox.width)
		player.x = battleBox.x + battleBox.width - player.width / 2;
	if (player.y - player.height / 2 < battleBox.y)
		player.y = battleBox.y + player.height / 2;
	if (player.y + player.height / 2 > battleBox.y + battleBox.height)
		player.y = battleBox.y + battleBox.height - player.height / 2;

	if (player.isInvincible) {
		player.invincibleTimer--;
		if (player.invincibleTimer <= 0) player.isInvincible = false;
	}
}

function createBullet() {
	let startX, startY;
	if (bulletSpawnMode === "top") {
		startX = Math.random() * canvas.width;
		startY = -BULLET_OFFSCREEN_MARGIN / 2;
	} else {
		const side = Math.floor(Math.random() * 4);
		switch (side) {
			case 0:
				startX = Math.random() * canvas.width;
				startY = -BULLET_OFFSCREEN_MARGIN / 2;
				break;
			case 1:
				startX = canvas.width + BULLET_OFFSCREEN_MARGIN / 2;
				startY = Math.random() * canvas.height;
				break;
			case 2:
				startX = Math.random() * canvas.width;
				startY = canvas.height + BULLET_OFFSCREEN_MARGIN / 2;
				break;
			case 3:
				startX = -BULLET_OFFSCREEN_MARGIN / 2;
				startY = Math.random() * canvas.height;
				break;
		}
	}
	let isHoming = false;
	const secondsSince = framesSinceLastHoming / 60;
	if (secondsSince >= 5) isHoming = true;
	else {
		const homingChance = 0.2 + 0.16 * secondsSince;
		if (Math.random() < homingChance) isHoming = true;
	}
	if (isHoming) framesSinceLastHoming = 0;
	const angle = Math.atan2(player.y - startY, player.x - startX);
	const speed = isHoming ? HOMING_BULLET_SPEED : BULLET_SPEED;
	bullets.push({
		x: startX,
		y: startY,
		radius: BULLET_RADIUS,
		speedX: Math.cos(angle) * speed,
		speedY: Math.sin(angle) * speed,
		color: isHoming ? "#ff3333" : "#fff",
		isHoming: isHoming,
		lifetime: isHoming ? BULLET_LIFETIME : null,
		originalSpeed: speed,
		hasEnteredBox: false,
		isFadingOut: false,
		fadeOutTimer: BULLET_FADEOUT_FRAMES,
	});
}

function drawBullets() {
	bullets.forEach((bullet) => {
		ctx.save();
		if (bullet.isFadingOut)
			ctx.globalAlpha = Math.max(0, bullet.fadeOutTimer / 60);
		ctx.fillStyle = bullet.color;
		ctx.beginPath();
		ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	});
}

function updateBulletsPosition() {
	for (let i = bullets.length - 1; i >= 0; i--) {
		const bullet = bullets[i];
		if (bullet.isHoming && !bullet.isFadingOut) {
			const turnRate = HOMING_TURN_RATE;
			const targetAngle = Math.atan2(player.y - bullet.y, player.x - bullet.x);
			const currentAngle = Math.atan2(bullet.speedY, bullet.speedX);
			let angleDiff = targetAngle - currentAngle;
			while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
			while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
			const turnAmount = Math.max(-turnRate, Math.min(turnRate, angleDiff));
			const newAngle = currentAngle + turnAmount;
			bullet.speedX = Math.cos(newAngle) * bullet.originalSpeed;
			bullet.speedY = Math.sin(newAngle) * bullet.originalSpeed;
		}
		bullet.x += bullet.speedX;
		bullet.y += bullet.speedY;
		const isInsideBox =
			bullet.x > battleBox.x &&
			bullet.x < battleBox.x + battleBox.width &&
			bullet.y > battleBox.y &&
			bullet.y < battleBox.y + battleBox.height;
		if (isInsideBox) bullet.hasEnteredBox = true;
		if (bullet.isHoming && bullet.lifetime !== null) bullet.lifetime--;
		if (
			(bullet.hasEnteredBox && !isInsideBox) ||
			(bullet.isHoming && bullet.lifetime !== null && bullet.lifetime <= 0)
		)
			bullet.isFadingOut = true;
		if (bullet.isFadingOut) {
			bullet.fadeOutTimer--;
			if (bullet.fadeOutTimer <= 0) {
				bullets.splice(i, 1);
				continue;
			}
		}
		if (
			!bullet.hasEnteredBox &&
			(bullet.x < -BULLET_OFFSCREEN_MARGIN ||
				bullet.x > canvas.width + BULLET_OFFSCREEN_MARGIN ||
				bullet.y < -BULLET_OFFSCREEN_MARGIN ||
				bullet.y > canvas.height + BULLET_OFFSCREEN_MARGIN)
		) {
			bullets.splice(i, 1);
		}
	}
}

function checkCollisions() {
	if (player.isInvincible) return;
	for (let i = bullets.length - 1; i >= 0; i--) {
		const bullet = bullets[i];
		if (bullet.isFadingOut) continue;
		if (
			player.x - player.width / 2 < bullet.x + bullet.radius &&
			player.x + player.width / 2 > bullet.x - bullet.radius &&
			player.y - player.height / 2 < bullet.y + bullet.radius &&
			player.y + player.height / 2 > bullet.y - bullet.radius
		) {
			bullets.splice(i, 1);
			player.hp -= 2; // Damage
			if (player.hp < 0) player.hp = 0;
			updateHPDisplay();
			player.isInvincible = true;
			player.invincibleTimer = INVINCIBILITY_FRAMES;
			if (player.hp <= 0) setGameState("GAME_OVER");
			break;
		}
	}
}

function updateHPDisplay() {
	const hpPercentage = (player.hp / player.maxHp) * 100;
	hpBar.style.width = `${hpPercentage}%`;
	hpValue.textContent = `${player.hp} / ${player.maxHp}`;
}

function drawBattleBox() {
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = BATTLE_BOX_BORDER;
	ctx.strokeRect(battleBox.x, battleBox.y, battleBox.width, battleBox.height);
}

function drawAttackBar() {
	ctx.fillStyle = "#000";
	ctx.fillRect(attackBar.x, attackBar.y, attackBar.width, attackBar.height);
	ctx.strokeStyle = "#fff";
	ctx.strokeRect(attackBar.x, attackBar.y, attackBar.width, attackBar.height);
	const targetZoneWidth = ATTACK_TARGET_ZONE_WIDTH;
	const targetZoneX = battleBox.x + battleBox.width / 2 - targetZoneWidth / 2;
	ctx.fillStyle = "rgba(255, 255, 0, 0.5)";
	ctx.fillRect(targetZoneX, attackBar.y, targetZoneWidth, attackBar.height);
	ctx.fillStyle = "#fff";
	ctx.fillRect(attackBar.markerX, attackBar.y, 2, attackBar.height);
}

function updateAttackBar() {
	if (!attackBar.moving) return;
	attackBar.markerX += attackBar.markerSpeed;
	if (
		attackBar.markerX > battleBox.x + battleBox.width ||
		attackBar.markerX < battleBox.x
	) {
		attackBar.markerSpeed *= -1;
	}
}

function handlePlayerAttack() {
	attackBar.moving = false;
	const targetCenter = battleBox.x + battleBox.width / 2;
	const distance = Math.abs(attackBar.markerX - targetCenter);
	const damage = Math.max(0, 10 - Math.floor(distance / 5));
	const enemy = getSelectedEnemy();
	enemy.hp -= damage;
	if (enemy.hp < 0) enemy.hp = 0;
	updateEnemyHPDisplay();
	showMessage(`${enemy.name} に ${damage} のダメージ！`);
	if (enemy.hp <= 0) {
		showMessage(`${enemy.name} を倒した！`);
		// 全ての敵が倒されたらVICTORY
		if (enemies.every((e) => e.hp <= 0)) {
			setTimeout(() => setGameState("VICTORY"), 800);
		} else {
			setTimeout(() => setGameState("ENEMY_TURN"), 1000);
		}
	} else {
		setTimeout(() => setGameState("ENEMY_TURN"), 1000);
	}

	// After the attack resolves, ensure battle visuals are returned to normal
	document
		.getElementById("battle-box-container")
		.classList.remove("bring-front");
	document.getElementById("attack-button").classList.remove("bring-front");
	attackButton.style.display = "none";

	// ENEMY_TURN/PLAYER_ATTACK時は選択肢のハートマークを非表示
	const optionsContainer = document.getElementById("options-container");

	// 攻撃対象選択UI表示制御
	const targetSelectContainer = document.getElementById(
		"target-select-container",
	);
	if (gameState === "SELECT_TARGET") {
		targetSelectContainer.style.display = "flex";
	} else {
		targetSelectContainer.style.display = "none";
	}

	// ハートマーク表示制御
	if (gameState === "ENEMY_TURN" || gameState === "PLAYER_ATTACK") {
		optionsContainer?.classList.add("hide-heart");
	} else {
		optionsContainer?.classList.remove("hide-heart");
	}
}

function setGameState(newState) {
	if (gameState === newState) return;

	const previousState = gameState;
	gameState = newState;

	const battleBoxContainer = document.getElementById("battle-box-container");
	const messageWindow = document.getElementById("message-window");

	if (gameState === "GAME_OVER") {
		battleBoxContainer.style.display = "none";
		messageWindow.classList.add("hidden");
		setTimeout(() => {
			document.getElementById("game-over").style.display = "block";
		}, 3000); // Increased delay to ensure complete hiding
	} else if (gameState === "VICTORY") {
		battleBoxContainer.style.display = "none";
		messageWindow.classList.add("hidden");
		setTimeout(() => {
			document.getElementById("game-clear").style.display = "block";
		}, 3000); // Increased delay to ensure complete hiding
	}

	clearTimeout(enemyTurnTimer);
	clearInterval(bulletSpawnInterval);
	gameState = newState;

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	attackButton.style.display = "none";

	const optionsContainer = document.getElementById("options-container");
	const targetSelectContainer = document.getElementById(
		"target-select-container",
	);
	if (gameState === "SELECT_TARGET") {
		// show target select and hide heart icon
		targetSelectContainer && (targetSelectContainer.style.display = "flex");
		optionsContainer?.classList.add("hide-heart");
	} else if (gameState === "ENEMY_TURN" || gameState === "PLAYER_ATTACK") {
		optionsContainer?.classList.add("hide-heart");
		if (targetSelectContainer) targetSelectContainer.style.display = "none";
	} else {
		targetSelectContainer && (targetSelectContainer.style.display = "none");
		optionsContainer?.classList.remove("hide-heart");
	}

	if (gameState === "ENEMY_TURN") {
		setFrameMode("battle");
		hideMessage({ keepFrame: true });
		bullets.length = 0;
		framesSinceLastHoming = 0;
		bulletSpawnInterval = setInterval(createBullet, BULLET_SPAWN_INTERVAL_MS);
		enemyTurnTimer = setTimeout(() => {
			if (gameState !== "GAME_OVER") {
				setGameState("PLAYER_TURN");
			}
		}, ENEMY_TURN_DURATION_MS);
	} else if (gameState === "PLAYER_TURN") {
		setFrameMode("message");
		if (previousState === "ENEMY_TURN") {
			showMessage("敵の攻撃が終わった！", 1500);
			setTimeout(() => {
				showMessage("行動を選択してください", {
					persistent: true,
					blockInput: false,
				});
			}, 1600);
		} else {
			showMessage("行動を選択してください", {
				persistent: true,
				blockInput: false,
			});
		}
	} else if (gameState === "SELECT_TARGET") {
		setFrameMode("message", { force: true });
	} else if (gameState === "PLAYER_ATTACK") {
		setFrameMode("attack");
		hideMessage({ keepFrame: true });
		attackBar.markerX = battleBox.x;
		attackBar.moving = true;
		attackButton.style.display = "flex";
		document
			.getElementById("battle-box-container")
			.classList.add("bring-front");
		document.getElementById("attack-button").classList.add("bring-front");
	} else if (gameState === "GAME_OVER") {
		setFrameMode("message", { force: true });
		gameOverText.style.display = "block";
		document.getElementById("attack-button").style.display = "none";
		bullets.length = 0;
	} else if (gameState === "VICTORY") {
		setFrameMode("message", { force: true });
		document.getElementById("game-clear").style.display = "block";
		document.getElementById("attack-button").style.display = "none";
		bullets.length = 0;
	}
}

function gameLoop() {
	// ゲームオーバー時にループがフリーズする問題を修正
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	if (gameState === "ENEMY_TURN") {
		framesSinceLastHoming++;
		if (!messageVisible) drawBattleBox();
		updatePlayerPosition();
		if (!messageVisible) {
			updateBulletsPosition();
			checkCollisions();
			drawBullets();
			drawPlayer();
		}
	} else if (gameState === "PLAYER_TURN") {
		if (!messageVisible) drawBattleBox(); // Show box background
	} else if (gameState === "PLAYER_ATTACK") {
		// Always draw attack visuals during PLAYER_ATTACK, even if a message is visible
		updateAttackBar();
		drawAttackBar();
	} else if (gameState === "GAME_OVER") {
		// GAME_OVER: no battle visuals, only the GAME OVER text is shown (DOM element)
		// intentionally skip drawBattleBox/drawPlayer/drawBullets
	} else if (gameState === "VICTORY") {
		// VICTORY: no battle visuals, only GAME CLEAR DOM element
		// intentionally skip drawBattleBox/drawPlayer/drawBullets
	}

	requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---
function triggerAttack() {
	if (gameState === "PLAYER_ATTACK" && attackBar.moving) {
		handlePlayerAttack();
	}
}

window.addEventListener("keydown", (e) => {
	// ignore inputs while message displayed, except when we're actively selecting a target
	if (messageActive && gameState !== "SELECT_TARGET") return;
	// Arrow key behavior depends on current game state

	if (gameState === "PLAYER_TURN") {
		// 行動選択
		if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
			setSelection(selectionIndex - 1);
			return;
		}
		if (e.key === "ArrowDown" || e.key === "ArrowRight") {
			setSelection(selectionIndex + 1);
			return;
		}
	} else if (gameState === "SELECT_TARGET") {
		// 攻撃対象選択
		if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			selectedEnemyIndex = Math.max(0, selectedEnemyIndex - 1);
			// if message window contains the selection UI, update it; otherwise update the persistent container
			if (messageContent && messageContent.childElementCount)
				updateMessageWindowSelection();
			else updateTargetSelectUI();
			return;
		}
		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			selectedEnemyIndex = Math.min(enemies.length - 1, selectedEnemyIndex + 1);
			if (messageContent && messageContent.childElementCount)
				updateMessageWindowSelection();
			else updateTargetSelectUI();
			return;
		}
		if (e.code === "Space" || e.key === "Enter") {
			// confirm selection: hide message then enter attack
			hideMessage({ keepFrame: true });
			setGameState("PLAYER_ATTACK");
			return;
		}
	} else {
		// During enemy turn or attack phase, arrows control player movement only
		if (e.key in keys) keys[e.key] = true;
	}

	if (e.code === "Space") {
		e.preventDefault(); // Prevent page scrolling
		// If in player turn and not in attack substate, execute selected action
		if (gameState === "PLAYER_TURN") {
			const btn = optionButtons[selectionIndex];
			if (!btn) return;
			const id = btn.id;
			if (id === "fight") {
				// show target selection instead of jumping straight to attack
				showTargetSelectionInMessage();
				setGameState("SELECT_TARGET");
			} else if (id === "act") {
				showMessage("You try to ACT...");
			} else if (id === "item") {
				showMessage("You check your ITEMS");
			} else if (id === "mercy") {
				showMessage("You show MERCY...");
			}
		} else {
			// If during attack phase, space triggers attack timing
			if (gameState === "PLAYER_ATTACK") triggerAttack();
		}
	}
});
window.addEventListener("keyup", (e) => {
	if (e.key in keys) keys[e.key] = false;
});

fightButton.addEventListener("click", () => {
	if (messageActive) return;
	if (gameState === "PLAYER_TURN") {
		// Show target selection inside message window
		showTargetSelectionInMessage();
		setGameState("SELECT_TARGET");
	}
});

// 攻撃対象選択UI生成・更新
function updateTargetSelectUI() {
	const container = document.getElementById("target-select-container");
	if (!container) return;
	container.innerHTML = "";
	enemies.forEach((enemy, i) => {
		const btn = document.createElement("button");
		btn.textContent = `${enemy.name} (${enemy.hp} / ${enemy.maxHp})`;
		btn.className =
			"target-select-btn" + (i === selectedEnemyIndex ? " selected" : "");
		btn.disabled = enemy.hp <= 0;
		btn.onclick = () => {
			selectedEnemyIndex = i;
			updateTargetSelectUI();
		};
		btn.ondblclick = () => {
			selectedEnemyIndex = i;
			setGameState("PLAYER_ATTACK");
		};
		container.appendChild(btn);
	});
}

// メッセージウィンドウ内に攻撃対象選択を表示する
function showTargetSelectionInMessage() {
	if (!messageWindow || !messageContent) return;
	setFrameMode("message", { force: true });
	clearMessageTimer();
	messageContent.innerHTML = "";
	messageContent.style.opacity = "0";
	messageContent.style.opacity = "1";
	const container = document.createElement("div");
	container.style.display = "flex";
	container.style.flexWrap = "wrap";
	container.style.justifyContent = "center";
	container.style.gap = "12px";
	enemies.forEach((enemy, i) => {
		const btn = document.createElement("button");
		btn.textContent = `${enemy.name} (${enemy.hp} / ${enemy.maxHp})`;
		btn.className =
			"target-select-btn" + (i === selectedEnemyIndex ? " selected" : "");
		btn.disabled = enemy.hp <= 0;
		btn.onclick = () => {
			selectedEnemyIndex = i;
			updateMessageWindowSelection();
		};
		btn.ondblclick = () => {
			selectedEnemyIndex = i;
			hideMessage({ keepFrame: true });
			setGameState("PLAYER_ATTACK");
		};
		container.appendChild(btn);
	});
	messageContent.appendChild(container);
	messageWindow.classList.remove("hidden");
	messageWindow.setAttribute("aria-hidden", "false");
	messageActive = true;
	messageVisible = true;
}

// message window 側の選択表示を更新する (キーボードで選択を反映させるため)
function updateMessageWindowSelection() {
	if (!messageContent) return;
	const buttons = Array.from(
		messageContent.querySelectorAll(".target-select-btn"),
	);
	buttons.forEach((btn, idx) => {
		(btn as HTMLElement).classList.toggle(
			"selected",
			idx === selectedEnemyIndex,
		);
	});
}

attackButton.addEventListener("click", triggerAttack);

// --- Message window helpers ---
type FrameMode = "message" | "attack" | "battle";
let frameMode: FrameMode = "message";
let messageTimer: ReturnType<typeof setTimeout> | null = null;
let messageActive = false; // input lock
let messageVisible = false; // visual state

function clearMessageTimer() {
	if (messageTimer) {
		clearTimeout(messageTimer);
		messageTimer = null;
	}
}

function setFrameMode(
	mode: FrameMode,
	opts: { immediate?: boolean; force?: boolean } = {},
) {
	if (!messageWindow) return;
	const { immediate = false, force = false } = opts;
	if (!force && frameMode === mode) return;
	if (immediate) messageWindow.classList.add("no-transition");
	messageWindow.classList.remove("mode-message", "mode-attack", "mode-battle");
	messageWindow.classList.add(`mode-${mode}`);
	messageWindow.classList.remove("hidden");
	messageWindow.dataset.frameMode = mode;
	if (mode === "message") {
		messageWindow.setAttribute("aria-hidden", "false");
	} else {
		messageWindow.setAttribute("aria-hidden", "true");
		if (messageContent) messageContent.innerHTML = "";
	}
	frameMode = mode;
	if (immediate) {
		requestAnimationFrame(() =>
			messageWindow.classList.remove("no-transition"),
		);
	}
}

type ShowMessageOptions = {
	duration?: number;
	blockInput?: boolean;
	persistent?: boolean;
};
function showMessage(
	text: string,
	optsOrMs: number | ShowMessageOptions = 3000,
) {
	if (!messageWindow || !messageContent) return;
	setFrameMode("message");
	messageWindow.classList.remove("hidden");
	messageWindow.setAttribute("aria-hidden", "false");
	messageContent.style.opacity = "1";
	messageContent.textContent = text;
	messageVisible = true;

	// normalize options
	let duration = 3000;
	let blockInput = true;
	let persistent = false;
	if (typeof optsOrMs === "number") {
		duration = optsOrMs;
	} else if (typeof optsOrMs === "object" && optsOrMs !== null) {
		const opts = optsOrMs as ShowMessageOptions;
		if (typeof opts.duration === "number") duration = opts.duration;
		if (typeof opts.blockInput === "boolean") blockInput = opts.blockInput;
		if (typeof opts.persistent === "boolean") persistent = opts.persistent;
	}

	messageActive = !!blockInput;
	clearMessageTimer();
	if (!persistent) {
		messageTimer = setTimeout(() => {
			hideMessage();
		}, duration);
	}
}

function hideMessage(opts: { keepFrame?: boolean } = {}) {
	if (!messageWindow || !messageContent) return;
	const { keepFrame = false } = opts;
	clearMessageTimer();
	messageContent.innerHTML = "";
	messageContent.style.opacity = "0";
	messageActive = false;
	messageVisible = false;
	messageWindow.setAttribute("aria-hidden", "true");
	if (!keepFrame) {
		messageWindow.classList.add("hidden");
	}
}

setFrameMode("message", { immediate: true, force: true });
messageWindow?.classList.add("hidden");
messageContent && (messageContent.style.opacity = "0");

// Wire other action buttons to show messages
document.getElementById("act").addEventListener("click", () => {
	if (messageActive) return;
	if (gameState === "PLAYER_TURN") showMessage("You try to ACT...");
});
document.getElementById("item").addEventListener("click", () => {
	if (messageActive) return;
	if (gameState === "PLAYER_TURN") showMessage("You check your ITEMS");
});
document.getElementById("mercy").addEventListener("click", () => {
	if (messageActive) return;
	if (gameState === "PLAYER_TURN") showMessage("You show MERCY...");
});

// --- Initialization ---
try {
	const joystickManager = nipplejs.create({
		zone: document.getElementById("joystick-container"),
		mode: "static",
		position: { right: "75px", bottom: "105px" },
		color: "white",
		size: 120,
	}) as any;
	joystickManager
		.on("move", (evt, data) => {
			if (messageActive) return;
			const angle = data.angle.radian;
			const force = Math.min(data.force, 1.0);
			joystickVector.x = Math.cos(angle) * force;
			joystickVector.y = -Math.sin(angle) * force;
		})
		.on("end", () => {
			joystickVector.x = 0;
			joystickVector.y = 0;
		});
} catch (e) {
	// joystick init failed (silent)
}

// 攻撃対象選択UI関数をグローバルに

updateHPDisplay();
setGameState("PLAYER_TURN"); // Start with player's turn
gameLoop();
