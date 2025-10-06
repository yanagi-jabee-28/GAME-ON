// main.js - 初期化とイベントバインド
// このファイルはゲームの初期化、イベントの登録、ターン管理のオーケストレーションを担当します。
// 実際のゲーム状態は `game.js`、表示/アニメーションは `ui.js`、AI ロジックは `ai.js` に委譲します。
import * as Game from './game.js';
import * as AI from './ai.js';
import * as UI from './ui.js';
import { initDebug } from './debug.js';
import CONFIG from './config.js';

/**
 * getStateAccessor
 * ゲーム状態を読み取るためのアクセサ（現在はスナップショットを返す）。
 * 外部モジュールへ渡す際に、直接 Game の参照を渡さずこの関数を使うことで
 * 依存関係を明示的にできます（将来的に getter に変更しやすくするため）。
 */
function getStateAccessor() {
	// 軽量なスナップショットを返す。必要なのは配列と checkWin の参照のみ。
	return {
		playerHands: Game.playerHands,
		aiHands: Game.aiHands,
		currentPlayer: Game.currentPlayer,
		gameOver: Game.gameOver,
		checkWin: Game.checkWin,
		selectedHand: Game.selectedHand
	};
}

function buildDisplayState() {
	return {
		playerHands: Game.playerHands,
		aiHands: Game.aiHands,
		canUndo: Game.canUndo,
		gameOver: Game.gameOver,
		moveCount: Game.getMoveCount?.()
	};
}

function renderBoard() {
	UI.updateDisplay(buildDisplayState());
}

function setTurnMessage() {
	if (Game.gameOver) {
		UI.clearPlayerHints();
		return;
	}

	const hintsEnabled = CONFIG.SHOW_HINT_CONTROLS ? (document.getElementById('toggle-hints-cb')?.checked) : false;
	const hintMode = CONFIG.SHOW_HINT_CONTROLS ? (document.getElementById('hint-mode-select')?.value || 'full') : 'full';

	if (Game.currentPlayer === 'player') {
		UI.updateMessage('あなたの番です。攻撃する手を選んでください。');
		if (hintsEnabled) {
			const analysis = AI.getPlayerMovesAnalysis(getStateAccessor());
			UI.displayPlayerHints(analysis, hintMode, Game.selectedHand);
		} else {
			UI.clearPlayerHints();
		}
	} else {
		const aiManual = CONFIG.SHOW_AI_MANUAL_TOGGLE && document.getElementById('toggle-ai-control-cb')?.checked;
		if (aiManual) {
			UI.updateMessage('AI手動操作モード: CPUの手をクリックして操作してください。');
		} else {
			UI.updateMessage('CPU の番です。しばらくお待ちください...');
		}
		UI.clearPlayerHints();
		// Also remove any action/border highlights that may remain from player's full-hint view
		try { UI.clearActionHighlights(); } catch (e) { /* ignore */ }
	}
}

/**
 * initGame
 * ゲームを初期化し、UI を初期表示に整える。
 *  - ゲーム状態をリセット
 *  - DOM キャッシュ/描画を初期化
 *  - ボタン表示を切り替え
 */
function initGame() {
	// Read starter selection from the DOM (default to 'player' when not present)
	UI.cacheDom(); // Ensure DOM cached
	const starterSelect = document.getElementById('starter-select');
	const starter = (starterSelect && starterSelect.value === 'ai') ? 'ai' : 'player';
	Game.initState(starter); // ゲーム状態をリセットし先攻を設定
	renderBoard(); // 初期盤面表示
	setTurnMessage(); // プレイヤーへ案内
	// Show/Hide buttons - 初期は restart を隠し、split を表示
	// restart ボタンは常に表示するため、ここでは制御しない
	document.getElementById('split-btn').classList.remove('hidden'); // 行末コメント: split 表示

	// If AI is set to start, immediately perform AI turn after a short delay
	if (starter === 'ai' && !Game.gameOver) scheduleAiTurn(300);
}

/**
 * applyPostWinEffects
 * 勝利/敗北が発生しているか判定し、UI にその結果を反映する。
 * 戦闘終了時は split ボタンを隠し、restart を表示する。
 * 戻り値: ゲームが終了している場合は true を返す（呼び出し元で追加処理を中断できるようにするため）。
 */
