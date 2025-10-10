import * as Tone from "tone";

// --- DOM要素の取得 ---
const gameScreen = document.getElementById("game-screen") as HTMLElement;
const startScreen = document.getElementById("start-screen") as HTMLElement;
const gameOverScreen = document.getElementById(
	"game-over-screen",
) as HTMLElement;
const startButton = document.getElementById(
	"start-button",
) as HTMLButtonElement;
const restartButton = document.getElementById(
	"restart-button",
) as HTMLButtonElement;
const messageText = document.getElementById("message-text") as HTMLElement;
const playerHpEl = document.getElementById("player-hp") as HTMLElement;
const playerChargeEl = document.getElementById("player-charge") as HTMLElement;
const playerActionDisplay = document.getElementById(
	"player-action-display",
) as HTMLElement;
const playerPanel = document.getElementById("player-panel") as HTMLElement;
const cpuHpEl = document.getElementById("cpu-hp") as HTMLElement;
const cpuChargeEl = document.getElementById("cpu-charge") as HTMLElement;
const cpuActionDisplay = document.getElementById(
	"cpu-action-display",
) as HTMLElement;
const cpuPanel = document.getElementById("cpu-panel") as HTMLElement;
const actionButtons =
	document.querySelectorAll<HTMLButtonElement>(".action-button");
const beatIndicators = [
	document.getElementById("beat-1") as HTMLElement,
	document.getElementById("beat-2") as HTMLElement,
	document.getElementById("beat-3") as HTMLElement,
	document.getElementById("beat-4") as HTMLElement,
];
// Frequently used buttons typed as HTMLButtonElement so .disabled and .dataset are available
const attackButton = document.getElementById(
	"attack-button",
) as HTMLButtonElement | null;
const guardButton = document.getElementById(
	"guard-button",
) as HTMLButtonElement | null;
const chargeButton = document.getElementById(
	"charge-button",
) as HTMLButtonElement | null;

// --- ゲームの状態管理 ---
let playerState = { hp: 3, charge: 0 };
let cpuState = { hp: 3, charge: 0 };
let playerAction = "CHARGE"; // 3拍目までに入力がない場合のデフォルト
let lockedPlayerAction = "CHARGE"; // 2拍目終了時に確定するアクション
let cpuAction = "";
let lastPlayerAction = "";
let lastCpuAction = "";
let currentBeat = 0;
let isGameRunning = false;
let audioInitialized = false;

// --- サウンド設定 (Tone.js) ---
const synth = new Tone.Synth().toDestination();
const noiseSynth = new Tone.NoiseSynth({
	noise: { type: "white" },
	envelope: { attack: 0.005, decay: 0.1, sustain: 0 },
}).toDestination();

// --- ゲームの初期化 ---
function initGame() {
	playerState = { hp: 3, charge: 0 };
	cpuState = { hp: 3, charge: 0 };
	playerAction = "CHARGE";
	lockedPlayerAction = "CHARGE";
	cpuAction = "";
	lastPlayerAction = "";
	lastCpuAction = "";
	currentBeat = 0;
	updateUI();
	updateGuardAvailability();
	messageText.textContent = "Get Ready...";
	gameScreen.classList.remove("hidden");
	startScreen.classList.add("hidden");
	gameOverScreen.classList.add("hidden");
}

// --- UI更新 ---
function updateUI() {
	playerHpEl.textContent = String(playerState.hp);
	playerChargeEl.textContent = String(playerState.charge);
	cpuHpEl.textContent = String(cpuState.hp);
	cpuChargeEl.textContent = String(cpuState.charge);

	// ATTACKボタンの有効/無効化
	// attackButton may be null if the DOM isn't present; check before assigning
	if (attackButton) {
		attackButton.disabled = playerState.charge === 0;
	}
}

// --- ガードボタンの有効/無効を切り替え ---
function updateGuardAvailability() {
	// guardButton may be null if the DOM isn't present; check before assigning
	if (guardButton) {
		if (lastPlayerAction === "GUARD") {
			guardButton.disabled = true;
		} else {
			guardButton.disabled = false;
		}
	}
}

