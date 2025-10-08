type GameState = {
	originalFactors: number[]; // primes provided as the pool
	current: number; // current value being divided
	remainingFactors: number[]; // remaining factors available (counts tracked)
	steps: number;
};

// Utility: pick some prime factors to present to the user
function pickPrimePool(): number[] {
	// Make a small pool of primes. We'll choose 2..19
	const primes = [2, 3, 5, 7, 11, 13, 17, 19];
	// choose 2-4 primes randomly
	const count = 2 + Math.floor(Math.random() * 3);
	const pool: number[] = [];
	while (pool.length < count) {
		const p = primes[Math.floor(Math.random() * primes.length)];
		if (!pool.includes(p)) pool.push(p);
	}
	return pool;
}

// Generate a number that is product of selected prime factors only.
// We will multiply each chosen prime by a random exponent between 1 and 3.
function generateNumberFromPrimes(primes: number[]): { n: number, factors: number[] } {
	const factors: number[] = [];
	let n = 1;
	for (const p of primes) {
		const exp = 1 + Math.floor(Math.random() * 3); // 1..3
		for (let i = 0; i < exp; i++) {
			n *= p;
			factors.push(p);
		}
	}
	// shuffle factors so order is not grouped by prime
	for (let i = factors.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[factors[i], factors[j]] = [factors[j], factors[i]];
	}
	return { n, factors };
}

// Count occurrences of factors
function counts(arr: number[]): Map<number, number> {
	const m = new Map<number, number>();
	for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
	return m;
}

// DOM helpers
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

let state: GameState | null = null;

function render() {
	const currentEl = el<HTMLDivElement>('current')!;
	const factorsEl = el<HTMLDivElement>('factors')!;
	const stepsEl = el<HTMLDivElement>('steps')!;
	const logEl = el<HTMLDivElement>('log')!;
	if (!state) return;
	currentEl.textContent = String(state.current);
	stepsEl.textContent = `ステップ: ${state.steps}`;
	logEl.textContent = '';

	// show factor buttons with remaining counts
	factorsEl.innerHTML = '';
	const c = counts(state.remainingFactors);
	const unique = Array.from(new Set(state.originalFactors));
	unique.sort((a, b) => a - b);
	for (const p of unique) {
		const btn = document.createElement('button');
		btn.className = 'factor';
		const available = c.get(p) || 0;
		btn.textContent = `${p} × ${available}`;
		btn.disabled = available === 0;
		btn.addEventListener('click', () => onFactorClick(p));
		factorsEl.appendChild(btn);
	}
}

function onFactorClick(p: number) {
	if (!state) return;
	if (state.current % p !== 0) {
		appendLog(`${p} では割り切れません。`);
		return;
	}
	// remove one occurrence of p from remainingFactors
	const idx = state.remainingFactors.indexOf(p);
	if (idx === -1) {
		appendLog(`${p} はもう使えません。`);
		return;
	}
	state.remainingFactors.splice(idx, 1);
	state.current = Math.floor(state.current / p);
	state.steps += 1;
	appendLog(`${p} で割った → ${state.current}`);
	render();
	if (state.current === 1) {
		appendLog(`おめでとう！1になりました。ステップ数: ${state.steps}`);
	}
}

function appendLog(s: string) {
	const logEl = el<HTMLDivElement>('log')!;
	const p = document.createElement('div');
	p.textContent = s;
	logEl.prepend(p);
}

function newProblem() {
	const pool = pickPrimePool();
	const { n, factors } = generateNumberFromPrimes(pool);
	state = {
		originalFactors: factors.slice(),
		current: n,
		remainingFactors: factors.slice(),
		steps: 0
	};
	appendLog(`新しい問題: ${n}（素因数プール: ${Array.from(new Set(pool)).join(', ')}）`);
	render();
}

function resetProblem() {
	if (!state) return;
	state.current = state.originalFactors.reduce((a, b) => a * b, 1);
	state.remainingFactors = state.originalFactors.slice();
	state.steps = 0;
	appendLog('リセットしました');
	render();
}

// Wire controls
document.addEventListener('DOMContentLoaded', () => {
	const newBtn = el<HTMLButtonElement>('new')!;
	const resetBtn = el<HTMLButtonElement>('reset')!;
	newBtn.addEventListener('click', newProblem);
	resetBtn.addEventListener('click', resetProblem);
	// start first problem
	newProblem();
});