function applyPostWinEffects() {
	const res = Game.checkWin(); // 勝敗判定
	if (res.gameOver) {
		UI.clearPlayerHints();
		if (res.playerLost) {
			UI.updateMessage('あなたの負けです...'); // プレイヤー敗北メッセージ
		} else {
			UI.updateMessage('あなたの勝ちです！🎉'); // プレイヤー勝利メッセージ
		}
		// 終了状態なので操作要素を切る
		// 終了状態なので操作要素を切る（restart は常時表示）
		document.getElementById('split-btn').classList.add('hidden'); // split を無効化
		return true; // ゲーム終了
	}
	return false; // ゲーム継続
}

function scheduleAiTurn(delay = 500) {
	const runAi = () => {
		if (CONFIG.SHOW_AI_MANUAL_TOGGLE && document.getElementById('toggle-ai-control-cb')?.checked) {
			UI.updateMessage('AI手動操作モード: CPUの手をクリックして操作してください。');
			return;
		}
		UI.updateMessage('CPU の番です。しばらくお待ちください...');
		AI.aiTurnWrapper(getStateAccessor)
			.then(() => {
				renderBoard();
				if (!applyPostWinEffects()) setTurnMessage();
			});
	};

	if (delay > 0) {
		setTimeout(runAi, delay);
	} else {
		runAi();
	}
}

/**
 * setupEventDelegation
 *  - ゲーム盤（#game-container）内のクリックを一括でハンドリングする
 *  - data 属性を用いてどの手（player/ai, index）がクリックされたかを判定する
 *  - 選択・キャンセル・攻撃・分割・再スタートをここで受け付ける
 */