// --- ゲームループ ---
const gameLoop = (time) => {
	currentBeat = (currentBeat % 4) + 1;
	Tone.Draw.schedule(() => {
		updateBeatIndicator();
		switch (currentBeat) {
			case 1:
				messageText.textContent = "パン！";
				hideActions();
				updateGuardAvailability();
				break;
			case 2:
				messageText.textContent = "パン！";
				// ここではlockedPlayerActionを決定しない
				break;
			case 3:
				// 3拍目直前でアクションを確定
				if (playerAction === "ATTACK" && playerState.charge > 0) {
					lockedPlayerAction = "ATTACK";
				} else if (playerAction === "GUARD" && lastPlayerAction !== "GUARD") {
					lockedPlayerAction = "GUARD";
				} else {
					lockedPlayerAction = "CHARGE";
				}
				messageText.textContent = "ACTION!";
				executeActions(time);
				showActions();
				break;
			case 4:
				messageText.textContent = "...";
				resolveTurn(time);
				checkGameOver();
				break;
		}
	}, time);
	if (currentBeat <= 2) {
		synth.triggerAttackRelease("C5", "8n", time);
	}
};

// --- 拍子インジケーターの更新 ---
function updateBeatIndicator() {
	beatIndicators.forEach((el, index) => {
		if (index + 1 === currentBeat) {
			el.classList.add("active");
		} else {
			el.classList.remove("active");
		}
	});
}

// --- 3拍目: アクションの実行 ---
function executeActions(time) {
	// CPUのアクション決定
	cpuAction = getCpuAction();

	// サウンド再生
	playActionSound(lockedPlayerAction, time);
	playActionSound(cpuAction, time + 0.05); // 少しだけ時間をずらす

	// UIにアクションを表示
	playerActionDisplay.textContent = lockedPlayerAction;
	cpuActionDisplay.textContent = cpuAction;

	// アクションの文字色を設定
	setActionColor(playerActionDisplay, lockedPlayerAction);
	setActionColor(cpuActionDisplay, cpuAction);

	// パネルのスタイルを設定
	setPanelStyle(playerPanel, lockedPlayerAction);
	setPanelStyle(cpuPanel, cpuAction);
}

// アクションの表示・非表示
function showActions() {
	playerActionDisplay.classList.add("action-enter");
	cpuActionDisplay.classList.add("action-enter");
}
function hideActions() {
	playerActionDisplay.classList.remove("action-enter");
	cpuActionDisplay.classList.remove("action-enter");

	// アクションの文字色をリセット
	playerActionDisplay.classList.remove(
		"text-yellow-400",
		"text-red-500",
		"text-blue-400",
	);
	cpuActionDisplay.classList.remove(
		"text-yellow-400",
		"text-red-500",
		"text-blue-400",
	);

	// パネルのスタイルをリセット
	const panels = [playerPanel, cpuPanel];
	panels.forEach((panel) => {
		panel.classList.remove(
			"border-yellow-400",
			"border-red-500",
			"border-blue-400",
			"bg-yellow-500/50",
			"bg-red-500/50",
			"bg-blue-500/50",
		);
		panel.classList.add("border-gray-300", "bg-gray-800/50");
	});
}

// --- アクション表示の文字色を設定 ---
function setActionColor(element, action) {
	// Remove existing colors first
	element.classList.remove("text-yellow-400", "text-red-500", "text-blue-400");
	switch (action) {
		case "CHARGE":
			element.classList.add("text-yellow-400");
			break;
		case "ATTACK":
			element.classList.add("text-red-500");
			break;
		case "GUARD":
			element.classList.add("text-blue-400");
			break;
	}
}

