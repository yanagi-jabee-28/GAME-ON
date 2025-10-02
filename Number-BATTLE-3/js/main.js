// main.js - 初期化とイベントバインド
// このファイルはゲームの初期化、イベントの登録、ターン管理のオーケストレーションを担当します。
// 実際のゲーム状態は `game.js`、表示/アニメーションは `ui.js`、AI ロジックは `ai.js` に委譲します。
import * as Game from './game.js';
import * as AI from './ai.js';
import * as UI from './ui.js';

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
		checkWin: Game.checkWin
	};
}

/**
 * initGame
 * ゲームを初期化し、UI を初期表示に整える。
 *  - ゲーム状態をリセット
 *  - DOM キャッシュ/描画を初期化
 *  - ボタン表示を切り替え
 */
function initGame() {
	Game.initState(); // ゲーム状態をリセット
	UI.cacheDom(); // DOM 要素をキャッシュして性能向上
	UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands, canUndo: Game.canUndo }); // 初期盤面表示
	UI.updateMessage('あなたの番です。攻撃する手を選んでください。'); // プレイヤーへ案内
	// Show/Hide buttons - 初期は restart を隠し、split を表示
	document.getElementById('restart-btn').classList.add('hidden'); // 行末コメント: restart 非表示
	document.getElementById('split-btn').classList.remove('hidden'); // 行末コメント: split 表示
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
		if (res.playerLost) {
			UI.updateMessage('あなたの負けです...'); // プレイヤー敗北メッセージ
		} else {
			UI.updateMessage('あなたの勝ちです！🎉'); // プレイヤー勝利メッセージ
		}
		// 終了状態なので操作要素を切る
		document.getElementById('split-btn').classList.add('hidden'); // split を無効化
		document.getElementById('restart-btn').classList.remove('hidden'); // restart を表示
		return true; // ゲーム終了
	}
	return false; // ゲーム継続
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
				UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands }); // 表示更新
				if (applyPostWinEffects()) return; // 勝敗が出ればここで処理終了
				Game.switchTurnTo('ai'); // ターンを CPU に移す
				// call AI turn after a short delay (0.5s) to leave a pause after player's attack animation
				setTimeout(() => {
					AI.aiTurnWrapper(getStateAccessor)
						.then(() => {
							UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands }); // AI の行動後に再描画
							applyPostWinEffects(); // AI の行動で勝敗が決まっていれば反映
						});
				}, 500); // 500ms の遅延（行動コメント: CPU 行動に入るまでのポーズ）
			});
		}
	});

	// Split button - 分割操作のハンドリング
	document.getElementById('split-btn').addEventListener('click', () => {
		UI.openSplitModal({ playerHands: Game.playerHands, aiHands: Game.aiHands, currentPlayer: Game.currentPlayer, gameOver: Game.gameOver }, (val0, val1) => {
			// Animate split first, then apply split and update UI
			UI.performPlayerSplitAnim(val0, val1, () => {
				Game.applySplit('player', val0, val1); // ゲーム状態に分割を反映
				UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands }); // 表示更新
				if (applyPostWinEffects()) return; // 勝敗判定がある場合は終了
				Game.switchTurnTo('ai'); // CPU ターンへ
				// delay AI action slightly so player can see split result
				setTimeout(() => {
					AI.aiTurnWrapper(getStateAccessor)
						.then(() => {
							UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands }); // AI 後の再描画
							applyPostWinEffects(); // 勝敗反映
						});
				}, 500); // 500ms の遅延（行動コメント: 分割後の視認性確保）
			});
		});
	});

	// Undo button
	document.getElementById('undo-btn').addEventListener('click', () => {
		if (Game.canUndo && Game.canUndo()) {
			const ok = Game.undoLastMove();
			if (ok) {
				UI.updateDisplay({ playerHands: Game.playerHands, aiHands: Game.aiHands, canUndo: Game.canUndo });
				UI.updateMessage('一手戻しました。');
			}
		}
	});

	// Restart - 再スタートボタンの処理
	document.getElementById('restart-btn').addEventListener('click', () => {
		initGame(); // ゲームを初期化して最初から開始
	});
}

window.addEventListener('DOMContentLoaded', () => {
	UI.cacheDom();
	setupEventDelegation();
	initGame();
});

export { initGame };