function setupEventDelegation() {
	// Hands click via delegation - ゲーム領域でクリックを受け取り、最も近い [data-hand] 要素を探す
	document.getElementById('game-container').addEventListener('click', (e) => {
		const target = e.target.closest('[data-hand]'); // クリックされた手の DOM 要素
		if (!target) return; // 手以外のクリックは無視
		const owner = target.dataset.owner; // 'player' または 'ai'
		const index = Number(target.dataset.index); // 手のインデックス（数値）
		// If player's turn, handle selection/attack
		if (Game.gameOver || Game.currentPlayer !== 'player') return; // ゲームオーバーか CPU ターンなら無視

		// 選択していない状態: 自分の手を選ぶと selected に入る
		if (Game.selectedHand.owner === null) {
			if (owner === 'player' && Game.playerHands[index] > 0) {
				Game.setSelectedHand(owner, index); // 選択を game モジュールに通知
				target.classList.add('selected'); // 見た目の選択表示
				UI.updateMessage('相手の手を選んで攻撃してください。'); // ガイド表示
				// refresh hints/highlights for this selection
				const analysis = AI.getPlayerMovesAnalysis(getStateAccessor());
				UI.displayPlayerHints(analysis, document.getElementById('hint-mode-select')?.value || 'full', Game.selectedHand);
			}
			// 同じ手を再クリックした場合は選択をキャンセル
		} else if (Game.selectedHand.owner === 'player' && owner === 'player' && Game.selectedHand.index === index) {
			// cancel selection: remove selected class from previously selected element
			const prevIndex = Game.selectedHand.index; // 選択中の手のインデックス
			if (prevIndex !== null && prevIndex !== undefined) {
				const prevEl = document.getElementById(`player-hand-${prevIndex}`);
				if (prevEl) prevEl.classList.remove('selected'); // 見た目をクリア
			}
			Game.setSelectedHand(null, null); // 選択解除
			UI.updateMessage('あなたの番です。攻撃する手を選んでください。'); // 案内に戻す
			// clear any per-action highlights when selection cancelled
			UI.clearActionHighlights();
			// If the player had selected one hand and clicks the other hand, switch selection immediately
		} else if (Game.selectedHand.owner === 'player' && owner === 'player' && Game.selectedHand.index !== index) {
			const prevIndex = Game.selectedHand.index;
			if (prevIndex !== null && prevIndex !== undefined) {
				const prevEl = document.getElementById(`player-hand-${prevIndex}`);
				if (prevEl) prevEl.classList.remove('selected');
			}
			if (Game.playerHands[index] > 0) {
				Game.setSelectedHand('player', index);
				const newEl = document.getElementById(`player-hand-${index}`);
				if (newEl) newEl.classList.add('selected');
				UI.updateMessage('相手の手を選んで攻撃してください。');
				// refresh hints/highlights for this new selection
				const analysis2 = AI.getPlayerMovesAnalysis(getStateAccessor());
				UI.displayPlayerHints(analysis2, document.getElementById('hint-mode-select')?.value || 'full', Game.selectedHand);
			}
			// プレイヤーが選択済みで、相手（AI）の手をクリックした場合: 攻撃を実行
		} else if (Game.selectedHand.owner === 'player' && owner === 'ai') {
			if (Game.aiHands[index] === 0) return; // 相手の手が 0 の場合は攻撃不可
			// capture attacker index
			const attackerIndex = Game.selectedHand.index; // 攻撃手のインデックス
			// UX: 選択表示はすぐ外す
			if (attackerIndex !== null && attackerIndex !== undefined) {
				const prevEl = document.getElementById(`player-hand-${attackerIndex}`);
				if (prevEl) prevEl.classList.remove('selected'); // 行末コメント: 選択クラスを消す
			}
			Game.setSelectedHand(null, null); // 内部選択状態をリセット
			// animate first, then apply attack and update UI
			UI.performPlayerAttackAnim(attackerIndex, index, () => {
				// apply attack after animation
				Game.applyAttack('player', attackerIndex, 'ai', index); // 実際の数値変更を game モジュールに委譲
				renderBoard(); // 表示更新
				if (applyPostWinEffects()) return; // 勝敗が出ればここで処理終了
				Game.switchTurnTo('ai'); // ターンを CPU に移す
				setTurnMessage();
				// call AI turn after a short delay (0.5s) to leave a pause after player's attack animation
				scheduleAiTurn(500); // 500ms の遅延（行動コメント: CPU 行動に入るまでのポーズ）
			});
		}
	});

	// Split button - 分割操作のハンドリング
	document.getElementById('split-btn').addEventListener('click', () => {
		// compute analysis so we can color split options (if tablebase loaded and full hints enabled)
		const hintsEnabled = CONFIG.SHOW_HINT_CONTROLS ? (document.getElementById('toggle-hints-cb')?.checked) : false;
		const hintMode = CONFIG.SHOW_HINT_CONTROLS ? (document.getElementById('hint-mode-select')?.value || 'full') : 'full';
		let splitAnalysis = null;
		if (hintsEnabled && hintMode === 'full') {
			splitAnalysis = AI.getPlayerMovesAnalysis(getStateAccessor());
		}
		UI.openSplitModal({ playerHands: Game.playerHands, aiHands: Game.aiHands, currentPlayer: Game.currentPlayer, gameOver: Game.gameOver }, splitAnalysis, (val0, val1) => {
			// Animate split first, then apply split and update UI
			UI.performPlayerSplitAnim(val0, val1, () => {
				Game.applySplit('player', val0, val1); // ゲーム状態に分割を反映
				renderBoard(); // 表示更新
				if (applyPostWinEffects()) return; // 勝敗判定がある場合は終了
				Game.switchTurnTo('ai'); // CPU ターンへ
				setTurnMessage();
				// delay AI action slightly so player can see split result
				scheduleAiTurn(500); // 500ms の遅延（行動コメント: 分割後の視認性確保）
			});
		});
	});

	// Undo button
	document.getElementById('undo-btn').addEventListener('click', () => {
		if (Game.canUndo && Game.canUndo()) {
			// try to undo up to two steps (2手戻し)
			let undone = 0;
			for (let i = 0; i < 2; i++) {
				if (Game.canUndo && Game.canUndo()) {
					const ok = Game.undoLastMove();
					if (ok) undone++;
				}
			}
			renderBoard();
			// After undo, ensure CPU turn is skipped: force player's turn if game not over
			if (!Game.gameOver) {
				Game.switchTurnTo('player');
				setTurnMessage();
			}
			if (undone >= 2) UI.updateMessage('2手戻しました。');
			else if (undone === 1) UI.updateMessage('一手戻しました。');
			else UI.updateMessage('戻せる手がありません。');
		}
	});

	// ヒント切り替えチェックボックス
	const hintToggle = document.getElementById('toggle-hints-cb');
	if (hintToggle) {
		// updateHints はヒント表示状態を再評価するための共通処理
		const updateHints = () => setTurnMessage();

		// 'input' はチェックボックスの状態変化に最も素早く反応します。
		hintToggle.addEventListener('input', () => setTimeout(updateHints, 0));
		// 互換性のため change も残す
		hintToggle.addEventListener('change', () => setTimeout(updateHints, 0));

		// モバイルでタッチ系のイベントが優先される環境に備え、pointerup と touchend を補助的に追加
		hintToggle.addEventListener('pointerup', () => setTimeout(updateHints, 0));
		hintToggle.addEventListener('touchend', () => setTimeout(updateHints, 0));

		// click も補助
		hintToggle.addEventListener('click', () => setTimeout(updateHints, 0));

		// ラベルが触られた場合に input の状態が変わることがあるので、ラベルも監視。
		const hintLabel = document.querySelector('label[for="toggle-hints-cb"]');
		if (hintLabel) {
			// ラベルクリックでは input の checked がまだ更新されていないタイミングがあるため
			// 次のイベントループで再評価する
			hintLabel.addEventListener('click', () => setTimeout(updateHints, 0));
			// タッチイベントも追加
			hintLabel.addEventListener('touchend', () => setTimeout(updateHints, 0));
		}

		// ヒントモード切替
		const hintModeSelect = document.getElementById('hint-mode-select');
		if (hintModeSelect) {
			hintModeSelect.addEventListener('change', () => {
				setTurnMessage();
			});
		}
	}

	// Restart - 再スタートボタンの処理
	document.getElementById('restart-btn').addEventListener('click', () => {
		initGame(); // ゲームを初期化して最初から開始
	});
}