// --- パネルのスタイル（枠と背景色）を設定 ---
function setPanelStyle(panel, action) {
	// Remove default and other action colors first
	panel.classList.remove(
		"border-gray-300",
		"bg-gray-800/50",
		"border-yellow-400",
		"bg-yellow-500/50",
		"border-red-500",
		"bg-red-500/50",
		"border-blue-400",
		"bg-blue-500/50",
	);

	switch (action) {
		case "CHARGE":
			panel.classList.add("border-yellow-400", "bg-yellow-500/50");
			break;
		case "ATTACK":
			panel.classList.add("border-red-500", "bg-red-500/50");
			break;
		case "GUARD":
			panel.classList.add("border-blue-400", "bg-blue-500/50");
			break;
	}
}

// --- CPUのAIロジック ---
function getCpuAction() {
	const actions = ["CHARGE", "GUARD"];

	// 連続ガードを防止
	if (lastCpuAction === "GUARD") {
		const guardIndex = actions.indexOf("GUARD");
		if (guardIndex > -1) {
			actions.splice(guardIndex, 1);
		}
	}

	if (cpuState.charge > 0) {
		actions.push("ATTACK");
	}

	// 基本はランダム
	let choice = actions[Math.floor(Math.random() * actions.length)];

	// 少しだけ賢くする
	if (actions.includes("ATTACK")) {
		if (playerState.charge >= 2 && cpuState.charge > 0) {
			if (Math.random() < 0.5) choice = "ATTACK";
		}
		if (cpuState.charge > playerState.charge && cpuState.charge > 0) {
			if (Math.random() < 0.5) choice = "ATTACK";
		}
	}
	if (actions.includes("GUARD")) {
		if (cpuState.hp <= 1) {
			if (Math.random() < 0.5) choice = "GUARD";
		}
	}

	return choice || "CHARGE"; // actionsが空になることはないはずだが念のため
}

// --- 4拍目: 結果判定 ---
function resolveTurn(time) {
	let turnMessage = "";
	const pa = lockedPlayerAction;
	const ca = cpuAction;

	const playerCanAttack = pa === "ATTACK" && playerState.charge > 0;
	const cpuCanAttack = ca === "ATTACK" && cpuState.charge > 0;

	// ATTACK vs ATTACK: 相殺 (Cancel out)
	if (playerCanAttack && cpuCanAttack) {
		playerState.charge--;
		cpuState.charge--;
		turnMessage = "ATTACKS CANCELED!";
	} else {
		// --- 他のすべてのケース ---
		// CHARGE
		if (pa === "CHARGE") {
			if (playerState.charge < 3) {
				playerState.charge++;
				turnMessage += "PLAYER CHARGED! ";
			}
		}
		if (ca === "CHARGE") {
			if (cpuState.charge < 3) {
				cpuState.charge++;
				turnMessage += "CPU CHARGED!";
			}
		}

		// ATTACK
		let playerAttackSuccess = false;
		let cpuAttackSuccess = false;

		if (pa === "ATTACK") {
			if (playerState.charge > 0) {
				playerState.charge--;
				if (ca !== "GUARD") {
					playerAttackSuccess = true;
				} else {
					turnMessage = "PLAYER ATTACK GUARDED! ";
				}
			}
		}
		if (ca === "ATTACK") {
			if (cpuState.charge > 0) {
				cpuState.charge--;
				if (pa !== "GUARD") {
					cpuAttackSuccess = true;
				} else {
					turnMessage += "CPU ATTACK GUARDED!";
				}
			}
		}

		// ダメージ計算
		let hits = 0;
		if (playerAttackSuccess) {
			cpuState.hp--;
			turnMessage = "PLAYER HITS! ";
			noiseSynth.triggerAttackRelease("0.2n", time + hits * 0.1);
			hits++;
			cpuHpEl.classList.add("status-update");
		}
		if (cpuAttackSuccess) {
			playerState.hp--;
			turnMessage += "CPU HITS!";
			noiseSynth.triggerAttackRelease("0.2n", time + hits * 0.1);
			hits++;
			playerHpEl.classList.add("status-update");
		}
	}

	if (turnMessage.trim()) {
		messageText.textContent = turnMessage.trim();
	} else {
		messageText.textContent = "...DRAW...";
	}

	lastPlayerAction = pa;
	lastCpuAction = ca;

	// アニメーションクラスを削除
	setTimeout(() => {
		playerHpEl.classList.remove("status-update");
		cpuHpEl.classList.remove("status-update");
	}, 500);

	updateUI();
	playerAction = "CHARGE"; // 次のターンのデフォルトを設定
}

