const PRIME_POOL = [2, 3, 5, 7];

type GameState = {
	current: number; // current value being divided
	original: number; // original number
	steps: number;
};

// Generate a number that is product of PRIME_POOL primes.
// Each prime gets a random exponent between 1 and 3, but ensure n <= 1000.
function generateNumber(): number {
	let n: number;
	do {
		n = 1;
		for (const p of PRIME_POOL) {
			const exp = 1 + Math.floor(Math.random() * 3); // 1..3
			for (let i = 0; i < exp; i++) {
				n *= p;
			}
		}
	} while (n > 1000);
	return n;
}

// DOM helpers
const el = <T extends HTMLElement>(id: string) =>
	document.getElementById(id) as T | null;

let state: GameState | null = null;

function render() {
	const currentEl = el<HTMLDivElement>("current")!;
	const factorsEl = el<HTMLDivElement>("factors")!;
	const stepsEl = el<HTMLDivElement>("steps")!;
	const logEl = el<HTMLDivElement>("log")!;
	if (!state) return;
	currentEl.textContent = String(state.current);
	stepsEl.textContent = `ステップ: ${state.steps}`;
	logEl.textContent = "";

	// show factor buttons, always enabled
	factorsEl.innerHTML = "";
	for (const p of PRIME_POOL) {
		const btn = document.createElement("button");
		btn.className = "factor";
		btn.textContent = String(p);
		btn.addEventListener("click", () => onFactorClick(p));
		factorsEl.appendChild(btn);
	}
}

function onFactorClick(p: number) {
	if (!state) return;
	if (state.current % p !== 0) {
		appendLog(`${p} では割り切れません。`);
		return;
	}
	state.current = Math.floor(state.current / p);
	state.steps += 1;
	appendLog(`${p} で割った → ${state.current}`);
	render();
	if (state.current === 1) {
		appendLog(`おめでとう！1になりました。ステップ数: ${state.steps}`);
	}
}

function appendLog(s: string) {
	const logEl = el<HTMLDivElement>("log")!;
	const p = document.createElement("div");
	p.textContent = s;
	logEl.prepend(p);
}

function newProblem() {
	const n = generateNumber();
	state = {
		current: n,
		original: n,
		steps: 0,
	};
	appendLog(`新しい問題: ${n}`);
	render();
}

function resetProblem() {
	if (!state) return;
	state.current = state.original;
	state.steps = 0;
	appendLog("リセットしました");
	render();
}

// Wire controls
document.addEventListener("DOMContentLoaded", () => {
	const newBtn = el<HTMLButtonElement>("new")!;
	const resetBtn = el<HTMLButtonElement>("reset")!;
	newBtn.addEventListener("click", newProblem);
	resetBtn.addEventListener("click", resetProblem);
	// start first problem
	newProblem();
});
