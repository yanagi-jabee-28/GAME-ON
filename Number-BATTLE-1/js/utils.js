export const isHandDead = (value) => value === 0 || value === 5;

export const wrapTo1to5 = (value) => ((value - 1) % 5) + 1;

export const formatHandValue = (value) => (isHandDead(value) ? 'X' : value);

export function formatHandsState(state) {
	const playerLeft = formatHandValue(state.player[0]);
	const playerRight = formatHandValue(state.player[1]);
	const cpuLeft = formatHandValue(state.cpu[0]);
	const cpuRight = formatHandValue(state.cpu[1]);
	return `あなた: 左 ${playerLeft} / 右 ${playerRight}　|　CPU: 左 ${cpuLeft} / 右 ${cpuRight}`;
}

export const getNowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function formatTime(seconds) {
	const m = Math.floor(seconds / 60).toString().padStart(2, '0');
	const s = (seconds % 60).toString().padStart(2, '0');
	return `${m}:${s}`;
}

export function cloneSnapshot(state, out) {
	// If caller provides an output object, reuse its arrays to avoid allocation.
	if (out && typeof out === 'object') {
		out.player = out.player || [];
		out.cpu = out.cpu || [];
		out.player[0] = state.player[0];
		out.player[1] = state.player[1];
		out.cpu[0] = state.cpu[0];
		out.cpu[1] = state.cpu[1];
		return out;
	}
	return {
		player: [...state.player],
		cpu: [...state.cpu]
	};
}

export function makeStateKey(snapshot, turn) {
	// compact fixed-format key: "pL,pR|cL,cR|t:<turn>"
	// using numbers directly (5 is treated as dead but kept as numeric) keeps keys short and predictable
	const p0 = snapshot.player[0] ?? 0;
	const p1 = snapshot.player[1] ?? 0;
	const c0 = snapshot.cpu[0] ?? 0;
	const c1 = snapshot.cpu[1] ?? 0;
	return `${p0},${p1}|${c0},${c1}|t:${turn}`;
}