// --- ゲームオーバー判定 ---
function checkGameOver() {
	if (playerState.hp <= 0 || cpuState.hp <= 0) {
		isGameRunning = false;
		Tone.Transport.stop();
		Tone.Transport.cancel();

		const gameOverMessage = document.getElementById("game-over-message");
		if (playerState.hp <= 0 && cpuState.hp <= 0) {
			gameOverMessage.textContent = "DRAW";
		} else if (playerState.hp <= 0) {
			gameOverMessage.textContent = "YOU LOSE...";
		} else {
			gameOverMessage.textContent = "YOU WIN!";
		}

		gameScreen.classList.add("hidden");
		gameOverScreen.classList.remove("hidden");
	}
}

// --- アクション音の再生 ---
function playActionSound(action, time) {
	switch (action) {
		case "CHARGE":
			synth.triggerAttackRelease("E5", "8n", time);
			break;
		case "GUARD":
			synth.triggerAttackRelease("G4", "8n", time);
			break;
		case "ATTACK":
			if (
				(action === playerAction && playerState.charge > 0) ||
				(action === cpuAction && cpuState.charge > 0)
			) {
				synth.triggerAttackRelease("G5", "8n", time);
			}
			break;
	}
}

// --- イベントリスナー ---
// ゲーム開始ボタン
startButton.addEventListener("click", () => {
	if (!audioInitialized) {
		Tone.start();
		audioInitialized = true;
		console.log("Audio context started");
	}
	initGame();
	isGameRunning = true;
	Tone.Transport.bpm.value = 240;
	Tone.Transport.scheduleRepeat(gameLoop, "4n");
	Tone.Transport.start();
});

// リスタートボタン
restartButton.addEventListener("click", () => {
	initGame();
	isGameRunning = true;
	// ゲームループを再度スケジュールする
	Tone.Transport.scheduleRepeat(gameLoop, "4n");
	Tone.Transport.start();
});

// アクションボタン
actionButtons.forEach((button) => {
	button.addEventListener("click", () => {
		if (!isGameRunning || currentBeat >= 3 || button.disabled) return;
		playerAction = button.dataset.action;

		// プレイヤーにフィードバック
		button.classList.add("ring-4", "ring-white");
		setTimeout(() => button.classList.remove("ring-4", "ring-white"), 200);
	});
});

// --- キーボード入力 ---
document.addEventListener("keydown", (event) => {
	if (!isGameRunning || currentBeat >= 3) return;

	let selectedAction = "";
	let buttonToHighlight: HTMLButtonElement | null = null;

	switch (event.code) {
		case "ShiftLeft":
		case "ShiftRight":
			selectedAction = "CHARGE";
			buttonToHighlight = chargeButton;
			break;
		case "Space":
			event.preventDefault(); // スペースキーでのスクロールを防止
			buttonToHighlight = guardButton;
			if (buttonToHighlight?.disabled) return;
			selectedAction = "GUARD";
			break;
		case "Enter":
			event.preventDefault(); // Enterキーでのボタン再クリックを防止
			selectedAction = "ATTACK";
			buttonToHighlight = attackButton;
			break;
	}

	if (selectedAction) {
		if (selectedAction === "ATTACK" && playerState.charge === 0) return;
		playerAction = selectedAction;
		// プレイヤーにフィードバック
		if (buttonToHighlight) {
			buttonToHighlight.classList.add("ring-4", "ring-white");
			setTimeout(
				() => buttonToHighlight.classList.remove("ring-4", "ring-white"),
				200,
			);
		}
	}
});

// 音声再生の許可（画面クリック）
document.body.addEventListener(
	"click",
	() => {
		if (!audioInitialized) {
			Tone.start();
			audioInitialized = true;
			console.log("Audio context started by body click");
		}
	},
	{ once: true },
);
