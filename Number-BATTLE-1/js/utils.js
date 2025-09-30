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

export function cloneSnapshot(state) {
	return {
		player: [...state.player],
		cpu: [...state.cpu]
	};
}

export function makeStateKey(snapshot, turn) {
	return JSON.stringify({ player: snapshot.player, cpu: snapshot.cpu, turn });
}