window.addEventListener('DOMContentLoaded', () => {
	UI.cacheDom();

	try { console.info('main DOMContentLoaded, CONFIG:', CONFIG); } catch (e) { }

	// Apply feature toggles to UI visibility immediately
	try {
		// Hints: hide both the toggle checkbox, its label and the mode select. Also clear any existing hint text.
		if (!CONFIG.SHOW_HINT_CONTROLS) {
			const hintCheckbox = document.getElementById('toggle-hints-cb');
			if (hintCheckbox) hintCheckbox.classList.add('hidden');
			const hintLabel = document.querySelector('label[for="toggle-hints-cb"]');
			if (hintLabel) hintLabel.classList.add('hidden');
			const hintMode = document.getElementById('hint-mode-select');
			if (hintMode) hintMode.classList.add('hidden');
			try { UI.clearPlayerHints(); } catch (e) { }
		}
		// AI manual toggle: hide the checkbox and its label when feature disabled
		if (!CONFIG.SHOW_AI_MANUAL_TOGGLE) {
			const aiCheckbox = document.getElementById('toggle-ai-control-cb');
			if (aiCheckbox) aiCheckbox.classList.add('hidden');
			const aiLabel = document.querySelector('label[for="toggle-ai-control-cb"]');
			if (aiLabel) aiLabel.classList.add('hidden');
		}
		// CPU strength: only hide the select itself (not its entire parent container)
		if (!CONFIG.SHOW_CPU_STRENGTH_SELECT) {
			const cpuSelect = document.getElementById('cpu-strength-select');
			if (cpuSelect) cpuSelect.classList.add('hidden');
		}
	} catch (e) { /* ignore */ }

	// Ensure CPU strength select reflects CONFIG (either forced or default) so AI reads the intended value
	try {
		const cpuSelect = document.getElementById('cpu-strength-select');
		if (cpuSelect) {
			const desired = CONFIG.FORCE_CPU_STRENGTH || CONFIG.DEFAULT_CPU_STRENGTH;
			if (desired) {
				// Only set when the option exists to avoid creating new options
				try { cpuSelect.value = desired; } catch (e) { /* ignore */ }
			}
		}
	} catch (e) { /* ignore */ }
	setupEventDelegation();
	initGame();

	// initialize debug utilities (will be no-op if debug module not desired)
	if (typeof initDebug === 'function') initDebug();

	// Ensure UI scales to fit the viewport on load
	if (typeof UI.fitUIToViewport === 'function') UI.fitUIToViewport();

	// Debounced resize handler to recompute scale on resize/orientation change
	let resizeTimer = null;
	const onResize = () => {
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (typeof UI.fitUIToViewport === 'function') UI.fitUIToViewport();
		}, 120);
	};
	window.addEventListener('resize', onResize);
	window.addEventListener('orientationchange', onResize);

	// When tablebase finishes loading, re-render hints immediately
	window.addEventListener('tablebase-loaded', () => {
		// Re-evaluate hints for current turn
		setTurnMessage();
	});

	// Debug utilities removed
});

export { initGame };
