/**
 * @file config.js
 * @brief スロットゲームの動作に関わる全ての設定を管理します。
 * @details このファイルの値は、script.jsから参照されます。
 *          ゲームの見た目や挙動、確率などを変更したい場合は、まずこのファイルを確認・編集してください。
 */

import reelSoundUrl from "../assets/リール.mp3?url";
import buttonSoundUrl from "../assets/ボタン.mp3?url";
import winSoundUrl from "../assets/ペカリ.mp3?url";


// ゲーム全体の設定を管理するオブジェクト
const gameConfig = {
	// --- DOM要素のセレクタ ---
	// 備考: HTMLに記述された要素のidやclassを変更した場合は、ここの値を修正する必要があります。
	//       script.js側での変更は不要です。
	selectors: {
		slotMachine: "#slot-machine", // スロットマシン本体のコンテナdiv
		actionBtn: "#actionBtn", // 「スタート/ストップ」ボタン
		modeBtn: "#modeBtn", // 「モード切替」ボタン
	},

	// --- ゲームの基本設定 ---
	reelCount: 3, // リールの本数。3以外に変更する場合は、リールごとの設定(reelsDataなど)も本数に合わせて調整が必要です。
	symbolHeight: 120, // 1シンボルあたりの高さ(px)。style.cssの`.reel-symbol`の`height`と一致させる必要があります。
	// UI全体の倍率（1 = 基本サイズ）。これを変えるとスロット本体の大きさを一括で調整できます。
	// 例: 1.2 は 120% サイズ、0.8 は 80% サイズ
	uiScale: 1,
	symbolDuplicationFactor: 2, // 無限スクロールを滑らかに見せるため、リール内のシンボルを何周分複製するか。値を大きくするとメモリ使用量が増えます。

	// --- リールのシンボル構成 ---
	// 注意: 各リールに表示されるシンボルの配列です。
	//       シンボルの並び順や数を変更すると、リールの見た目や挙動、確率計算に直接影響します。
	//       特に、狙い撃ち機能(`stopTargets`)でインデックス指定をする際は、この配列の並び順が基準となります。
	reelsData: [
		[
			"🍌",
			"🍋",
			"🍎",
			"🍌",
			"🍋",
			"💎",
			"🍉",
			"🍌",
			"🍋",
			"BAR",
			"🍒",
			"🍎",
			"🍌",
			"🍋",
			"🍉",
			"🍌",
			"🍋",
			"7️⃣",
			"🍇",
			"7️⃣",
			"🍇",
		], // 左リール (インデックス 0)
		[
			"🍌",
			"🍒",
			"🍋",
			"🍌",
			"🍎",
			"💎",
			"🍉",
			"🍋",
			"🍌",
			"🍒",
			"BAR",
			"🍒",
			"🍋",
			"🍌",
			"🍉",
			"🍋",
			"🍌",
			"🍇",
			"7️⃣",
			"🍇",
			"🍋",
		], // 中央リール (インデックス 1)
		[
			"🍋",
			"🍎",
			"🍌",
			"🍋",
			"🍉",
			"💎",
			"🍌",
			"🍋",
			"🍒",
			"BAR",
			"🍌",
			"🍋",
			"🍉",
			"🍎",
			"🍌",
			"🍋",
			"🍇",
			"7️⃣",
			"🍇",
			"7️⃣",
			"🍌",
		], // 右リール (インデックス 2)
	],

	// ========================================
	// 【シンボル設定】絵柄の出現確率と配当
	// ========================================
	// 備考: すべてのシンボルの出現確率と配当倍率を一箇所で管理します。
	//       重みが小さいほど → レアで高配当
	//       重みが大きいほど → よく出るが低配当
	// 
	// 💡 配当倍率の計算:
	//    - 🍋(weight:100) を基準（1倍）として自動計算されます
	//    - 例: 7️⃣(weight:1) = 100倍、BAR(weight:10) = 10倍
	// 
	// 💡 出現確率:
	//    - 当たり時: この重みで絵柄が選ばれます
	//    - ハズレ時: この重みでリールの停止位置が決まります
	// 
	// 💡 使い方:
	//    - ジャックポット的な絵柄: weight を 1 に（最もレア・100倍配当）
	//    - よく出る低配当絵柄: weight を 100 に（基準・1倍配当）
	winSymbolWeights: {
		"7️⃣": 1,      // 最もレア → 100倍配当
		"🍇": 5,       // かなりレア → 20倍配当
		"BAR": 10,     // レア → 10倍配当
		"💎": 15,      // やや高配当 → 約6-7倍
		"🍉": 20,      // 中配当 → 5倍
		"🍎": 25,      // 中配当 → 4倍
		"🍒": 35,      // やや低配当 → 約3倍
		"🍌": 50,      // 低配当 → 2倍
		"🍋": 100,     // 最もよく出る → 1倍配当（基準）
	},

	// --- ゲーム開始時の状態 ---
	initialReelPositions: [17, 17, 17], // 各リールの初期表示シンボルのインデックス番号。
	initialIsAutoMode: true, // 初期モード。trueなら「自動」、falseなら「目押し」。

	// --- アニメーションと速度設定 ---
	autoSpeed: 50, // 自動モード時のリール回転速度 (px/フレーム)。大きいほど速い。
	manualSpeed: 37.5, // 目押しモード時のリール回転速度 (px/フレーム)。
	accelerationTime: 250, // スピン開始から最高速に達するまでの時間 (ミリ秒)。
	minStopAnimTime: 200, // 停止ボタンを押してから実際に停止するまでの最低アニメーション時間 (ミリ秒)。
	maxStopAnimTime: 500, // 停止ボタンを押してから実際に停止するまでの最大アニメーション時間 (ミリ秒)。
	reverseRotation: true, // リールの回転方向。true: 下から上へ, false: 上から下へ。
	stopEasing: "cubic", // 停止時の減速アニメーションの種類。'cubic', 'quad', 'sine', 'linear'から選択。
	stopBaseDurationMs: 240, // 自動停止時の減速にかかる基本時間 (ミリ秒)。

	// --- 自動モード設定 (新方式) ---
	// 備考: 左リールが停止してから、全リールが停止するまでの時間を制御します。
	//       複雑な計算式がコメントにありましたが、より直感的に理解できるよう整理しました。
	//       (reelCount - 1) * minSequentialStopGapMs <= autoStopMaxTime - autoStopMinTime を満たす必要があります。
	autoStopMinTime: 1000, // スピン開始から最初の(左)リールが停止し始めるまでの最短時間 (ミリ秒)。
	autoStopMaxTime: 1500, // スピン開始から最後の(右)リールが完全に停止するまでの最長時間 (ミリ秒)。
	minSequentialStopGapMs: 100, // 各リールが停止し始める間の最低時間 (ミリ秒)。リール間の停止タイミングを制御します。

	/* --- (旧方式: 現在は不使用・互換維持のための参考) ---
	 * かつては各リールの停止時刻を明示的に配列で与えていました。
	 * 現行は min/max の範囲から均等ベース+ジッターで算出するため、この2設定は使用していません。
	 * 復活させる場合は script.js の startGame 内の該当ブロックも復旧し、
	 * minSequentialStopGapMs を下回らないように調整する必要があります。
	 *
	 * 例:
	 * // autoStopTimings: [1800, 2400, 3000], // 各リールの自動停止タイミング (ms)
	 * // autoStopTimeRandomness: 300,         // 自動停止タイミングのランダム揺らぎ (ms)
	 */

	// --- 狙い撃ち停止設定 (自動モード時) ---
	// 用途: 特定の絵柄を特定の位置に意図的に停止させたい場合に使用します。(デバッグや演出目的)
	//      この設定は `targetActivationProbability` が 1 に近いほど優先されます。
	// 例: 中央リール(index:1)に'7️⃣'を、上段('top')に停止させる場合: { reelIndex: 1, symbol: '7️⃣', position: 'top' }
	stopTargets: [
		// { reelIndex: 1, symbol: '7️⃣' },
		// { reelIndex: 0, symbol: '7️⃣' },
		// { reelIndex: 2, symbol: '7️⃣' },
	],

	// `stopTargets`の設定を有効にする確率 (0.0 ~ 1.0)。
	// 1.0にすると常に狙い撃ちを試みます。開発中のテストに便利です。
	targetActivationProbability: 0,

	// --- 当たり演出制御 ---
	// ========================================
	// 【簡単設定】当たり確率を直感的に設定
	// ========================================
	// 全体の当たり確率（0.0 ~ 1.0）
	// 例: 0.1 = 10%で当たり、0.5 = 50%で当たり、1.0 = 100%必ず当たり
	// 
	// 💡 設定例:
	//    winProbability: 0.2   → 20%の確率で当たり（通常のスロット）
	//    winProbability: 0.5   → 50%の確率で当たり（当たりやすい）
	//    winProbability: 1.0   → 100%必ず当たり（現在の設定・テスト用）
	winProbability: 0.5,
	
	// 当たりの種類の割合（合計が1.0になるように設定）
	// 水平ラインと斜めラインの比率を指定します
	// 
	// 💡 設定例:
	//    { horizontal: 1.0, diagonal: 0.0 } → 水平ラインのみ（現在の設定）
	//    { horizontal: 0.7, diagonal: 0.3 } → 水平70%、斜め30%
	//    { horizontal: 0.5, diagonal: 0.5 } → 水平と斜め半々
	//    { horizontal: 0.0, diagonal: 1.0 } → 斜めラインのみ
	winTypeRatio: {
		horizontal: 0.5, // 水平ラインの割合
		diagonal: 0.5,   // 斜めラインの割合
	},

	// ========================================
	// 【詳細設定】以下は自動計算されます
	// ========================================
	// 備考: winProbability と winTypeRatio から自動的に計算されるため、
	//       以下の値は手動で変更しないでください。
	//       変更しても、起動時に上書きされます。
	// winHorizontalProbability: (自動計算: winProbability * winTypeRatio.horizontal)
	// winDiagonalProbability:   (自動計算: winProbability * winTypeRatio.diagonal)
	// twinDiagonalProbability:  (自動計算: winProbability * winTypeRatio.diagonal)

	// 当たりを揃えるライン。'top', 'middle', 'bottom', 'random' から選択。
	winRowMode: "random" as "top" | "middle" | "bottom" | "random",
	// 斜め当たりの方向。'down'(右下がり), 'up'(右上がり), 'random' から選択。
	winDiagonalMode: "random" as "down" | "up" | "random",

	// --- デバッグ設定 ---
	// 備考: 開発中にブラウザのコンソールにログを出力するための設定です。
	//       `true`にすると、ゲームの内部的な動作を確認できますが、パフォーマンスに影響する場合があります。
	debug: {
		stopLogs: false, // trueにすると停止計算の詳細ログを出力。開発・検証時のみ推奨。
		frameLogs: false, // trueにするとフレームごとのログを大量出力。実運用では必ずfalseのままにしてください。
	},

	// 開発者パネルを初期化するかどうか（true: 有効, false: 無効）
	devPanelEnabled: false,

	// --- ファイナンス設定 ---
	// デフォルトのプレイヤー残高（ローカル開始時の初期値）
	initialBalance: 1000,
	// 賭け金の最小値
	minBet: 1,
	// 賭け金の上限値
	maxBet: 100000, // 適切な上限に設定してください

	// --- サウンド設定 ---
	// file: 相対パスを指定すると外部ファイルを読み込みます。未指定時は簡易合成音を使用します。
	sounds: {
		enabled: true,
		volume: 0.2, // マスター音量 0.0 - 1.0
		// 種別ごとの相対音量(マスター×各値) 0.0 - 1.0
		volumes: {
			spinStart: 1.0,
			reelStop: 0.5, // 既定で半分(ご要望反映)
			win: 1.0,
		},
		files: {
			spinStart: reelSoundUrl, // リール回転開始の音
			reelStop: buttonSoundUrl, // リール停止時の音
			win: winSoundUrl, // 当たり時の音
		},
	},

	// --- 借金(クレジット)設定 ---
	// enabled: 借金機能を有効にするか
	// creditLimit: プレイヤーが最大で借りられる金額（利息前の元本）
	// interestRate: 借入時に即時適用する利率（例: 0.1 = 10%）。利息モデルは単純化して即時一括で計上します。
	credit: {
		enabled: true,
		creditLimit: 50000,
		interestRate: 0.1,
	},
	// 簡易ペイアウトテーブル: key はシンボルあるいはシンボル種別
	// 値は賭け金に対する倍率（例: 10 倍なら return bet * 10）
	// payoutTable は下部で winSymbolWeights から自動生成します（🍋 を 1x に正規化）
	payoutTable: {},

	// --- Extensions for Pachinko adapter (optional) ---
	// pachinko 側のスロット連携で参照される追加設定。未設定でも動作に影響しない。
	// rewards: 連携時の表示テンプレートや倍率など。
	// slotAudio: pachinko からスロット音量を上書きするための設定。
	rewards: {
		// スロット勝利時に pachinko の弾やメッセージへ反映するための倍率
		slotWinAmmoMultiplier: 1,
		// メッセージテンプレート。{amount}, {mult}, {adjusted} 置換に対応
		slotWinMessageTemplate: "",
	},
	slotAudio: {
		masterVolume: 0.8,
		volumes: {
			spinStart: 1.0,
			reelStop: 0.5,
			win: 1.0,
		},
	},
};

