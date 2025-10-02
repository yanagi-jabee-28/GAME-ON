// debug.js - 開発用デバッグユーティリティ
// 使い方:
// import { initDebug } from './debug.js';
// initDebug({ Game, UI, AI, getStateAccessor });

export function initDebug({ Game, UI, AI, getStateAccessor }) {
	// 既にパネルがある場合は何もしない
	if (document.getElementById('debug-panel')) return;

	const panel = document.createElement('div');
	panel.id = 'debug-panel';
	panel.style.position = 'fixed';
	panel.style.right = '12px';
	panel.style.bottom = '12px';
	panel.style.width = '220px';
	panel.style.zIndex = '1000';
	panel.style.background = 'rgba(17,24,39,0.95)';
	panel.style.color = 'white';
	panel.style.borderRadius = '8px';
	panel.style.padding = '8px';
	panel.style.fontFamily = 'monospace';
	panel.style.fontSize = '12px';
	panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.3)';

	panel.innerHTML = `
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
			<strong style="font-size:12px;">DEBUG</strong>
			<button id="debug-close" style="background:#374151;color:white;border:none;border-radius:4px;padding:2px 6px;cursor:pointer">×</button>
		</div>
		<button id="debug-dump" style="width:100%;margin-bottom:6px;padding:6px;background:#111827;color:#10b981;border-radius:6px;border:none;cursor:pointer">Dump State</button>
		<button id="debug-ai" style="width:100%;margin-bottom:6px;padding:6px;background:#111827;color:#60a5fa;border-radius:6px;border:none;cursor:pointer">Force AI</button>
		<button id="debug-undo" style="width:100%;margin-bottom:6px;padding:6px;background:#111827;color:#f59e0b;border-radius:6px;border:none;cursor:pointer">Undo</button>
		<label style="display:flex;align-items:center;gap:8px;margin-top:6px;">
			<input id="debug-toggle-overlay" type="checkbox" /> Live JSON
		</label>
		<pre id="debug-overlay" style="display:none;max-height:240px;overflow:auto;background:rgba(0,0,0,0.6);padding:6px;border-radius:6px;margin-top:6px;"></pre>
		<!-- Fictional board controls -->
		<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.04);padding-top:8px;">
			<div style="font-size:12px;color:#9CA3AF;margin-bottom:6px;">Fictional Board</div>
			<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
				<label style="font-size:12px;color:#cbd5e1">P0</label><input id="fake-p0" type="number" min="0" max="4" value="1" style="width:46px;padding:4px;border-radius:4px;background:#0f172a;color:#fff;border:none" />
				<label style="font-size:12px;color:#cbd5e1">P1</label><input id="fake-p1" type="number" min="0" max="4" value="1" style="width:46px;padding:4px;border-radius:4px;background:#0f172a;color:#fff;border:none" />
			</div>
			<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
				<label style="font-size:12px;color:#fca5a5">A0</label><input id="fake-a0" type="number" min="0" max="4" value="1" style="width:46px;padding:4px;border-radius:4px;background:#0f172a;color:#fff;border:none" />
				<label style="font-size:12px;color:#fca5a5">A1</label><input id="fake-a1" type="number" min="0" max="4" value="1" style="width:46px;padding:4px;border-radius:4px;background:#0f172a;color:#fff;border:none" />
			</div>
			<div style="display:flex;gap:6px;align-items:center;">
				<label style="font-size:12px;color:#9CA3AF">Turn</label>
				<select id="fake-turn" style="padding:4px;border-radius:4px;background:#0f172a;color:#fff;border:none">
					<option value="player">player</option>
					<option value="ai">ai</option>
				</select>
				<button id="fake-set" style="margin-left:6px;padding:6px;border-radius:6px;background:#065f46;border:none;cursor:pointer;color:white">Use</button>
				<button id="fake-clear" style="margin-left:4px;padding:6px;border-radius:6px;background:#374151;border:none;cursor:pointer;color:white">Clear</button>
			</div>
		</div>
		<div id="debug-actions" style="margin-top:8px;">
			<div style="font-size:12px;margin-bottom:6px;color:#9CA3AF;">Available Moves</div>
			<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
				<label style="display:flex;align-items:center;gap:6px;color:#9CA3AF;"><input id="debug-auto-simulate" type="checkbox" /> Auto-simulate sequence</label>
				<button id="debug-step" style="margin-left:auto;padding:6px;border-radius:6px;background:#374151;border:none;cursor:pointer;color:white">Step</button>
			</div>
			<div id="debug-actions-list" style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow:auto;"></div>
			<label style="display:flex;align-items:center;gap:8px;margin-top:6px;color:#9CA3AF;"><input id="debug-auto-ai" type="checkbox" /> Auto-run AI after player action</label>
		</div>
	`;

	document.body.appendChild(panel);

	const btnDump = panel.querySelector('#debug-dump');
	const btnAI = panel.querySelector('#debug-ai');
	const btnUndo = panel.querySelector('#debug-undo');
	const toggle = panel.querySelector('#debug-toggle-overlay');
	const overlay = panel.querySelector('#debug-overlay');
	const close = panel.querySelector('#debug-close');

	btnDump.addEventListener('click', () => {
		console.group('GAME DEBUG DUMP');
		console.log('playerHands', Game.playerHands);
		console.log('aiHands', Game.aiHands);
		console.log('currentPlayer', Game.currentPlayer);
		console.log('gameOver', Game.gameOver);
		console.log('history length', Game.history ? Game.history.length : 'n/a');
		console.groupEnd();
	});

	btnAI.addEventListener('click', () => {
		if (!AI || !AI.aiTurnWrapper) return;
		console.log('Forcing AI move...');
		AI.aiTurnWrapper(getStateAccessor).then(() => {
			console.log('AI move completed');
			UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands, canUndo: Game.canUndo, gameOver: Game.gameOver });
		});
	});

	btnUndo.addEventListener('click', () => {
		if (Game.canUndo && Game.canUndo()) {
			const ok = Game.undoLastMove();
			console.log('undo ok?', ok);
			UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands, canUndo: Game.canUndo, gameOver: Game.gameOver });
		} else console.log('cannot undo');
	});

	toggle.addEventListener('change', (e) => {
		overlay.style.display = e.target.checked ? 'block' : 'none';
		if (e.target.checked) {
			overlay.textContent = JSON.stringify(getStateAccessor(), null, 2);
			// update periodically
			overlay.__interval = setInterval(() => {
				overlay.textContent = JSON.stringify(getStateAccessor(), null, 2);
			}, 500);
		} else {
			clearInterval(overlay.__interval);
		}
	});

	// Utility: generate moves from a given state (or current Game state)
	function generateMovesFor(owner, stateOverride) {
		const state = stateOverride ? { playerHands: [stateOverride.playerHands[0], stateOverride.playerHands[1]], aiHands: [stateOverride.aiHands[0], stateOverride.aiHands[1]] } : { playerHands: Game.playerHands, aiHands: Game.aiHands };
		const moves = [];
		if (owner === 'ai') {
			for (let i = 0; i < 2; i++) {
				if (state.aiHands[i] === 0) continue;
				for (let j = 0; j < 2; j++) {
					if (state.playerHands[j] === 0) continue;
					moves.push({ type: 'attack', from: 'ai', aiIndex: i, playerIndex: j });
				}
			}
			const total = state.aiHands[0] + state.aiHands[1];
			for (let si = 0; si <= total / 2; si++) {
				const sj = total - si;
				if (sj > 4) continue;
				const isSameAsCurrent = (si === state.aiHands[0] && sj === state.aiHands[1]);
				const isSameAsReversed = (si === state.aiHands[1] && sj === state.aiHands[0]);
				if (!isSameAsCurrent && !isSameAsReversed) moves.push({ type: 'split', owner: 'ai', val0: si, val1: sj });
			}
		} else {
			for (let i = 0; i < 2; i++) {
				if (state.playerHands[i] === 0) continue;
				for (let j = 0; j < 2; j++) {
					if (state.aiHands[j] === 0) continue;
					moves.push({ type: 'attack', from: 'player', playerIndex: i, aiIndex: j });
				}
			}
			const total = state.playerHands[0] + state.playerHands[1];
			for (let si = 0; si <= total / 2; si++) {
				const sj = total - si;
				if (sj > 4) continue;
				const isSameAsCurrent = (si === state.playerHands[0] && sj === state.playerHands[1]);
				const isSameAsReversed = (si === state.playerHands[1] && sj === state.playerHands[0]);
				if (!isSameAsCurrent && !isSameAsReversed) moves.push({ type: 'split', owner: 'player', val0: si, val1: sj });
			}
		}
		return moves;
	}

	// Render available moves into panel
	const actionsListEl = panel.querySelector('#debug-actions-list');
	const autoAiCheckbox = panel.querySelector('#debug-auto-ai');
	const autoSimCheckbox = panel.querySelector('#debug-auto-simulate');
	const stepBtn = panel.querySelector('#debug-step');

	// fake board controls
	const fakeP0 = panel.querySelector('#fake-p0');
	const fakeP1 = panel.querySelector('#fake-p1');
	const fakeA0 = panel.querySelector('#fake-a0');
	const fakeA1 = panel.querySelector('#fake-a1');
	const fakeTurn = panel.querySelector('#fake-turn');
	const fakeSet = panel.querySelector('#fake-set');
	const fakeClear = panel.querySelector('#fake-clear');
	let useFake = false;
	let fakeState = null;

	fakeSet.addEventListener('click', () => {
		const p0 = Number(fakeP0.value) || 0;
		const p1 = Number(fakeP1.value) || 0;
		const a0 = Number(fakeA0.value) || 0;
		const a1 = Number(fakeA1.value) || 0;
		const turn = fakeTurn.value === 'ai' ? 'ai' : 'player';
		fakeState = { playerHands: [p0, p1], aiHands: [a0, a1], currentPlayer: turn };
		useFake = true;
		renderActions();
	});

	fakeClear.addEventListener('click', () => {
		useFake = false;
		fakeState = null;
		renderActions();
	});

	let actionsInterval = null;

	function renderActions() {
		actionsListEl.innerHTML = '';
		const base = useFake && fakeState ? fakeState : { playerHands: Game.playerHands, aiHands: Game.aiHands, currentPlayer: Game.currentPlayer };
		const owner = base.currentPlayer;
		const moves = generateMovesFor(owner, base);
		if (moves.length === 0) {
			actionsListEl.innerHTML = '<div style="color:#9CA3AF;font-size:12px;">(No moves)</div>';
			return;
		}
		// helper: simulate resulting state for display
		function formatState(s) {
			return `<${s.playerHands[0]},${s.playerHands[1]}><${s.aiHands[0]},${s.aiHands[1]}>`;
		}
		function simulateAttackState(m, baseState) {
			const s = { playerHands: [baseState.playerHands[0], baseState.playerHands[1]], aiHands: [baseState.aiHands[0], baseState.aiHands[1]] };
			if (m.from === 'player') {
				s.aiHands[m.aiIndex] = (s.playerHands[m.playerIndex] + s.aiHands[m.aiIndex]) % 5;
			} else {
				s.playerHands[m.playerIndex] = (s.aiHands[m.aiIndex] + s.playerHands[m.playerIndex]) % 5;
			}
			return s;
		}
		function simulateSplitState(m, baseState) {
			const s = { playerHands: [baseState.playerHands[0], baseState.playerHands[1]], aiHands: [baseState.aiHands[0], baseState.aiHands[1]] };
			if (m.owner === 'player') {
				s.playerHands[0] = m.val0; s.playerHands[1] = m.val1;
			} else {
				s.aiHands[0] = m.val0; s.aiHands[1] = m.val1;
			}
			return s;
		}

		moves.forEach((m, idx) => {
			const btn = document.createElement('button');
			btn.style.padding = '6px';
			btn.style.border = 'none';
			btn.style.borderRadius = '6px';
			btn.style.cursor = 'pointer';
			btn.style.background = '#111827';
			btn.style.color = '#fff';
			if (m.type === 'attack') {
				const ns = simulateAttackState(m, base);
				if (owner === 'player') btn.textContent = `Attack: P${m.playerIndex} -> A${m.aiIndex} → ${formatState(ns)}`;
				else btn.textContent = `Attack: A${m.aiIndex} -> P${m.playerIndex} → ${formatState(ns)}`;
				// apply to fake state and optionally auto-step
				btn.onclick = () => {
					// apply move to fake state
					const newState = simulateAttackState(m, base);
					fakeState = { playerHands: [newState.playerHands[0], newState.playerHands[1]], aiHands: [newState.aiHands[0], newState.aiHands[1]], currentPlayer: owner === 'player' ? 'ai' : 'player' };
					useFake = true;
					renderActions();
					if (autoSimCheckbox && autoSimCheckbox.checked) {
						// small delay then auto-step first available move of next player
						setTimeout(() => {
							const nextMoves = generateMovesFor(fakeState.currentPlayer, fakeState);
							if (nextMoves.length > 0) {
								// pick first move
								const nm = nextMoves[0];
								// recursively simulate
								const btns = actionsListEl.querySelectorAll('button');
								// trigger render then simulate first button's click by finding matching label
								renderActions();
								// find first button and click it
								const firstBtn = actionsListEl.querySelector('button');
								if (firstBtn) firstBtn.click();
							}
						}, 300);
					}
				};
			} else if (m.type === 'split') {
				const ns = simulateSplitState(m, base);
				btn.textContent = `Split: ${m.val0} / ${m.val1} → ${formatState(ns)}`;
				btn.onclick = () => {
					let child = btn.nextElementSibling;
					if (child && child.classList && child.classList.contains('sim-node')) { child.remove(); return; }
					const node = document.createElement('div');
					node.className = 'sim-node';
					node.style.margin = '6px 0 10px 8px';
					node.style.padding = '6px';
					node.style.background = 'rgba(255,255,255,0.03)';
					node.style.borderRadius = '6px';
					const resultState = simulateSplitState(m, base);
					node.innerHTML = `<div style="font-size:12px;color:#9CA3AF;">Result: ${formatState(resultState)}</div>`;
					const applyBtn = document.createElement('button');
					applyBtn.textContent = 'Apply to real game';
					applyBtn.style.marginTop = '6px';
					applyBtn.style.padding = '6px';
					applyBtn.style.border = 'none';
					applyBtn.style.borderRadius = '6px';
					applyBtn.style.cursor = 'pointer';
					applyBtn.style.background = '#065f46';
					applyBtn.onclick = () => { if (m.owner === 'player') Game.applySplit('player', m.val0, m.val1); else Game.applySplit('ai', m.val0, m.val1); UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands, canUndo: Game.canUndo, gameOver: Game.gameOver }); };
					node.appendChild(applyBtn);
					// opponent moves
					const opp = owner === 'player' ? 'ai' : 'player';
					const oppMoves = (function (state, ownerX) {
						const movesX = [];
						if (ownerX === 'ai') {
							for (let i = 0; i < 2; i++) { if (state.aiHands[i] === 0) continue; for (let j = 0; j < 2; j++) { if (state.playerHands[j] === 0) continue; movesX.push({ type: 'attack', from: 'ai', aiIndex: i, playerIndex: j }); } }
							const totalX = state.aiHands[0] + state.aiHands[1]; for (let si = 0; si <= totalX / 2; si++) { const sj = totalX - si; if (sj > 4) continue; const same = (si === state.aiHands[0] && sj === state.aiHands[1]); const rev = (si === state.aiHands[1] && sj === state.aiHands[0]); if (!same && !rev) movesX.push({ type: 'split', owner: 'ai', val0: si, val1: sj }); }
						} else {
							for (let i = 0; i < 2; i++) { if (state.playerHands[i] === 0) continue; for (let j = 0; j < 2; j++) { if (state.aiHands[j] === 0) continue; movesX.push({ type: 'attack', from: 'player', playerIndex: i, aiIndex: j }); } }
							const totalX = state.playerHands[0] + state.playerHands[1]; for (let si = 0; si <= totalX / 2; si++) { const sj = totalX - si; if (sj > 4) continue; const same = (si === state.playerHands[0] && sj === state.playerHands[1]); const rev = (si === state.playerHands[1] && sj === state.playerHands[0]); if (!same && !rev) movesX.push({ type: 'split', owner: 'player', val0: si, val1: sj }); }
						}
						return movesX;
					})(resultState, opp);
					if (oppMoves.length > 0) {
						const subList = document.createElement('div'); subList.style.marginTop = '8px';
						oppMoves.forEach(op => { const line = document.createElement('div'); line.style.fontSize = '12px'; line.style.color = '#cbd5e1'; let text = ''; if (op.type === 'attack') { const ns2 = (function () { const s2 = { playerHands: [resultState.playerHands[0], resultState.playerHands[1]], aiHands: [resultState.aiHands[0], resultState.aiHands[1]] }; if (op.from === 'player') s2.aiHands[op.aiIndex] = (s2.playerHands[op.playerIndex] + s2.aiHands[op.aiIndex]) % 5; else s2.playerHands[op.playerIndex] = (s2.aiHands[op.aiIndex] + s2.playerHands[op.playerIndex]) % 5; return s2; })(); text = (opp === 'player') ? `P${op.playerIndex}->A${op.aiIndex} → ${formatState(ns2)}` : `A${op.aiIndex}->P${op.playerIndex} → ${formatState(ns2)}`; } else { const ns2 = (function () { const s2 = { playerHands: [resultState.playerHands[0], resultState.playerHands[1]], aiHands: [resultState.aiHands[0], resultState.aiHands[1]] }; if (op.owner === 'player') { s2.playerHands[0] = op.val0; s2.playerHands[1] = op.val1; } else { s2.aiHands[0] = op.val0; s2.aiHands[1] = op.val1; } return s2; })(); text = `Split ${op.val0}/${op.val1} → ${formatState(ns2)}`; } line.textContent = text; subList.appendChild(line); }); node.appendChild(subList);
					}
					btn.parentNode.insertBefore(node, btn.nextSibling);
				};
			}
			actionsListEl.appendChild(btn);
		});
	}

	// Refresh actions periodically
	actionsInterval = setInterval(renderActions, 600);
	renderActions();

	close.addEventListener('click', () => {
		document.body.removeChild(panel);
	});
}