/* ------------------------------------------------------------------
 * 以下: 簡単設定から詳細設定への自動計算
 * winProbability と winTypeRatio から、実際の確率値を計算します。
 * ------------------------------------------------------------------ */
(function computeWinProbabilities() {
	const totalProb = gameConfig.winProbability || 0;
	const ratio = gameConfig.winTypeRatio || { horizontal: 1, diagonal: 0 };
	const total = (ratio.horizontal || 0) + (ratio.diagonal || 0);
	
	// 比率の合計が0の場合は警告を出してデフォルト値を使用
	if (total === 0) {
		console.warn('[SlotConfig] winTypeRatio の合計が0です。デフォルト値（水平100%）を使用します。');
		(gameConfig as any).winHorizontalProbability = totalProb;
		(gameConfig as any).winDiagonalProbability = 0;
		(gameConfig as any).twinDiagonalProbability = 0;
		return;
	}
	
	// 正規化した比率を使って確率を計算
	const horizRatio = (ratio.horizontal || 0) / total;
	const diagRatio = (ratio.diagonal || 0) / total;
	
	(gameConfig as any).winHorizontalProbability = totalProb * horizRatio;
	(gameConfig as any).winDiagonalProbability = totalProb * diagRatio;
	(gameConfig as any).twinDiagonalProbability = totalProb * diagRatio;
	
	// 計算結果をコンソールに表示（設定確認用）
	console.log('[SlotConfig] 🎰 当たり確率設定:');
	console.log(`  📊 全体の当たり確率: ${(totalProb * 100).toFixed(1)}%`);
	console.log(`  ➡️  水平ライン: ${((gameConfig as any).winHorizontalProbability * 100).toFixed(1)}%`);
	console.log(`  ↘️  斜めライン: ${((gameConfig as any).winDiagonalProbability * 100).toFixed(1)}%`);
})();

/* ------------------------------------------------------------------
 * 以下: winSymbolWeights の逆数比から payoutTable を計算して
 *       `gameConfig.payoutTable` に代入します。
 *       ルール: payout[symbol] = round( weight["🍋"] / weight[symbol] )
 *       ただし最低 1 を下回らないようにします。
 *
 * 重要: script.js を変更せず、ここで一元的に配当を決めるための処理です。
 * ------------------------------------------------------------------ */
(function computePayoutTableFromWeights() {
	const weights = gameConfig.winSymbolWeights || {};
	const lemonKey = "🍋" as const;
	const lemonWeight = weights[lemonKey] || 1;
	const table: Record<string, number> = {};
	Object.keys(weights).forEach((sym) => {
		// 比率の逆数(レモンを基準に)
		const raw = lemonWeight / (weights[sym as keyof typeof weights] || 1);
		// 四捨五入して整数倍にする。最低 1 を保証。
		const mult = Math.max(1, Math.round(raw));
		table[sym] = mult;
	});
	(gameConfig as { payoutTable: Record<string, number> }).payoutTable = table;
})();

export { gameConfig };
