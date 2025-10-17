/**
 * @file script.js
 * @brief スロットゲームの主要なロジックを管理するJavaScriptファイル。
 *        リールの生成、回転アニメーション、停止制御、ゲームモードの切り替えなどを担当します。
 */

import { SlotSoundManager } from "./audio.ts";
import { gameConfig } from "./config.ts";
import type {
	SlotCreditConfig,
	SlotGameConfig,
	SlotGameInstance,
	SlotReelConfig,
} from "./slot.d.ts";

// --- 共通ユーティリティ（純粋関数群） --------------------------------------
/** 数値を[min,max]にクランプ */
function clamp(v: number, min: number, max: number): number {
	return Math.min(Math.max(v, min), max);
}

/**
 * 設計概要 / アーキテクチャ
 * - 役割分担:
 *   - UIManager: DOM参照とUI更新（テキスト変更、transform適用）に限定。副作用の集中管理を行います。
 *   - SlotGame: ゲーム状態・アニメーション・制御ロジックを保持。DOM操作は UIManager 経由に限定します。
 * - 主要設定（抜粋）:
 *   - selectors: { slotMachine, actionBtn, modeBtn }
 *   - reelsData: string[][]（各リールのシンボル配列）。インデックス順は停止計算・演出の基準です。
 *   - symbolHeight: number（px）。CSSのシンボル高さと一致必須。
 *   - 自動停止: autoStopMinTime/autoStopMaxTime と minSequentialStopGapMs による等間隔+ジッター生成。
 *   - 当たり演出: 水平/斜めの別確率。揃えるシンボルは winSymbolWeights の加重抽選。
 * - 壊れやすいポイントと対処:
 *   1) CSS高さ不整合: symbolHeight と CSS の高さがズレると停止位置が半端になり、当たり/目押しが崩れます。
 *   2) セレクタ変更: HTML の id/class を変えたら config.selectors を必ず更新。null 参照に注意。
 *   3) reverseRotation: 停止計算の符号・正規化式が変わるため、変更時は実機確認を推奨します。
 *   4) reelsData順序: インデックス指定（symbolIndex）や演出位置に影響。テスト設定も合わせて見直し。
 *   5) 互換性: transform 取得は UIManager#getCurrentTranslateY を正典とし、重複実装を避けてください。
 */

/**
 * UI要素の管理とDOM操作を担当するクラス。
 * SlotGameクラスからUIに関する責務を分離し、コードの見通しと保守性を向上させます。
 */
type UIElementMap = {
	slotContainer?: HTMLElement | null;
	actionBtn?: HTMLButtonElement | null;
	modeBtn?: HTMLButtonElement | null;
	stopBtns?: (HTMLButtonElement | null)[];
} & Record<string, Element | Element[] | null | undefined>;

class UIManager {
	config: SlotGameConfig;
	elements: UIElementMap;
	/**
	 * UIManagerクラスのコンストラクタ。
	 * @param {SlotGameConfig} config - ゲームの設定オブジェクト
	 * 契約:
	 * - 入力: config.selectors の CSS セレクタに該当する要素が DOM 上に存在すること。
	 * - 副作用: DOM を探索し、主要要素を this.elements にキャッシュします。
	 * 注意: セレクタ変更時は HTML 側と必ず同期し、null 参照による TypeError を防止してください。
	 */
	constructor(config: SlotGameConfig) {
		this.config = config;
		this.elements = {}; // 取得したDOM要素を格納するオブジェクト
		this.getElements();
	}

	/**
	 * 近似: 現在の設定で「支払った掛け金より返ってくる確率」を計算します。
	 * 方法（簡易）:
	 * - 各ラインの配当倍率分布を作る（シンボルごとの一致確率と倍率から離散分布を生成）
	 * - 単純化のためライン間を独立と仮定して畳み込みを行い、合計配当がベットを超える確率を近似算出
	 * - forced（演出）は確率で1ラインを forced 配当に置換すると仮定して寄与を計算
	 */
	computeProbabilityReturnGreaterThanBet(bet: number): number {
		// このメソッドは SlotGame 側で実装されているため、UIManager からは既存の SlotGame インスタンスへ委譲します。
		// ブラウザ上で SlotGame インスタンスをグローバルに参照可能にしておけば、ここから呼び出せます。
		try {
			const Win = /** @type {any} */ (window);
			if (
				Win?.activeSlotGame &&
				typeof Win.activeSlotGame.computeProbabilityReturnGreaterThanBet ===
					"function"
			) {
				return Win.activeSlotGame.computeProbabilityReturnGreaterThanBet(bet);
			}
		} catch (_e) {
			// ignore and fallthrough
		}
		// フォールバック: 実装が見つからない場合は 0 を返す（安全なデフォルト）
		return 0;
	}

	/**
	 * 必要なDOM要素を取得し、内部プロパティに格納します。
	 */
	getElements() {
		// Be defensive: allow config.selectors to be missing when embedded. Fall back to common IDs.
		const sel = this.config?.selectors ? this.config.selectors : {};
		const slotCandidate =
			document.querySelector(sel.slotMachine || "#slot-machine") ||
			document.getElementById("slot-machine");
		this.elements.slotContainer =
			slotCandidate instanceof HTMLElement ? slotCandidate : null;
		const actionCandidate =
			document.querySelector(sel.actionBtn || "#actionBtn") ||
			document.getElementById("actionBtn");
		this.elements.actionBtn =
			actionCandidate instanceof HTMLButtonElement ? actionCandidate : null;
		const modeCandidate =
			document.querySelector(sel.modeBtn || "#modeBtn") ||
			document.getElementById("modeBtn");
		this.elements.modeBtn =
			modeCandidate instanceof HTMLButtonElement ? modeCandidate : null;
		// 目押し個別停止ボタン（存在しない場合は null のまま）
		this.elements.stopBtns = [
			document.getElementById("stopBtn0"),
			document.getElementById("stopBtn1"),
			document.getElementById("stopBtn2"),
		].map((btn) => (btn instanceof HTMLButtonElement ? btn : null));
	}

	/**
	 * スロットコンテナ内の全ての子要素をクリアします。
	 */
	clearSlotContainer() {
		if (this.elements.slotContainer) {
			this.elements.slotContainer.innerHTML = "";
		}
	}

	/**
	 * 新しいリール要素（div.reel）を作成します。
	 * @returns {HTMLElement} 作成されたリール要素
	 */
	createReelElement(): HTMLElement {
		const reelElement = document.createElement("div");
		reelElement.className = "reel";
		return reelElement;
	}

	/**
	 * シンボルを格納するコンテナ要素（div.symbols）を作成します。
	 * @returns {HTMLElement} 作成されたシンボルコンテナ要素
	 */
	createSymbolsElement(): HTMLElement {
		const symbolsElement = document.createElement("div");
		symbolsElement.className = "symbols";
		return symbolsElement;
	}

	/**
	 * 個々のシンボル要素（div.symbol）を作成します。
	 * @param {string} symbol - 表示するシンボルのテキスト
	 * @returns {HTMLElement} 作成されたシンボル要素
	 */
	createSymbolElement(symbol: string): HTMLElement {
		const symbolElement = document.createElement("div");
		symbolElement.className = "symbol";
		symbolElement.textContent = symbol;
		if (symbol === "BAR") {
			symbolElement.classList.add("bar");
		}
		return symbolElement;
	}

	/**
	 * リール要素をスロットコンテナに追加します。
	 * @param {HTMLElement} reelElement - 追加するリール要素
	 */
	appendReelToSlotContainer(reelElement: HTMLElement) {
		if (this.elements.slotContainer) {
			this.elements.slotContainer.appendChild(reelElement);
		}
	}

	/**
	 * 指定されたリール要素のY軸方向のtransformスタイルを設定します。
	 * @param {HTMLElement} element - スタイルを設定するリール要素
	 * @param {number} yPosition - 設定するY軸の位置（ピクセル単位）
	 */
	setReelTransform(element: HTMLElement, yPosition: number) {
		element.style.transform = `translateY(${yPosition}px)`;
	}

	/* 代替案について
	 * CSS クラス切替 + transition でも停止演出は可能ですが、1px 単位の滑らかな無限スクロールには
	 * 毎フレームの transform 更新が適しています（GPU アクセラレーションの恩恵あり）。
	 */

	/**
	 * アクションボタンのテキストを設定します。
	 * @param {string} text - 設定するテキスト
	 */
	setActionBtnText(text: string) {
		if (this.elements.actionBtn) {
			this.elements.actionBtn.textContent = text;
		}
	}

	/**
	 * デバッグ向け: メッセージを簡易表示する（存在すれば呼び出されることを想定）
	 * @param {string} msg
	 */
	displayMessage(msg: string) {
		// 実装は UI 上の toast 等で行われるが、存在することで checkJs の警告を避ける
		try {
			const t = document.getElementById("toast");
			if (t) t.textContent = msg;
		} catch (_e) {}
	}

	/**
	 * UIManager 用のシグネチャ整備: スロット側から呼ばれる updateBetConstraints を委譲可能にする
	 */
	updateBetConstraints() {
		try {
			if (this.elements?.slotContainer) {
				/* noop for typing */
			}
		} catch (_e) {}
	}

	/**
	 * アクションボタンのdisabledプロパティを設定します。
	 * @param {boolean} disabled - trueの場合ボタンを無効化、falseの場合有効化
	 */
	setActionBtnDisabled(disabled: boolean) {
		const btn = this.elements.actionBtn;
		if (btn) btn.disabled = disabled;
	}

	/**
	 * モードボタンのテキストを設定します。
	 * @param {string} text - 設定するテキスト
	 */
	setModeBtnText(text: string) {
		if (this.elements.modeBtn) {
			this.elements.modeBtn.textContent = text;
		}
	}

	/**
	 * 指定されたHTML要素の現在のY軸方向の`transform`変位量を取得します。
	 * `getComputedStyle`と`DOMMatrix`を使用して、正確なピクセル値を取得します。
	 * @param {HTMLElement} element - Y軸変位量を取得する対象のHTML要素
	 * @returns {number} Y軸の変位量 (ピクセル単位)。transformが設定されていない場合は0を返します。
	 */
	getCurrentTranslateY(element: HTMLElement): number {
		const style = window.getComputedStyle(element);
		const matrix = new DOMMatrix(style.transform);
		return matrix.m42;
	}
}

/**
 * SoundManager: WebAudio を使ってサウンドを管理します。
 * - 設定でファイルが指定されていれば fetch で読み込み再生
 * - 未指定時は簡易的な beep 合成で代替
 */
// 旧 SoundManager 実装は audio.js に分離しました。

/**
 * スロットゲーム全体を管理するクラス。
 * ゲームの状態、DOM要素、アニメーションロジックをカプセル化します。
 */
class SlotGame implements SlotGameInstance {
	config: SlotGameConfig;
	ui: UIManager;
	soundManager: SlotSoundManager;
	ROW_NAMES: string[];
	payoutTable: { [key: string]: number };
	slotContainer: HTMLElement | null | undefined;
	actionBtn: HTMLElement | null | undefined;
	modeBtn: HTMLElement | null | undefined;
	reels: SlotReelConfig[];
	isSpinning: boolean;
	isAutoMode: boolean;
	manualStopCount: number;
	balance: number;
	debt: number;
	creditConfig: SlotCreditConfig;
	_continuousDir: number | undefined;
	_continuousTimer: ReturnType<typeof setInterval> | null = null;
	_continuousStarter: ReturnType<typeof setTimeout> | null = null;
	_continuousInterval: number | undefined;
	_continuousStarted: boolean | undefined;
	elBet: HTMLInputElement | null = null;
	elAvailable: HTMLElement | null = null;
	elStepUp: HTMLElement | null = null;
	elStepDown: HTMLElement | null = null;
	_suppressNextClick: boolean = false;
	// 追加: 欠落していたプロパティ
	_toastTimer: ReturnType<typeof setTimeout> | null = null;
	leverEl: HTMLElement | null = null;
	_leverTimer: ReturnType<typeof setTimeout> | null = null;
	currentBet: number = 0;
	_winMsgTimer: ReturnType<typeof setTimeout> | null = null;
	/**
	 * SlotGameクラスのコンストラクタ。
	 * ゲームの初期設定とDOM要素の紐付けを行います。
	 * @param {HTMLElement} element - スロットマシンのコンテナとなるHTML要素（例: <div id="slot-machine">）
	 * @param {SlotGameConfig} config - ゲームの動作を定義する設定オブジェクト
	 * 契約:
	 * - 入力: element は現状未使用（将来の複数インスタンス・スコープ分離で利用予定）。
	 * - 出力: reels 配列やフラグ類を初期化し、DOM構築とイベント登録を完了します。
	 * 注意: selectors への依存が強いため、element ベースのクエリへ段階的に移行するとテスタビリティが向上します。
	 */
	constructor(_element: HTMLElement, config: SlotGameConfig) {
		this.config = config;
		this.ui = new UIManager(config); // UIManagerのインスタンスを生成

		// 共通定義（行の名前と行インデックスの対応）
		this.ROW_NAMES = ["top", "middle", "bottom"];

		// グローバル参照を設定して UIManager から委譲できるようにする
		try {
			const Win = /** @type {any} */ (window);
			Win.activeSlotGame = this;
		} catch (_e) {
			/* ignore */
		}
		// サウンドマネージャを初期化（設定に基づく）
		this.soundManager = new SlotSoundManager(this.config);

		// UIスケールを反映: CSSの --ui-scale を設定し、内部の symbolHeight をスケール
		const uiScale = Number(this.config.uiScale) || 1;
		try {
			document.documentElement.style.setProperty("--ui-scale", String(uiScale));
		} catch (_e) {
			// サーバサイド等で document が存在しない場合は無視
		}
		// 内部計算で使う symbolHeight をスケール（元の設定値は config.symbolHeight が基準）
		this.config.symbolHeight = Math.round(
			(this.config.symbolHeight || 120) * uiScale,
		);

		// --- ファイナンス状態 ---
		this.balance = Number(config.initialBalance) || 0; // プレイヤーの所持金
		// 借金状態: debt は利息を含めた現時点での返済総額を表す
		this.debt = 0;
		// credit に関する設定を保存
		this.creditConfig = config.credit
			? config.credit
			: { enabled: false, creditLimit: 0, interestRate: 0 };
		this.updateBalanceUI();
		// 初回の借金UIを更新
		this.updateDebtUI = this.updateDebtUI?.bind(this) || (() => {});
		this.updateDebtUI();

		// --- 配当テーブル: config.payoutTable を優先し、未指定なら winSymbolWeights から自動生成 ---
		if (
			this.config.payoutTable &&
			Object.keys(this.config.payoutTable).length > 0
		) {
			// 設定ファイルに明示的な配当表がある場合はそれをそのまま使用（管理者が意図した倍率を尊重）
			this.payoutTable = Object.assign({}, this.config.payoutTable);
		} else {
			// 自動生成フォールバック
			const weights = this.config.winSymbolWeights || {};
			const desiredMaxPayout = 50; // 最も稀なシンボルに与える倍率（調整可）
			this.payoutTable = {};
			const keys = Object.keys(weights);
			for (const sym of keys) {
				const w = weights[sym] || 1;
				const mult = Math.max(1, Math.round(desiredMaxPayout / w));
				this.payoutTable[sym] = mult;
			}
		}
		// レモンの倍率は config 側で設定するため、ここでは上書きしない

		// --- DOM要素の参照を保持 ---
		this.slotContainer = this.ui.elements.slotContainer; // スロットリールを格納するコンテナ
		this.actionBtn = this.ui.elements.actionBtn; // スタート/ストップボタン
		this.modeBtn = this.ui.elements.modeBtn; // モード切り替えボタン

		// --- ゲームの状態管理変数 ---
		this.reels = []; // 各リールのDOM要素、シンボルデータ、アニメーション状態を格納する配列
		this.isSpinning = false; // ゲーム全体が現在回転中であるかを示すフラグ (true: 回転中, false: 停止中)
		this.isAutoMode = config.initialIsAutoMode; // 現在のゲームモード (true: 自動停止モード, false: 目押しモード)
		this.manualStopCount = 0; // 目押しモード時に、プレイヤーが停止させたリールの数をカウント

		// ゲームの初期化処理を開始
		this.init();
	}

	// 長押しで賭け金を加速度的に増減するユーティリティ
	_startContinuousAdjust(dir: number): void {
		// dir: +1 or -1
		this._continuousDir = dir;
		// 既にスターターまたはタイマーがある場合は無視
		if (this._continuousTimer || this._continuousStarter) return;
		// 初期遅延 (ms) — 単押しと区別するためやや長めに設定
		const delay = 420;
		// 最小間隔 (ms) と減衰率（時間経過で間隔を短くする）
		const minInterval = 60;
		const accelFactor = 0.85;
		this._continuousInterval = 260;
		this._continuousStarted = false;
		// 遅延後に連続処理を開始（このタイミングで最初の適応ステップを実行）
		this._continuousStarter = setTimeout(() => {
			this._continuousStarted = true;
			// 最初の適応ステップ
			this._adjustBetByAdaptiveStep(dir);
			// 継続インターバル開始
			this._continuousTimer = setInterval(() => {
				this._adjustBetByAdaptiveStep(dir);
				// 加速処理: インターバルを短くする
				this._continuousInterval = Math.max(
					minInterval,
					Math.round((this._continuousInterval || 260) * accelFactor),
				);
				if (this._continuousTimer) {
					clearInterval(this._continuousTimer);
				}
				this._continuousTimer = setInterval(() => {
					this._adjustBetByAdaptiveStep(dir);
				}, this._continuousInterval);
			}, this._continuousInterval);
			this._continuousStarter = null;
		}, delay);
	}

	_stopContinuousAdjust() {
		if (this._continuousTimer) {
			clearInterval(this._continuousTimer);
			this._continuousTimer = null;
		}
		if (this._continuousStarter) {
			clearTimeout(this._continuousStarter);
			this._continuousStarter = null;
		}
		this._continuousInterval = undefined;
		this._continuousDir = 0;
		this._continuousStarted = false;
	}

	/**
	 * ゲームの初期化処理。
	 * リールの構築、初期位置の設定、イベントリスナーの登録を行います。
	 */
	init() {
		this.buildReels(); // リール要素をHTMLに生成
		this.setInitialPositions(); // 各リールを初期表示位置に設定
		this.bindEvents(); // ボタンクリックなどのイベントを登録
		this.initLever(); // レバー初期化（右側レバーの押下演出と連動）
		// 勝利メッセージ要素を作成して body に追加（存在しない場合）
		if (!document.getElementById("winMessage")) {
			const wm = document.createElement("div");
			wm.id = "winMessage";
			wm.innerHTML = `<span class="amount"></span><span class="sub">おめでとうございます!</span>`;
			// スロットコンテナ中央に重ねるため、コンテナ配下へ配置
			(this.slotContainer || document.body).appendChild(wm);
		}

		// コントロール領域にエクスポート/インポートUIを追加
		const controls = document.querySelector(".controls");
		if (controls && !document.getElementById("persistenceControls")) {
			const wrap = document.createElement("div");
			wrap.id = "persistenceControls";
			wrap.style.display = "inline-block";
			wrap.style.marginLeft = "12px";
			// Export button
			const exp = document.createElement("button");
			exp.textContent = "残高をエクスポート";
			exp.title = "現在の残高をパスワード文字列としてコピーします";
			exp.addEventListener("click", (e) => {
				e.preventDefault();
				const pw = this.generateBalancePassword();
				navigator.clipboard
					?.writeText(pw)
					.then(() => {
						alert(`パスワードをクリップボードにコピーしました:\n${pw}`);
					})
					.catch(() => {
						prompt("以下のパスワードをコピーしてください:", pw);
					});
			});
			wrap.appendChild(exp);

			// Import button
			const imp = document.createElement("button");
			imp.textContent = "残高を復元";
			imp.title = "保存してあるパスワード文字列から残高を復元します";
			imp.addEventListener("click", (e) => {
				e.preventDefault();
				const v = prompt("復元するパスワードを入力してください:");
				if (!v) return;
				const ok = this.restoreFromPassword(v.trim());
				if (!ok)
					alert("復元に失敗しました。パスワードが正しいか確認してください。");
				else alert("復元に成功しました。");
			});
			wrap.appendChild(imp);
			controls.appendChild(wrap);
		}
		// 配当表をレンダリング
		this.renderPayoutTable();
		// 賭け金入力の自動サイズ調整を初期化
		this.initBetInputAutoSize();
		// トースト要素がなければ追加
		if (!document.getElementById("toast")) {
			const t = document.createElement("div");
			t.id = "toast";
			t.className = "toast";
			document.body.appendChild(t);
		}
		// 新規要素キャッシュ
		this._cacheFinanceElements();
		// 目押しボタンの初期状態を反映
		this.updateManualButtonsUI();
		// 開発者モードパネルを準備（表示はトグル可能）
		if (this.config?.devPanelEnabled) {
			this.renderDevPanel();
		}
		// Ctrl+D で開発者パネル表示/非表示を切り替え
		document.addEventListener("keydown", (e) => {
			if (e.ctrlKey && e.key.toLowerCase() === "d") {
				e.preventDefault();
				const p = document.getElementById("devPanel");
				if (p) p.style.display = p.style.display === "none" ? "block" : "none";
			}
		});
	}

	/** 賭け金入力の幅を値の桁数に合わせて伸縮させる */
	initBetInputAutoSize() {
		const el = document.getElementById("betInput") as HTMLInputElement | null;
		if (!el) return;
		const resize = () => {
			const _el = el as HTMLInputElement;
			const len = String(_el.value ?? _el.placeholder ?? "").length;
			// 最小幅 72px、1桁ごとに12px増加
			const w = Math.max(72, 72 + (len - 1) * 12);
			(el as HTMLElement).style.width = `${w}px`;
		};
		el.addEventListener("input", () => {
			// リアルタイムでサイズ調整
			resize();
			// リアルタイムで有効上限を反映・切り詰め（SlotGame の状態を参照して計算）
			try {
				this.updateBetConstraints();
			} catch (_e) {}
			// dev panel 更新
			this.updateDevPanel();
		});

		// 入力制約: min 属性のみは固定でセットし、max は残高/借入に応じて動的に設定する
		try {
			const minBet = Number(this.config.minBet) || 1;
			el.setAttribute("inputmode", "numeric");
			el.setAttribute("pattern", "\\d*");
			el.setAttribute("min", String(minBet));
		} catch (_e) {
			/* ignore */
		}

		// 非数値や範囲外の入力をリアルタイムで修正するハンドラ
		el.addEventListener("change", () => {
			const _el = el as HTMLInputElement;
			let v = String(_el.value ?? "").trim();
			if (v === "") return; // 空は placeholder に任せる
			// カンマなどの区切りは除去
			v = v.replace(/[,\s]+/g, "");
			let n = Number(v);
			if (!Number.isFinite(n) || n <= 0) {
				// 不正な入力は最低ベットに戻す
				n = Number(this.config.minBet) || 1;
			}
			const minBet = Number(this.config.minBet) || 1;
			const maxBet = Number(this.config.maxBet) || 1000000;
			if (n < minBet) n = minBet;
			if (n > maxBet) n = maxBet;
			_el.value = String(Math.floor(n));
			this.updateDevPanel();
			// 値が変更されたら上限表示を更新
			try {
				this.updateAvailableMaxDisplay();
			} catch (_e) {}
		});
		// 初期サイズ
		resize();
	}

	/**
	 * ページ上に配当表を描画します。
	 * this.payoutTable を参照し、シンボルと倍率を一覧表示します。
	 */
	renderPayoutTable() {
		const container = document.getElementById("payoutTable");
		if (!container) return;
		// 既存の内容をクリア
		container.innerHTML = "";
		// テーブル風の簡易一覧を作る
		const table = document.createElement("div");
		table.className = "payout-list";
		const entries = Object.keys(this.payoutTable).map((k) => ({
			symbol: k,
			mult: this.payoutTable[k],
		}));
		// ソート: 倍率の高い順
		entries.sort((a, b) => b.mult - a.mult);
		for (const e of entries) {
			const row = document.createElement("div");
			row.className = "payout-row";
			row.textContent = `${e.symbol} : ${e.mult}x`;
			table.appendChild(row);
		}
		container.appendChild(table);
		// 初回の動的制約反映
		try {
			this.updateBetConstraints();
		} catch (_e) {}
	}

	/**
	 * 現在の残高・借入で許容される最大ベットを計算し、入力フィールドの max 属性と
	 * 値を必要に応じて調整します（UI側の制約）。
	 */
	updateBetConstraints() {
		const el = document.getElementById("betInput") as HTMLInputElement | null;
		if (!el) return;
		const minBet = Number(this.config.minBet) || 1;
		const configMax = Number(this.config.maxBet) || 1000000;
		// SlotGame インスタンスから残高・借入情報を取得して有効上限を計算
		let effectiveMax = configMax;
		try {
			const Win = /** @type {any} */ (window);
			const sg = Win?.activeSlotGame ? Win.activeSlotGame : null;
			let available = 0;
			let bal = 0;
			if (sg) {
				bal = Number(sg.balance) || 0;
				if (sg.creditConfig?.enabled) {
					available = Math.max(
						0,
						(sg.creditConfig.creditLimit || 0) - (sg.debt || 0),
					);
				}
			}
			effectiveMax = Math.max(
				minBet,
				Math.min(configMax, Math.floor(bal + available)),
			);
		} catch (_e) {
			// フォールバック: 設定のみ
			effectiveMax = Math.max(
				minBet,
				Math.min(configMax, Number(this.config.maxBet) || 1000000),
			);
		}
		el.setAttribute("max", String(effectiveMax));
		// 現在入力値が有効最大を超えていたら切り詰める（リアルタイム適用）
		const _el = el as HTMLInputElement;
		const cur = Number(String(_el.value ?? "").replace(/[,\s]+/g, "")) || 0;
		if (cur > effectiveMax) {
			_el.value = String(effectiveMax);
			// 自動切り詰めが行われたことをユーザーに通知
			try {
				this._showToast(
					`賭け金を利用可能上限 ¥${effectiveMax} に自動調整しました`,
				);
			} catch (_e) {}
		}
		// 利用可能上限の表示を更新
		try {
			this.updateAvailableMaxDisplay(effectiveMax);
		} catch (_e) {}
	}

	// キャッシュした要素とヘルパー

	_cacheFinanceElements() {
		this.elBet = document.getElementById("betInput") as HTMLInputElement | null;
		this.elAvailable = document.getElementById("availableMax");
		this.elStepUp = document.getElementById("betStepUp");
		this.elStepDown = document.getElementById("betStepDown");
		// ステップボタンの挙動: min/max/step を尊重
		if (this.elStepUp) {
			this.elStepUp.addEventListener("click", (e) => {
				e.preventDefault();
				if (this._suppressNextClick) {
					this._suppressNextClick = false;
					return;
				}
				this._adjustBetByAdaptiveStep(+1);
			});
			// 長押しで加速度的に増やす: pointer イベントで統一的に扱う
			this.elStepUp.addEventListener("pointerdown", (e) => {
				e.preventDefault();
				const el = e.currentTarget as HTMLElement | null;
				try {
					const pe = e as PointerEvent;
					if (el?.setPointerCapture && pe.pointerId) {
						el.setPointerCapture(pe.pointerId);
					}
				} catch (_err) {}
				this._startContinuousAdjust?.(+1);
			});
			this.elStepUp.addEventListener("pointerup", (e) => {
				this._suppressNextClick = !!this._continuousStarted;
				const el = e.currentTarget as HTMLElement;
				try {
					if (el && "releasePointerCapture" in el) {
						(
							el as HTMLElement & {
								releasePointerCapture: (id: number) => void;
							}
						).releasePointerCapture(e.pointerId);
					}
				} catch (_err) {}
				this._stopContinuousAdjust?.();
			});
			this.elStepUp.addEventListener("pointercancel", () => {
				this._stopContinuousAdjust?.();
			});
			this.elStepUp.addEventListener("pointerleave", () => {
				this._stopContinuousAdjust?.();
			});
		}
		if (this.elStepDown) {
			this.elStepDown.addEventListener("click", (e) => {
				e.preventDefault();
				if (this._suppressNextClick) {
					this._suppressNextClick = false;
					return;
				}
				this._adjustBetByAdaptiveStep(-1);
			});
			this.elStepDown.addEventListener("pointerdown", (e) => {
				e.preventDefault();
				const el = e.currentTarget as HTMLElement;
				try {
					if (el && "setPointerCapture" in el) {
						(
							el as HTMLElement & { setPointerCapture: (id: number) => void }
						).setPointerCapture(e.pointerId);
					}
				} catch (_err) {}
				this._startContinuousAdjust?.(-1);
			});
			this.elStepDown.addEventListener("pointerup", (e) => {
				this._suppressNextClick = !!this._continuousStarted;
				const el = e.currentTarget as HTMLElement;
				try {
					if (el && "releasePointerCapture" in el) {
						(
							el as HTMLElement & {
								releasePointerCapture: (id: number) => void;
							}
						).releasePointerCapture(e.pointerId);
					}
				} catch (_err) {}
				this._stopContinuousAdjust?.();
			});
			this.elStepDown.addEventListener("pointercancel", () => {
				this._suppressNextClick = !!this._continuousStarted;
				this._stopContinuousAdjust?.();
			});
			this.elStepDown.addEventListener("pointerleave", () => {
				this._suppressNextClick = !!this._continuousStarted;
				this._stopContinuousAdjust?.();
			});
			this.elStepDown.addEventListener("pointercancel", () => {
				this._stopContinuousAdjust?.();
			});
			this.elStepDown.addEventListener("pointerleave", () => {
				this._stopContinuousAdjust?.();
			});
		}
	}

	_adjustBetByStep(dir: number): void {
		if (!this.elBet) return;
		const _bet = this.elBet;
		const step = Number(_bet.getAttribute("step")) || 1;
		const min = Number(_bet.getAttribute("min")) || 1;
		const max =
			Number(_bet.getAttribute("max")) || Number(this.config.maxBet) || 1000000;
		let cur = Math.floor(Number(_bet.value) || min);
		cur = cur + dir * step;
		cur = Math.max(min, Math.min(max, cur));
		_bet.value = String(cur);
		this.updateDevPanel();
		this.updateAvailableMaxDisplay();
	}

	/**
	 * 長押し用の適応ステップで賭け金を調整する
	 * ルール:
	 * - 0 <= val < 100  : step = 10
	 * - 100 <= val < 1000 : step = 100
	 * - 1000 <= val < 10000 : step = 1000
	 */
	_adjustBetByAdaptiveStep(dir: number): void {
		if (!this.elBet) return;
		const _bet = this.elBet;
		const min = Number(_bet.getAttribute("min")) || 1;
		const max =
			Number(_bet.getAttribute("max")) || Number(this.config.maxBet) || 1000000;
		const cur = Math.floor(Number(_bet.value) || 0);
		const absCur = Math.max(0, cur);
		let step = 1;
		if (absCur < 100) step = 10;
		else if (absCur < 1000) step = 100;
		else step = 1000; // 1000以上は常に1000刻み（10000以上も含む）
		let next = cur + dir * step;
		next = Math.max(min, Math.min(max, next));
		_bet.value = String(next);
		this.updateDevPanel();
		this.updateAvailableMaxDisplay();
	}

	updateAvailableMaxDisplay(effectiveMax?: number) {
		if (!this.elAvailable)
			this.elAvailable = document.getElementById("availableMax");
		if (!this.elAvailable) return;
		let val = effectiveMax;
		if (typeof val === "undefined") {
			// compute current effective max
			const el = document.getElementById("betInput");
			val = Number(el?.getAttribute("max")) || 0;
		}
		this.elAvailable.textContent = String(val);
	}

	_showToast(msg: string, timeout = 2200) {
		const t = document.getElementById("toast");
		if (!t) return;
		t.textContent = msg;
		t.classList.add("show");
		if (this._toastTimer) {
			clearTimeout(this._toastTimer);
		}
		this._toastTimer = setTimeout(() => {
			t.classList.remove("show");
		}, timeout);
	}

	/**
	 * --- 開発者モード: 期待値計算と表示パネル ---
	 * 以下は開発者モード用の簡易ツールです。
	 * - 期待値は「1ベットあたりの期待配当倍率」を計算します（配当はラインごとに加算される現在の仕様に準拠）。
	 * - 計算は現行のリールシンボル分布（reelsData）と this.payoutTable を用いて行います。
	 * - 表示はトグルで開閉可能。開発中に自由に表示/非表示できます。
	 */

	computeExpectedValuePerUnit() {
		// 各リールごとのシンボル確率を算出（固定停止位置が一様であるという前提）
		const perReelProb = this.getPerReelSymbolProbs();

		// ラインあたりの期待倍率 = sum_over_symbols( product_over_reels P_r(symbol) * multiplier(symbol) )
		const symbols = Object.keys(this.payoutTable);
		let perLineExpectedMult = 0;
		for (const sym of symbols) {
			let p = 1;
			for (let i = 0; i < this.reels.length; i++) {
				p *= perReelProb[i][sym] || 0;
			}
			const mult = Number(this.payoutTable[sym] || 0);
			perLineExpectedMult += p * mult;
		}

		// ライン数（定義から算出）
		const totalLines = this.getWinningLines().length;

		// 自然発生による1ベットあたりの期待倍率（全ライン合算）
		const evNaturalPerUnit = totalLines * perLineExpectedMult;

		// --- forced（演出）による期待倍率 ---
		// chooseSymbolByProbability と同じロジックで、全リールに存在する候補のみを考慮した重み分布を作る
		const weights = this.config.winSymbolWeights || {};
		const commonSymbols = this.reels.reduce(
			(acc, r) => acc.filter((sym: string) => r.symbols.includes(sym)),
			Object.keys(weights),
		);
		const filtered = commonSymbols.filter(
			(sym: string) => (weights[sym] || 0) > 0,
		);
		let forcedExpectedMult = 0;
		if (filtered.length > 0) {
			const totalW = filtered.reduce(
				(s: number, sym: string) => s + weights[sym],
				0,
			);
			for (const sym of filtered) {
				const pSym = weights[sym] / totalW;
				forcedExpectedMult += pSym * Number(this.payoutTable[sym] || 0);
			}
		}

		// 演出確率
		const horizP = clamp(
			Number(this.config.winHorizontalProbability) || 0,
			0,
			1,
		);
		const diagP = clamp(Number(this.config.winDiagonalProbability) || 0, 0, 1);
		const sumP = Math.min(1, horizP + diagP);

		// 合成: 演出が起きた場合は forced により1ライン分（簡易仮定）の配当が得られるものとする。
		// EV_total_per_unit = (1 - sumP) * evNaturalPerUnit + horizP * forcedExpectedMult + diagP * forcedExpectedMult
		const evTotalPerUnit =
			(1 - sumP) * evNaturalPerUnit + (horizP + diagP) * forcedExpectedMult;

		return {
			evPerUnit: evTotalPerUnit,
			evNaturalPerUnit,
			forcedExpectedMult,
			perLineExpectedMult,
			totalLines,
			horizP,
			diagP,
		};
	}

	/**
	 * 開発者向け: 与えられた掛け金で "return > bet" となる確率を近似計算する
	 * 単純化モデル: ライン間独立、forced 演出は1ラインを置換する近似
	 */
	computeProbabilityReturnGreaterThanBet(_bet: number): number {
		// ライン毎の倍率PMF を作る
		const symbols = Object.keys(this.payoutTable);
		const perReelProb = this.getPerReelSymbolProbs();

		const linePMF = new Map();
		for (const sym of symbols) {
			let p = 1;
			for (let i = 0; i < this.reels.length; i++) p *= perReelProb[i][sym] || 0;
			const mult = Number(this.payoutTable[sym] || 0);
			linePMF.set(mult, (linePMF.get(mult) || 0) + p);
		}
		const sumProb = Array.from(linePMF.values()).reduce((s, v) => s + v, 0);
		if (sumProb < 0.999999)
			linePMF.set(0, (linePMF.get(0) || 0) + (1 - sumProb));

		const totalLines = this.getWinningLines().length;

		// 単純畳み込み
		let totalPMF = new Map();
		totalPMF.set(0, 1);
		for (let L = 0; L < totalLines; L++) {
			const next = new Map();
			for (const [aMult, aP] of totalPMF.entries()) {
				for (const [bMult, bP] of linePMF.entries()) {
					const nm = aMult + bMult;
					next.set(nm, (next.get(nm) || 0) + aP * bP);
				}
			}
			totalPMF = next;
		}

		const evInfo = this.computeExpectedValuePerUnit();
		const forcedMult = evInfo.forcedExpectedMult || 0;
		const horizP = evInfo.horizP || 0;
		const diagP = evInfo.diagP || 0;
		const sumP = Math.min(1, horizP + diagP);

		const naturalOneLineMean = evInfo.perLineExpectedMult || 0;
		const adjustedPMF = new Map();
		for (const [totalMult, p] of totalPMF.entries()) {
			const adj = Math.max(0, totalMult - naturalOneLineMean + forcedMult);
			adjustedPMF.set(adj, (adjustedPMF.get(adj) || 0) + p);
		}

		const finalPMF = new Map();
		for (const [m, p] of totalPMF.entries())
			finalPMF.set(m, (finalPMF.get(m) || 0) + p * (1 - sumP));
		for (const [m, p] of adjustedPMF.entries())
			finalPMF.set(m, (finalPMF.get(m) || 0) + p * sumP);

		let prob = 0;
		for (const [m, p] of finalPMF.entries()) {
			if (m > 1 - 1e-12) prob += p;
		}
		return prob;
	}

	/**
	 * 開発者パネルを描画します（トグルで表示/非表示）。
	 */
	renderDevPanel() {
		// 設定で無効化されている場合は何もしない
		if (!this.config || !this.config.devPanelEnabled) return;
		// 既に存在する場合は更新のみ
		let panel = document.getElementById("devPanel");
		if (!panel) {
			panel = document.createElement("div");
			panel.id = "devPanel";
			panel.style.position = "fixed";
			panel.style.right = "12px";
			panel.style.bottom = "12px";
			panel.style.background = "rgba(0,0,0,0.8)";
			panel.style.color = "white";
			panel.style.padding = "10px";
			panel.style.borderRadius = "8px";
			panel.style.fontSize = "13px";
			panel.style.zIndex = "9999";
			panel.style.maxWidth = "320px";
			panel.style.boxShadow = "0 6px 18px rgba(0,0,0,0.6)";
			// header
			const hdr = document.createElement("div");
			hdr.style.display = "flex";
			hdr.style.justifyContent = "space-between";
			hdr.style.alignItems = "center";
			hdr.style.marginBottom = "8px";
			hdr.innerHTML =
				'<strong style="font-size:14px">開発者パネル：期待値</strong>';
			// close button
			const btn = document.createElement("button");
			btn.textContent = "×";
			btn.title = "開発者パネルを閉じる";
			btn.style.marginLeft = "8px";
			btn.style.cursor = "pointer";
			btn.addEventListener("click", () => {
				if (panel) panel.style.display = "none";
			});
			hdr.appendChild(btn);
			panel.appendChild(hdr);
			// content
			const content = document.createElement("div");
			content.id = "devPanelContent";
			panel.appendChild(content);
			document.body.appendChild(panel);
		}
		this.updateDevPanel();
	}

	updateDevPanel() {
		const content = document.getElementById("devPanelContent");
		if (!content) return;
		const betInput = document.getElementById("betInput");
		const minBet =
			typeof this.config.minBet === "number" ? this.config.minBet : 1;
		const betValue =
			betInput instanceof HTMLInputElement && betInput.value !== ""
				? Number(betInput.value)
				: Number.NaN;
		const bet = Math.max(Number.isFinite(betValue) ? betValue : minBet, minBet);

		const ev = this.computeExpectedValuePerUnit();
		const evForBet = ev.evPerUnit * bet;
		const roi = (ev.evPerUnit - 1) * 100; // % return over bet (approx)

		content.innerHTML = "";

		const title = document.createElement("div");
		title.style.fontWeight = "600";
		title.style.marginBottom = "6px";
		title.textContent = "期待値内訳（1ベットあたり）";
		content.appendChild(title);

		const total = document.createElement("div");
		total.textContent = `合計期待倍率（1ベットあたり）: ${ev.evPerUnit.toFixed(6)}`;
		content.appendChild(total);

		const natural = document.createElement("div");
		natural.textContent = `自然発生期待倍率（全ライン合算）: ${ev.evNaturalPerUnit.toFixed(6)}`;
		content.appendChild(natural);

		const forced = document.createElement("div");
		forced.textContent = `演出時の期待倍率（1行あたり）: ${ev.forcedExpectedMult.toFixed(4)}`;
		content.appendChild(forced);

		const probs = document.createElement("div");
		probs.textContent = `演出確率: 合計=${(ev.horizP + ev.diagP).toFixed(4)} (水平:${ev.horizP.toFixed(3)}, 斜め:${ev.diagP.toFixed(3)})`;
		content.appendChild(probs);

		const lines = document.createElement("div");
		lines.textContent = `考慮されたライン数: ${ev.totalLines} (ラインごとの自然期待倍率: ${ev.perLineExpectedMult.toFixed(6)})`;
		content.appendChild(lines);

		const evBetLine = document.createElement("div");
		evBetLine.style.marginTop = "6px";
		evBetLine.textContent = `現在の掛け金 (${bet}) に対する期待返還: ${evForBet.toFixed(2)}`;
		content.appendChild(evBetLine);

		const roiLine = document.createElement("div");
		roiLine.textContent = `概算 ROI: ${roi.toFixed(2)}%`;
		content.appendChild(roiLine);

		// 掛け金より多く返ってくる確率（近似）を表示
		const prob = this.computeProbabilityReturnGreaterThanBet(bet);
		const probLine = document.createElement("div");
		probLine.style.marginTop = "6px";
		probLine.textContent = `Prob(return > bet): ${(prob * 100).toFixed(2)}%`;
		content.appendChild(probLine);

		const refresh = document.createElement("button");
		refresh.textContent = "更新";
		refresh.style.marginTop = "8px";
		refresh.addEventListener("click", () => this.updateDevPanel());
		content.appendChild(refresh);
	}

	/**
	 * HTML内にリール要素とシンボルを動的に生成し、配置します。
	 * 無限スクロールを実現するため、シンボルリストは2周分生成されます。
	 */
	buildReels() {
		this.ui.clearSlotContainer(); // 既存のリールがあればクリア

		for (let i = 0; i < this.config.reelCount; i++) {
			// 各リールを構成するHTML要素を作成
			const reelElement = this.ui.createReelElement();
			const symbolsElement = this.ui.createSymbolsElement();

			// 設定データから現在のリールに表示するシンボル配列を取得
			const reelSymbols = this.config.reelsData[i];
			const fragment = document.createDocumentFragment(); // DOM操作のパフォーマンス向上のためDocumentFragmentを使用
			// 注意: symbolDuplicationFactor を増やすと初期 DOM ノード数とメモリ使用量が増加します。体感と性能のバランスで調整。

			// シンボルを2周分生成し、リールに追加
			for (
				let j = 0;
				j < reelSymbols.length * this.config.symbolDuplicationFactor;
				j++
			) {
				const symbol = reelSymbols[j % reelSymbols.length]; // シンボル配列をループ
				const symbolElement = this.ui.createSymbolElement(symbol);
				fragment.appendChild(symbolElement);
			}

			symbolsElement.appendChild(fragment);
			reelElement.appendChild(symbolsElement);
			this.ui.appendReelToSlotContainer(reelElement);

			// 生成したリール要素と関連データを内部管理用の配列に格納
			this.reels.push({
				container: reelElement, // リール全体のコンテナ
				element: symbolsElement, // シンボルコンテナのDOM要素
				symbols: reelSymbols, // このリールに表示されるシンボルデータ
				symbolHeight: this.config.symbolHeight, // シンボルの高さ
				index: i, // リールのインデックス
				spinning: false, // このリールが回転中かどうかのフラグ
				animationFrameId: null, // requestAnimationFrameのID (アニメーション停止時に使用)
				totalHeight: reelSymbols.length * this.config.symbolHeight, // シンボル2周分の全高
			});
		}
	}

	/**
	 * ゲーム開始時に、各リールを設定された初期位置に配置します。
	 * CSSの`transform: translateY()`を使用して位置を調整します。
	 */
	setInitialPositions() {
		this.reels.forEach((reel, index) => {
			const positionIndex = this.config.initialReelPositions[index];

			// 設定された初期位置が不正な場合のバリデーション
			if (positionIndex < 0 || positionIndex >= reel.symbols.length) {
				console.error(
					`リール${index}の初期位置(${positionIndex})が無効です。0に設定します。`,
				);
				this.ui.setReelTransform(reel.element!, 0); // 安全なデフォルト値
				return;
			}
			// 指定されたシンボルがリールの一番上に表示されるようにY座標を計算
			// 例: positionIndexが0なら0px、1なら-80px (シンボル1つ分上に移動)
			const yPosition = -positionIndex * this.config.symbolHeight;
			this.ui.setReelTransform(reel.element!, yPosition);
		});
	}

	/*
	 * 未使用のためコメントアウト：
	 * SlotGame#getCurrentTranslateY は UIManager#getCurrentTranslateY と処理が重複しており、
	 * 本クラス内では参照しておりません（startReel/stopReel は UIManager 経由で取得）。
	 * 2箇所に同等処理があると将来的な仕様変更（例：transformの扱い変更、DOMMatrix非対応環境へのフォールバック等）時に
	 * 片方だけ修正されて不整合が生じやすいため、UIManager 側を正とし本実装は退避いたします。
	 * 必要になった際は UIManager に統一したうえで呼び出し箇所を見直してください。
	 */
	// getCurrentTranslateY(element) {
	// 	const style = window.getComputedStyle(element);
	// 	const matrix = new DOMMatrix(style.transform);
	// 	return matrix.m42;
	// }

	/**
	 * ゲームの操作ボタンにイベントリスナーを設定します。
	 */
	bindEvents() {
		// スタート/ストップボタンがクリックされたらhandleActionメソッドを実行
		if (this.ui?.elements?.actionBtn) {
			this.ui.elements.actionBtn.addEventListener("click", () =>
				this.handleAction(),
			);
		} else {
			console.warn(
				"SlotGame.bindEvents: actionBtn not found, skipping listener bind",
			);
		}
		// モード切り替えボタンがクリックされたらtoggleModeメソッドを実行
		if (this.ui?.elements?.modeBtn) {
			this.ui.elements.modeBtn.addEventListener("click", () =>
				this.toggleMode(),
			);
		} else {
			// not fatal; embedded adapters may omit mode button
			console.debug?.(
				"SlotGame.bindEvents: modeBtn not found, mode toggle disabled",
			);
		}

		// 個別停止ボタン: 目押しモード時のみ動作、回転中のみ有効
		const stopBtns = this.ui.elements.stopBtns || [];
		stopBtns.forEach((btn, i) => {
			if (!btn) return;
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				this.handleManualStopButton(i);
			});
		});

		// キーボード: スペースキーでスタート/停止をトグル（レバーも連動して下げる）
		document.addEventListener("keydown", (e) => {
			if (e.code === "Space") {
				// 長押しの連続発火を防止し、ページスクロールなどの既定動作を抑止
				if (e.repeat) return;
				e.preventDefault();
				this.pullLeverVisual();
				this.handleAction();
			}
			// 1/2/3 キーで対応するリールを止める（目押しモード時のみ）
			if (!e.repeat && !this.isAutoMode && this.isSpinning) {
				const ae = document.activeElement;
				if (
					ae instanceof HTMLElement &&
					(ae.tagName === "INPUT" ||
						ae.tagName === "TEXTAREA" ||
						ae.isContentEditable)
				)
					return;
				if (e.key === "1") {
					e.preventDefault();
					this.handleManualStopButton(0);
				} else if (e.key === "2") {
					e.preventDefault();
					this.handleManualStopButton(1);
				} else if (e.key === "3") {
					e.preventDefault();
					this.handleManualStopButton(2);
				}
			}
		});

		/* アクセシビリティの補足
		 * キーボード操作（Enter キー等）やスクリーンリーダー対応を強化する場合は、
		 * ボタン要素にフォーカス可視化や aria-pressed などの属性付与も検討してください。
		 */
	}

	/**
	 * レバーUIの初期化とイベント結線。
	 * - クリック/タッチでレバーを下げ、ゲーム開始/停止をトグル
	 * - スペースキー押下時の視覚効果と統一
	 */
	initLever() {
		this.leverEl = document.getElementById("slotLever");
		if (!this.leverEl) return; // レバーが存在しない場合は何もしない

		// レバーはスロット本体の .slot-container にぶら下げて、右横に絶対配置する
		try {
			if (
				this.slotContainer &&
				this.leverEl.parentElement !== this.slotContainer
			) {
				this.slotContainer.appendChild(this.leverEl);
			}
		} catch (_e) {
			/* ignore */
		}

		const onPress = (ev?: Event) => {
			if (ev) ev.preventDefault();
			this.pullLeverVisual();
			this.handleAction();
		};

		this.leverEl.addEventListener("click", onPress);
		this.leverEl.addEventListener("keydown", (e) => {
			if (e.code === "Space" || e.key === "Enter") {
				e.preventDefault();
				onPress(e);
			}
		});
	}

	/** レバーの見た目だけを一時的に「ガコン」と下げる（回転アニメ） */
	pullLeverVisual() {
		if (!this.leverEl) return;
		// アニメ再生を毎回確実に再トリガする（クラスを外してリフロー後に付け直す）
		const el = this.leverEl;
		el.classList.remove("is-down"); // 旧クラスはクリア
		el.classList.remove("is-pulling");
		// リフロー強制（アニメ再適用のため）
		void el.offsetWidth;
		el.classList.add("is-pulling");
		if (this._leverTimer) clearTimeout(this._leverTimer);
		this._leverTimer = setTimeout(() => {
			el.classList.remove("is-pulling");
		}, 520);
	}

	/**
	 * スタート/ストップボタンがクリックされた際の処理を振り分けます。
	 * ゲームが回転中なら手動停止、停止中ならゲーム開始。
	 */
	handleAction() {
		if (this.isSpinning) {
			this.stopManual(); // 回転中なら目押し停止を試みる
		} else {
			this.startGame(); // 停止中ならゲームを開始する
		}
	}

	/**
	 * ゲームモード（自動停止/目押し）を切り替えます。
	 * リール回転中はモード変更を無効化します。
	 */
	toggleMode() {
		if (this.isSpinning) return; // リールが回転中の場合はモード変更を許可しない
		this.isAutoMode = !this.isAutoMode; // モードフラグを反転
		// ボタンのテキストを現在のモードに合わせて更新
		this.ui.setModeBtnText(`モード: ${this.isAutoMode ? "自動" : "目押し"}`);
		this.updateManualButtonsUI();
	}

	/**
	 * スロットゲームを開始します。
	 * 全てのリールを同時に回転させ、モードに応じた処理を行います。
	 */
	startGame() {
		if (this.isSpinning) return; // 既に回転中であれば、多重起動を防ぐ
		// NOTE: isSpinning は賭け金検証が通った後に立てる。
		// これにより、検証で早期リターンした際に isSpinning が真になって
		// 二度と開始できなくなる状態を防止する。
		this.manualStopCount = 0; // 目押しカウンターをリセット（互換のため保持）

		// 現在のモードに応じたリール回転速度を設定
		const speed = this.isAutoMode
			? this.config.autoSpeed
			: this.config.manualSpeed;

		// 賭け金の処理: 入力値の検証と上限チェックを行う
		const betInput = document.getElementById("betInput");
		const rawBet = betInput instanceof HTMLInputElement ? betInput.value : "";
		let parsedBet = Number(rawBet);
		if (!Number.isFinite(parsedBet) || parsedBet <= 0)
			parsedBet = this.config.minBet || 1;
		// 下限は config.minBet、上限は config.maxBet（未設定時は 1,000,000 を使用）
		const minBet = this.config.minBet || 1;
		const maxBet = this.config.maxBet || 1000000;
		let bet = Math.max(parsedBet, minBet);

		// 利用可能な借入額を見積もる（まだ借入処理は行わない）
		let available = 0;
		if (this.creditConfig?.enabled) {
			available = Math.max(
				0,
				(this.creditConfig.creditLimit || 0) - (this.debt || 0),
			);
		}
		const effectiveMax = Math.max(
			minBet,
			Math.min(maxBet, Math.floor((this.balance || 0) + available)),
		);

		// 要求ベットが効果的最大を超えていれば自動で切り詰めて通知する
		if (bet > effectiveMax) {
			const prev = bet;
			bet = Math.floor(effectiveMax);
			try {
				if (this.ui && typeof this.ui.displayMessage === "function") {
					this.ui.displayMessage(
						`入力されたベット ${prev} は利用可能額を超えているため、${bet} に自動調整しました。`,
					);
				}
			} catch (_e) {
				/* ignore */
			}
			// もし切り詰め後も最低ベット未満なら開始不可
			if (bet < minBet) {
				console.warn(
					"利用可能額が最低ベット未満: effectiveMax=",
					effectiveMax,
					"minBet=",
					minBet,
				);
				this.ui.setActionBtnText("▶ スタート");
				this.ui.setActionBtnDisabled(false);
				try {
					this.updateManualButtonsUI();
				} catch (_e) {}
				return;
			}
		}

		// 残高が足りない場合、借入で補填できるかを厳格にチェックする（部分借入で不足のまま開始しない）
		if (bet > this.balance) {
			const need = bet - this.balance;
			if (!this.creditConfig.enabled) {
				console.warn(
					"残高不足かつ借入無効: bet=",
					bet,
					"balance=",
					this.balance,
				);
				this.ui.setActionBtnText("▶ スタート");
				this.ui.setActionBtnDisabled(false);
				return;
			}

			const available = Math.max(
				0,
				(this.creditConfig.creditLimit || 0) - this.debt,
			);
			// 利用可能な借入額が不足している場合は、利用可能な最大額までベットを自動調整して続行する
			if (available <= 0) {
				console.warn(
					"借入利用可能額が0です。bet=",
					bet,
					"need=",
					need,
					"available=",
					available,
					"debt=",
					this.debt,
				);
				this.isSpinning = false;
				this.ui.setActionBtnText("▶ スタート");
				this.ui.setActionBtnDisabled(false);
				try {
					this.updateManualButtonsUI();
				} catch (_e) {}
				return;
			}

			// 最大で持てるベット額
			const maxPossibleBet = this.balance + available;
			// 最低ベット未満なら開始不可
			if (maxPossibleBet < minBet) {
				console.warn(
					"利用可能額が最低ベット未満です。maxPossibleBet=",
					maxPossibleBet,
					"minBet=",
					minBet,
				);
				this.isSpinning = false;
				this.ui.setActionBtnText("▶ スタート");
				this.ui.setActionBtnDisabled(false);
				try {
					this.updateManualButtonsUI();
				} catch (_e) {}
				return;
			}

			// 自動調整後のベットを決定:
			// - 要求ベットを増やして maxPossibleBet に合わせるのではなく、
			//   要求ベットを上限として、利用可能な最大額で切り詰める。
			let adjustedBet = Math.min(bet, maxPossibleBet, maxBet);
			if (adjustedBet < minBet) adjustedBet = minBet; // 念のため
			// 通知
			const prevBet = bet;
			bet = Math.floor(adjustedBet);
			const newNeed = bet - this.balance; // 借入必要額（>0）
			const toBorrow = newNeed;
			const interest = Math.ceil(
				toBorrow * (this.creditConfig.interestRate || 0),
			);
			this.debt += toBorrow + interest;
			this.balance += toBorrow;
			console.info(
				`借入(自動調整): ¥${toBorrow} 利息: ¥${interest} 借金合計: ¥${this.debt}`,
			);
			this.updateDebtUI();
			// ユーザーへ通知
			try {
				if (this.ui && typeof this.ui.displayMessage === "function") {
					this.ui.displayMessage(
						`所持金が不足しているため、ベットを ${prevBet} → ${bet} に自動調整しました。`,
					);
				}
			} catch (_e) {
				/* ignore */
			}
		}

		// ここまで検証が済んだのでゲームを回転中状態にする
		this.isSpinning = true;

		// 賭け金を引く
		this.balance -= bet;
		this.currentBet = bet; // ラウンドごとの賭け金を保持
		this.updateBalanceUI();

		// サウンド: スピン開始
		try {
			this.soundManager?.playSpinStart();
		} catch (_e) {
			/* ignore */
		}

		// 全てのリールに対して回転開始命令を出す
		this.reels.forEach((_reel, i) => {
			this.startReel(i, speed);
		});

		// サウンド: 回転ループ開始
		try {
			this.soundManager?.loopStart();
		} catch (_e) {}

		if (this.isAutoMode) {
			// 自動モードの場合: スタートボタンを一時的に無効化し、自動停止タイマーを設定
			this.ui.setActionBtnDisabled(true);
			this.updateManualButtonsUI();

			// 停止順序は常に左→中→右（index昇順）。乱数ゆらぎは維持しつつ、最小ギャップで順序を強制。
			const targets = this.config.stopTargets || [];
			// 同時ターゲット制御の発動確率（スピン単位で一括適用）
			const activationP =
				typeof this.config.targetActivationProbability === "number"
					? this.config.targetActivationProbability
					: 1;
			const useTargetsThisSpin =
				targets.length > 0 && Math.random() < activationP;

			let scheduled: Array<{ i: number; time: number }> | null;
			const hasMinMax =
				typeof this.config.autoStopMinTime === "number" &&
				typeof this.config.autoStopMaxTime === "number";
			if (hasMinMax) {
				const minT = this.config.autoStopMinTime;
				const maxT = this.config.autoStopMaxTime;
				const count = this.config.reelCount;
				const step = count > 1 ? (maxT - minT) / (count - 1) : maxT - minT;
				const derivedRand =
					typeof this.config.autoStopTimeRandomness === "number"
						? this.config.autoStopTimeRandomness
						: Math.max(20, Math.min(300, step * 0.25));
				const minGap =
					this.config.minSequentialStopGapMs ??
					Math.max(60, Math.min(200, step * 0.2));

				scheduled = Array.from({ length: count }, (_v, i) => {
					const base = minT + step * i;
					const jitter = Math.random() * derivedRand * 2 - derivedRand; // [-derivedRand, +derivedRand]
					return { i, time: base + jitter };
				});

				// 単調増加にクランプして順序を担保
				for (let k = 1; k < scheduled.length; k++) {
					if (scheduled[k].time <= scheduled[k - 1].time + minGap) {
						scheduled[k].time = scheduled[k - 1].time + minGap;
					}
				}
			} else {
				/*
				 * レガシー/互換性用フォールバックの簡易スケジュール生成
				 *
				 * 背景:
				 * - 以前は config.autoStopTimings / autoStopTimeRandomness 等の別プロパティで
				 *   停止時刻を管理していました。現在は autoStopMinTime / autoStopMaxTime に
				 *   一本化されていますが、万が一古い設定が混在した場合や、ここを復活させる必要が
				 *   出たときに安全に動くよう“退避版”を用意しています。
				 *
				 * 重要な注意点（将来の編集時に狂いやすい箇所）:
				 * - 単位感覚: `base`/`step` はミリ秒（setTimeout の単位）を想定しています。変更する際は
				 *   フロントエンド全体で同じ単位になっているか確認してください（ms vs s 等の混在注意）。
				 * - minSequentialStopGapMs の意味合い: ここで `step` に minSequentialStopGapMs を使うことで
				 *   リール間の最小ギャップを担保しています。別箇所で minSequentialStopGapMs を変更すると
				 *   停止順序や体感が変わるため、互換性のためこの連動を維持すること。
				 * - setTimeout クロージャ: scheduled をループして setTimeout を登録する際に
				 *   ループ変数を直接参照する形に変更すると予期せぬインデックス混乱を招きます。
				 *   必ず各スコープで値をキャプチャする（または構造体に保持する）実装を行ってください。
				 * - 優先度と整合性: この短絡案は autoStopMinTime/MaxTime の計算結果に比べて
				 *   明確に遅延が固定化されます。勝ち演出 (spinTargets) の優先度や `targets` 設定と
				 *   整合するよう留意してください（下流で上書きされる可能性あり）。
				 *
				 * 実処理（安全な既定スケジュール）
				 * - base: 最初の停止が発火するまでの遅延（ms）。UI/体感に合わせて見直し推奨。
				 * - step: 各リールの停止差分（ms）。minSequentialStopGapMs を尊重して単調増加を担保。
				 */
				const count = this.config.reelCount;
				const base = 1000; // ms: 最初のリール停止までの既定遅延。UI 体感に応じて調整してください。
				// minSequentialStopGapMs を優先してステップ幅を決定。未設定なら安全な下限（100ms）を使用。
				const step = Math.max(100, this.config.minSequentialStopGapMs ?? 100);
				scheduled = Array.from({ length: count }, (_v, i) => ({
					i,
					time: base + step * i,
				}));
			}

			// --------------------------
			// 当たり（勝ち）演出の決定
			// --------------------------
			/*
			 * ロジック:
			 * - horizontal / diagonal のどちらか（またはなし）を確率で決定する。
			 * - horizP と diagP は独立に設定され得るため、合計が 1 を超えないように clamp する。
			 * - roll により発動判定を行い、発動した場合は winType を 'horizontal'|'diagonal' に設定する。
			 *
			 * 将来の編集で注意すべき点:
			 * - 確率の合算順序: horizP と diagP の優先度付けを変えると出現傾向が変わるため、
			 *   ゲームバランス調整時はテストスピンを必ず行ってください。
			 * - winActivationProbability を用いる古い設定との互換性: 互換性コードが混在すると
			 *   発動頻度が意図せず増減する可能性があるため、1つに統一することを推奨します。
			 */
			const horizP =
				typeof this.config.winHorizontalProbability === "number"
					? this.config.winHorizontalProbability
					: typeof this.config.winActivationProbability === "number"
						? this.config.winActivationProbability
						: 0;
			const diagP =
				typeof this.config.winDiagonalProbability === "number"
					? this.config.winDiagonalProbability
					: 0;
			// 合計確率を 0..1 にクランプ（溢れを防止）
			const sumP = Math.min(1, Math.max(0, horizP + diagP));
			let winType = null; // 'horizontal' | 'diagonal' | null

			const roll = Math.random();
			if (roll < sumP) {
				// horizontal を優先的に判定（horizP の範囲に収まれば horizontal、そうでなければ diagonal）
				winType = roll < Math.min(1, horizP) ? "horizontal" : "diagonal";
			}

			let spinTargets = null;
			if (winType) {
				// 当たり演出を展開するための絵柄を抽選
				// chooseSymbolByProbability() は「全リールに存在する絵柄」を返す仕様になっています。
				// ここで返る絵柄が必ず全リールにある前提で下流処理を書いてよい（存在チェックは二重防御として残す）。
				const chosenSymbol = this.chooseSymbolByProbability();
				const existsOnAll = this.reels.every((r) =>
					r.symbols.includes(chosenSymbol),
				);
				if (existsOnAll) {
					if (winType === "horizontal") {
						const rows = this.ROW_NAMES;
						const rowMode = this.config.winRowMode;
						const row = rows.includes(rowMode)
							? rowMode
							: rows[Math.floor(Math.random() * rows.length)];
						spinTargets = this.reels.map((_r, idx) => ({
							reelIndex: idx,
							symbol: chosenSymbol,
							position: row,
						}));
					} else if (winType === "diagonal") {
						// 3リール想定の斜め: ↘ (top,middle,bottom) or ↗ (bottom,middle,top)
						let dir: "down" | "up";
						const mode = this.config.winDiagonalMode;
						if (mode === "up" || mode === "down") {
							dir = mode;
						} else {
							dir = Math.random() < 0.5 ? "down" : "up";
						}
						let positions: string[];
						if (this.config.reelCount === 3) {
							positions =
								dir === "down"
									? ["top", "middle", "bottom"]
									: ["bottom", "middle", "top"];
							spinTargets = this.reels.map((_r, idx) => ({
								reelIndex: idx,
								symbol: chosenSymbol,
								position: positions[idx],
							}));
						} else {
							// reelCount != 3 の場合は水平にフォールバック
							const rows = this.ROW_NAMES;
							const row = rows[Math.floor(Math.random() * rows.length)];
							spinTargets = this.reels.map((_r, idx) => ({
								reelIndex: idx,
								symbol: chosenSymbol,
								position: row,
							}));
						}
					}
				}
			}

			// スケジュール実行（優先度: 当たりターゲット > 設定stopTargets > 通常）
			scheduled.forEach(({ i, time }) => {
				const configuredTarget = useTargetsThisSpin
					? targets.find((t: { reelIndex: number }) => t.reelIndex === i) ||
						null
					: null;
				const target = spinTargets?.[i] || configuredTarget || null;
				setTimeout(() => this.stopReel(i, target), time);
			});
		} else {
			// 目押しモードの場合: スタートボタンのテキストを「停止」に変更
			this.ui.setActionBtnText("⏸ 停止");
			this.updateManualButtonsUI();
		}
	}

	/**
	 * 指定されたリールを回転させるアニメーションを開始します。
	 * `requestAnimationFrame`と`transform: translateY()`を使用して滑らかな動きを実現します。
	 * @param {number} index - 回転を開始するリールのインデックス番号
	 * @param {number} speed - リールの回転速度 (ピクセル/フレーム)
	 */
	startReel(index: number, speed: number) {
		const reel = this.reels[index];
		reel.spinning = true; // このリールが回転中であることを示すフラグを立てる
		reel.element?.classList.add("spinning"); // リールが回転中であることを示すクラスを追加

		// 現在のY座標を取得し、回転方向に応じて内部的な位置`pos`を初期化
		// `pos`は、リールの全高を考慮した無限スクロールのための仮想的な位置です。
		const currentY = this.ui.getCurrentTranslateY(reel.element!);
		let pos = this.config.reverseRotation
			? currentY + reel.totalHeight!
			: -currentY;

		const startTime = performance.now(); // アニメーション開始時刻を記録

		// アニメーションループ関数
		const animate = (currentTime: number) => {
			if (!reel.spinning) return; // 停止命令が出ていればアニメーションを終了

			const elapsed = currentTime - startTime; // アニメーション開始からの経過時間
			let currentSpeed: number; // 現在のフレームでの速度

			// 加速処理: 設定された加速時間内で徐々に速度を上げる
			if (elapsed < this.config.accelerationTime) {
				const progress = elapsed / this.config.accelerationTime; // 加速の進行度 (0.0 - 1.0)
				currentSpeed = speed * this.easeInCubic(progress); // イージング関数で滑らかな加速を適用
			} else {
				currentSpeed = speed; // 最高速度に到達
			}

			// `pos`を更新し、リールの全高を超えたらループさせる (無限スクロールの錯覚)
			// 補足: totalHeight は重複分を含む 2 周（または指定周）相当です。mod により継ぎ目を不可視化します。
			pos = (pos + currentSpeed) % reel.totalHeight!;

		// `pos`から実際のY座標`newY`を計算し、`transform: translateY()`に適用
		// 回転方向によって計算方法が異なります。
		const newY = this.config.reverseRotation ? pos - reel.totalHeight! : -pos;
		if (reel.element) {
			reel.element.style.transform = `translateY(${newY}px)`;
		}			// 次のフレームで再度animate関数を呼び出す
			reel.animationFrameId = requestAnimationFrame(animate);
		};
		requestAnimationFrame(animate); // アニメーションを開始
	}

	/**
	 * 指定されたリールを、最も近いシンボルの位置で滑らかに停止させます。
	 * `transform: translateY()`とイージング関数を使用して、自然な停止アニメーションを実現します。
	 * @param {number} index - 停止させるリールのインデックス番号
	 * @param {object} [target=null] - 停止目標オブジェクト。自動モードの狙い撃ち停止時に使用。
	 */
	stopReel(
		index: number,
		target: {
			reelIndex: number;
			symbol?: string;
			symbolIndex?: number;
			position?: string;
		} | null = null,
	): Promise<void> {
		const reel = this.reels[index];
		if (!reel.spinning) return Promise.resolve(); // 既に停止している場合は何もしない

		cancelAnimationFrame(reel.animationFrameId!); // 回転アニメーションをキャンセル

		const currentY = this.ui.getCurrentTranslateY(reel.element!); // 現在のY座標を取得

		let duration: number;

		if (target) {
			// --- ターゲット停止ロジック（目標に合わせて最短で前方に停止させる） ---
			/* 契約と注意点（簡潔に）
			 * - 入力: target = { symbolIndex?: number, symbol?: string, position?: 'top'|'middle'|'bottom' }
			 * - 副作用: DOM の transform を更新し、該当リールを停止状態にする。
			 * - 重要: reverseRotation が true の場合は「進行方向」が逆転するため、
			 *   「前方／後方」の計算を必ず考慮すること（以下 pickForwardClosestY 参照）。
			 * - 将来の編集で狂いやすい点:
			 *   1) pickForwardClosestY のループ判定を壊すと無限ループや誤ったオフセットが発生します。
			 *   2) 正規化式（mod -> -totalHeight）を変更すると表示が半周ずれるため慎重に。
			 *   3) reel.totalHeight とここで計算する totalHeight を混在させると整合性が崩れる可能性があるため、
			 *      どちらかに統一することを推奨します（本実装は既存プロパティを優先）。
			 */

			const reelSymbols = reel.symbols;
			const symbolHeight = this.config.symbolHeight;
			// ※ totalHeight は「1周分の高さ」を示す（reel.totalHeight は2周分を保持している呼び出し側もある）。
			//    ここでは明示的に算出しているが、以降の計算では既存の reel.totalHeight を参照している箇所があるため
			//    将来編集する場合はどちらを正とするか統一して下さい。
			const totalHeight = reelSymbols.length * symbolHeight;

			// position の意味: top=表示上端にシンボルの先頭、middle=1つ下、bottom=2つ下に該当するようにオフセットを設ける
			const validPositions = ["top", "middle", "bottom"];
			let chosenPosition = validPositions.includes(target.position ?? "")
				? (target.position ??
					validPositions[Math.floor(Math.random() * validPositions.length)])
				: validPositions[Math.floor(Math.random() * validPositions.length)];
			let positionOffset = 0;
			if (chosenPosition === "middle") positionOffset = 1;
			if (chosenPosition === "bottom") positionOffset = 2;

			// 回転方向フラグ（true: 下方向に進行＝reverseRotation での扱い）
			const movingDown = this.config.reverseRotation;

			// currentY は外部で取得済み（この関数冒頭の currentY を参照）
			// 「前方」にある最も近い baseY を返すヘルパー
			const pickForwardClosestY = (baseY: number) => {
				// 注意: この関数は baseY を基準に currentY の「前方方向」へ伸ばしていく。
				//       ループ条件を誤ると無限ループや off-by-one が発生するため慎重に編集すること。
				let y = baseY;
				if (movingDown) {
					// 下方向に動いている場合、表示上の数値（currentY）は負になり得るため、
					// baseY を currentY 以上になるまで足して調整（最短で前方へ到達する値を生成）
					while (y < currentY) y += reel.totalHeight!;
					while (y >= currentY + reel.totalHeight!) y -= reel.totalHeight!;
				} else {
					// 上方向に動いている場合
					while (y > currentY) y -= reel.totalHeight!;
					while (y <= currentY - reel.totalHeight!) y += reel.totalHeight!;
				}
				return y;
			};

			let targetSymbolTopIndex: number;
			let baseTargetY: number;
			let animTargetY: number;

			if (
				typeof target.symbolIndex === "number" &&
				Number.isFinite(target.symbolIndex)
			) {
				// 明示的なシンボルインデックス指定（トップに来るべきシンボルインデックスを指定）
				const rawIndex =
					((target.symbolIndex % reelSymbols.length) + reelSymbols.length) %
					reelSymbols.length;
				// positionOffset を考慮して「そのシンボルが top に来るインデックス」を算出
				targetSymbolTopIndex =
					(rawIndex - positionOffset + reelSymbols.length) % reelSymbols.length;
				baseTargetY = -targetSymbolTopIndex * symbolHeight;
				animTargetY = pickForwardClosestY(baseTargetY);

				// position が未指定の場合は seam（表示領域の継ぎ目）を回避しつつ距離が最短の候補を選ぶ
				if (!validPositions.includes(target.position ?? "")) {
					const candidates: Array<{
						pos: string;
						y: number;
						dist: number;
						wraps: boolean;
						topIdx: number;
						baseY: number;
					}> = [];
					for (const pos of validPositions) {
						const offset = pos === "middle" ? 1 : pos === "bottom" ? 2 : 0;
						const topIdx =
							(rawIndex - offset + reelSymbols.length) % reelSymbols.length;
						const baseY = -topIdx * symbolHeight;
						const y = pickForwardClosestY(baseY);
						// 距離計算は進行方向に沿った単調増加距離を用いる
						const dist = movingDown ? y - currentY : currentY - y;
						// wraps フラグは「1周分以上進むか」を示す（ラップ発生の判定）
						const wraps = movingDown ? y >= 0 : y <= -reel.totalHeight!;
						candidates.push({ pos, y, dist, wraps, topIdx, baseY });
					}
					// 編集時の注意: sort の比較ロジックを変えるとラップ優先度や体感が変わるため、
					// 最小の dist かつラップしない候補を優先する意図を崩さないでください。
					candidates.sort(
						(a, b) => Number(a.wraps) - Number(b.wraps) || a.dist - b.dist,
					);
					const best = candidates[0];
					chosenPosition = best.pos;
					animTargetY = best.y;
					targetSymbolTopIndex = best.topIdx;
					baseTargetY = best.baseY;
				}
			} else if (typeof target.symbol === "string") {
				// 絵柄指定: 該当絵柄が複数ある場合は「前方へ最短で到達」する出現位置を選択する
				const candidates: number[] = [];
				for (let ci = 0; ci < reelSymbols.length; ci++) {
					if (reelSymbols[ci] === target.symbol) candidates.push(ci);
				}
				if (candidates.length === 0) {
					// 指定された絵柄がこのリールに存在しない場合は通常停止へフォールバック
					console.warn(
						`Target symbol not found on reel ${index}:`,
						target.symbol,
					);
					return this.stopReel(index, null);
				}
				// 与えられたオフセットで最短となる候補を探索するヘルパー
				const buildBestForOffset = (offset: number) => {
					let best = {
						dist: Infinity,
						topIndex: 0,
						baseY: 0,
						y: 0,
						wraps: false,
					};
					for (const ci of candidates) {
						const topIndex =
							(ci - offset + reelSymbols.length) % reelSymbols.length;
						const baseY = -topIndex * symbolHeight;
						const y = pickForwardClosestY(baseY);
						const dist = movingDown ? y - currentY : currentY - y;
						const wraps = movingDown ? y >= 0 : y <= -reel.totalHeight!;
						if (dist < best.dist) best = { dist, topIndex, baseY, y, wraps };
					}
					return best;
				};

				if (!validPositions.includes(target.position ?? "")) {
					// top/middle/bottom の各オフセットで最良を比較して選択
					const options = [
						{ pos: "top", off: 0 },
						{ pos: "middle", off: 1 },
						{ pos: "bottom", off: 2 },
					].map((o) => ({
						...o,
						best: buildBestForOffset(o.off),
					}));
					// ラップしないものを優先、次に距離最小
					options.sort(
						(a, b) =>
							Number(a.best.wraps) - Number(b.best.wraps) ||
							a.best.dist - b.best.dist,
					);
					const sel = options[0];
					chosenPosition = sel.pos;
					targetSymbolTopIndex = sel.best.topIndex;
					baseTargetY = sel.best.baseY;
					animTargetY = sel.best.y;
				} else {
					const offset =
						chosenPosition === "middle"
							? 1
							: chosenPosition === "bottom"
								? 2
								: 0;
					const best = buildBestForOffset(offset);
					targetSymbolTopIndex = best.topIndex;
					baseTargetY = best.baseY;
					animTargetY = best.y;
				}
			} else {
				// 指定が不正または欠落している場合は通常停止処理へフォールバック
				// （再帰呼び出しにより最終的に nearest boundary 停止へ統一される）
				return this.stopReel(index, null);
			}

			// 表示レンジに正規化した最終ターゲット（範囲: -totalHeight .. 0）
			// 正規化式は負値領域へ落とし込むための既定式。変更すると半周ずれる恐れあり。
			const finalTargetYNormalized =
				(((animTargetY % reel.totalHeight!) + reel.totalHeight!) %
					reel.totalHeight!) -
				reel.totalHeight!;

			// 停止に必要な距離を、進行方向に沿って単方向で算出
			let distanceToStop: number;
			if (this.config.reverseRotation) {
				// 下方向に進むため、animTargetY が currentY より小さい（負の差）なら一周分追加して正にする
				distanceToStop = animTargetY - currentY;
				if (distanceToStop < 0) distanceToStop += reel.totalHeight!;
			} else {
				// 上方向に進むため、currentY から animTargetY へ戻る量を正距離として算出
				distanceToStop = currentY - animTargetY;
				if (distanceToStop < 0) distanceToStop += reel.totalHeight!;
			}
			// 距離に基づく停止アニメ時間を共通関数で算出（ここで min/max によるクリッピングも行う）
			duration = this.calculateStopDuration(distanceToStop);

			// さらに上限/下限の二重保護（設定値の暴走を防ぐ）
			duration = Math.min(
				Math.max(duration, this.config.minStopAnimTime),
				this.config.maxStopAnimTime,
			);

			// アニメーション開始
			// デバッグログの追加
			if (this.config.debug?.stopLogs) {
				console.log(`--- stopReel Debug Log for Reel ${index} ---`);
				console.log(`Target:`, target);
				console.log(`Chosen Position: ${chosenPosition}`);
				console.log(`Current Y: ${currentY}px`);
				console.log(`Reel Symbols Length: ${reelSymbols.length}`);
				console.log(`Symbol Height: ${symbolHeight}px`);
				console.log(`Total Height (1x): ${totalHeight}px`);
				console.log(`Target Symbol Top Index: ${targetSymbolTopIndex}`);
				console.log(`Base Target Y: ${baseTargetY}px`);
				console.log(`Closest Target Y (anim): ${animTargetY}px`);
				console.log(`Final Target Y (normalized): ${finalTargetYNormalized}px`);
				console.log(`Distance to Stop: ${distanceToStop}px`);
				console.log(`Animation Duration: ${duration}ms`);
			}
			const startY = currentY;
			const startTime = performance.now();

			const animateStop = (currentTime: number) => {
				const elapsed = currentTime - startTime;
				const progress = Math.min(elapsed / duration, 1);
				const easedProgress = this.getStopEasingFn()(progress);

			// 仮想座標上の進行（前方に単調増加/減少）
			const virtualY = startY + (animTargetY - startY) * easedProgress;
			// 表示用に [-H, 0] へ正規化して適用（フリッカー防止）
			const displayY =
				(((virtualY % totalHeight!) + totalHeight!) % totalHeight!) -
				totalHeight!;
			if (reel.element) {
				reel.element.style.transform = `translateY(${displayY}px)`;
			}				// 追加ログ（デフォルトOFF）
				if (this.config.debug?.frameLogs) {
					console.log(
						`Reel ${index} Stop Anim: startY=${startY.toFixed(2)}px, targetY=${animTargetY.toFixed(2)}px, elapsed=${elapsed.toFixed(2)}ms, progress=${progress.toFixed(2)}, easedProgress=${easedProgress.toFixed(2)}, virtualY=${virtualY.toFixed(2)}px, displayY=${displayY.toFixed(2)}px`,
					);
				}

				if (progress < 1) {
					requestAnimationFrame(animateStop);
				} else {
					// 最終位置は正規化した表示値で確定
					const finalY =
						(((animTargetY % totalHeight!) + totalHeight!) % totalHeight!) -
						totalHeight!;
					reel.element?.style.transform = `translateY(${finalY}px)`;
					reel.spinning = false;
					reel.element?.classList.remove("spinning"); // 回転中クラスを削除
					// 目押しボタンの活性状態を更新（途中停止でも反映）
					try {
						this.updateManualButtonsUI();
					} catch (_e) {}
					// サウンド: リール停止
					try {
						this.soundManager?.playReelStop();
					} catch (_e) {}
					// 右端リール（最後のリール）が停止したタイミングで回転ループを停止する
					try {
						if (index === this.reels.length - 1) this.soundManager?.loopStop();
					} catch (_e) {}
					this.checkAllStopped();
				}
			};
			requestAnimationFrame(animateStop);
			return new Promise<void>((resolve) => {
				const checkDone = () => {
					if (!reel.spinning) resolve();
					else requestAnimationFrame(checkDone);
				};
				checkDone();
			});
		} else {
			// --- 通常停止ロジックをターゲット生成に切り替え ---
			// 次のシンボル位置に停止するためのターゲットを内部的に生成します。
			const symbolHeight = this.config.symbolHeight;
			const totalHeight = reel.totalHeight!;

			// 現在のY座標から、次に最も近いシンボル境界のY座標を計算します。
			let remainder: number;
			if (this.config.reverseRotation) {
				const pos = currentY + totalHeight!;
				remainder = pos % symbolHeight;
			} else {
				const posMod =
					((-currentY % totalHeight!) + totalHeight!) % totalHeight!;
				remainder = posMod % symbolHeight;
			}
			const distanceToNext = (symbolHeight - remainder) % symbolHeight;
			// 停止目標となるY座標
			const targetY =
				currentY +
				(this.config.reverseRotation ? distanceToNext : -distanceToNext);

			// targetYから、その位置に該当するシンボルのインデックスを計算します。
			// Y座標は負の値であるため、-1を掛けて正のインデックスに変換し、リールシンボル数で剰余を取ります。
			const targetSymbolTopIndex =
				Math.round(-targetY / symbolHeight) % reel.symbols.length;

			// 新しいターゲットオブジェクトを作成します。
			// positionは'top'固定とすることで、シンボルが常に上端に揃うようにします。
			const newTarget = {
				reelIndex: index,
				symbolIndex: targetSymbolTopIndex,
				position: "top",
			};

			if (this.config.debug?.stopLogs) {
				console.log(
					`--- stopReel Normal to Target Fallback for Reel ${index} ---`,
				);
				console.log(
					`Current Y: ${currentY}px, Calculated Target Y: ${targetY}px, Target Index: ${targetSymbolTopIndex}`,
				);
				console.log(`Generated Target:`, newTarget);
			}

			// 生成したターゲットで自身を再帰的に呼び出します。
			// これにより、全ての停止処理がターゲットベースのロジックに統一され、挙動の差異がなくなります。
			return this.stopReel(index, newTarget);
		}
	}

	/**
	 * 「目押し」モード中に、プレイヤーがボタンを押した際にリールを1つずつ停止させる関数です。
	 * 自動モード中や、全てのリールが停止済みの場合は何もしません。
	 */
	stopManual() {
		// 互換: スペースキーやスタートボタンからの「次を止める」操作
		if (this.isAutoMode) return; // 自動モードでは無効
		// 左から順に、まだ回っている最初のリールを停止
		const idx = this.reels.findIndex((r) => r.spinning);
		if (idx === -1) return;
		this.stopReel(idx);
		this.manualStopCount = Math.min(
			this.manualStopCount + 1,
			this.config.reelCount,
		);
		this.updateManualButtonsUI();
	}

	/** 個別停止ボタン/1-3キーの処理（回転開始はしない） */
	handleManualStopButton(reelIndex: number) {
		if (this.isAutoMode) return; // 目押しモード以外は無効
		if (!this.isSpinning) return; // 回転中でない場合は無効
		if (reelIndex < 0 || reelIndex >= this.reels.length) return;
		const reel = this.reels[reelIndex];
		if (!reel.spinning) return; // 既に止まっているリールは無視
		this.stopReel(reelIndex);
		this.manualStopCount = Math.min(
			this.manualStopCount + 1,
			this.config.reelCount,
		);
		this.updateManualButtonsUI();
	}

	/** 目押しボタンの活性/非活性を現在状態に合わせて更新 */
	updateManualButtonsUI() {
		const btns = this.ui.elements.stopBtns || [];
		const container = document.getElementById("manualControls");
		// 表示/非表示: モードが目押しのとき常時表示。自動モード時は視覚的には表示してもよいが無効化。
		if (container) {
			container.style.opacity = this.isAutoMode ? "0.6" : "1";
		}
		btns.forEach((btn, i) => {
			if (!(btn instanceof HTMLButtonElement)) return;
			const enabled =
				!this.isAutoMode && this.isSpinning && Boolean(this.reels[i]?.spinning);
			btn.disabled = !enabled;
		});
	}

	/**
	 * 全てのリールが停止したかを確認し、ゲーム終了後の後処理を行います。
	 * 全て停止したら、スタートボタンを再度有効化します。
	 */
	checkAllStopped() {
		// 全てのリールが回転中でないことを確認
		if (this.reels.every((r) => !r.spinning)) {
			this.isSpinning = false; // ゲーム全体が停止状態であることを示す
			// サウンド: 回転ループ停止
			try {
				this.soundManager?.loopStop();
			} catch (_e) {}
			this.ui.setActionBtnText("▶ スタート"); // ボタンテキストを「スタート」に戻す
			this.ui.setActionBtnDisabled(false); // ボタンを有効化
			this.updateManualButtonsUI();

			// 全リール停止後: 当たり判定とペイアウト処理
			let payout = this.evaluatePayout();
			if (payout > 0) {
				// 借金があればまず返済に充てる（全額返済可能な場合は残りを残高へ）
				if (this.debt > 0) {
					const repay = Math.min(this.debt, payout);
					this.debt -= repay;
					payout -= repay;
					this.updateDebtUI();
					console.log(`Debt repaid: ¥${repay}, remaining debt=¥${this.debt}`);
				}
				if (payout > 0) {
					// サウンド: 当たり
					try {
						this.soundManager?.playWin();
					} catch (_e) {}
					this.balance += payout;
					this.updateBalanceUI();
					console.log(`Win! payout=¥${payout}, new balance=¥${this.balance}`);
					// 勝利メッセージを表示
					try {
						this.showWinMessage(payout);
					} catch (_e) {}
					// ゲーム外から視覚フィードバックを付けられるよう、カスタムイベントを発火
					try {
						window.dispatchEvent(
							new CustomEvent("slot:win", { detail: { amount: payout } }),
						);
					} catch (_) {
						/* no-op */
					}
				}
			}

			// 外部制御向け: スロットの回転が完全に停止したことを通知
			try {
				window.dispatchEvent(new CustomEvent("slot:stopped"));
			} catch (_) {
				/* no-op */
			}
		}
	}

	/**
	 * 検出されたリールの停止位置から当たりを評価し、賭け金に対する配当額を返します。
	 * シンプル実装: 横一列（top/middle/bottom）で同一シンボルが揃えば配当。
	 * @returns {number} payout (0 なら外れ)
	 */
	evaluatePayout(): number {
		// 先に各リールの top インデックスを1回ずつ計算して使い回す
		const topIdxPerReel = this.reels.map((r) => {
			const y = this.ui.getCurrentTranslateY(r.element!);
			const len = r.symbols.length;
			return ((Math.round(-y / this.config.symbolHeight) % len) + len) % len;
		});

		const lines = this.getWinningLines();
		const bet = this.currentBet || 0;
		let totalPayout = 0;

		for (const line of lines) {
			const syms = line.map((rowIdx, reelIdx) => {
				const r = this.reels[reelIdx];
				const len = r.symbols.length;
				const visIdx = (topIdxPerReel[reelIdx] + rowIdx) % len;
				return r.symbols[visIdx];
			});
			if (syms.every((s) => s === syms[0])) {
				const mult = this.payoutTable[syms[0]] || 0;
				totalPayout += Math.floor(bet * mult);
			}
		}

		return totalPayout;
	}

	/**
	 * 勝利ラインの定義を返す。
	 * 戻り値は「各ラインにつき、各リールの行インデックス（0=top,1=middle,2=bottom）」の配列。
	 * 例: 3リール時の水平3行 + 斜め2行 => [[0,0,0],[1,1,1],[2,2,2],[0,1,2],[2,1,0]]
	 */
	getWinningLines() {
		const lines = [
			[0, 0, 0],
			[1, 1, 1],
			[2, 2, 2],
		];
		if (this.reels.length === 3) {
			lines.push([0, 1, 2]); // ↘
			lines.push([2, 1, 0]); // ↗
		}
		return lines;
	}

	/**
	 * 残高表示を更新します。
	 */
	updateBalanceUI() {
		const el = document.getElementById("balance");
		if (el) el.textContent = this.formatCurrency(this.balance);
		try {
			this.ui.updateBetConstraints();
		} catch (_e) {}
	}

	/**
	 * 借金表示を更新します。
	 */
	updateDebtUI() {
		const el = document.getElementById("debt");
		if (el) el.textContent = this.formatCurrency(this.debt);
		try {
			this.ui.updateBetConstraints();
		} catch (_e) {}
	}

	/**
	 * 画面中央に当たり金額を大きく表示する。
	 * @param {number} amount - 支払われた金額（整数）
	 * @param {number} [duration=2000] - 表示時間（ms）
	 */
	showWinMessage(amount: number, duration: number = 2000) {
		const el = document.getElementById("winMessage");
		if (!el) return;
		const amt = el.querySelector(".amount");
		if (amt) amt.textContent = `¥${this.formatCurrency(amount)}`;
		el.classList.add("show");
		// 前回のタイマーがあればクリア
		if (this._winMsgTimer) clearTimeout(this._winMsgTimer);
		this._winMsgTimer = setTimeout(() => this.hideWinMessage(), duration);
	}

	hideWinMessage() {
		const el = document.getElementById("winMessage");
		if (!el) return;
		el.classList.remove("show");
		if (this._winMsgTimer) {
			clearTimeout(this._winMsgTimer);
			this._winMsgTimer = null;
		}
	}

	/* --------------------------
	 * Balance <-> Password persistence
	 * - 可逆的な簡易エンコード: UTF-8バイト列を salt バイト列で XOR し、base64url 化する
	 * - salt は gameConfig.persistenceSalt があればそれを使い、なければ既定値を使用
	 * - 目的: 残高を文字列化してユーザーがコピー/保存し、復帰時にその文字列を入力することで残高を復元できる
	 * 注意: この方式は暗号的に強固ではありません。より強い保護が必要なら server-side の署名や Web Crypto を使った HMAC を導入してください。
	 */
	getPersistenceSalt() {
		const cfg = gameConfig as SlotGameConfig;
		if (cfg?.persistenceSalt) return String(cfg.persistenceSalt);
		// デフォルトの salt（将来変更すると復元できなくなるため注意）
		return "GAME-ON-PERSIST-V1";
	}

	_utf8ToBytes(str: string): Uint8Array {
		return new TextEncoder().encode(String(str));
	}

	_bytesToUtf8(bytes: Uint8Array): string {
		return new TextDecoder().decode(bytes);
	}

	_xorWithSalt(bytes: Uint8Array, saltBytes: Uint8Array): Uint8Array {
		const out = new Uint8Array(bytes.length);
		for (let i = 0; i < bytes.length; i++) {
			out[i] = bytes[i] ^ saltBytes[i % saltBytes.length];
		}
		return out;
	}

	_base64UrlEncode(bytes: Uint8Array): string {
		let bin = "";
		for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
		return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}

	_base64UrlDecode(str: string): Uint8Array {
		str = String(str).replace(/-/g, "+").replace(/_/g, "/");
		// パディングを戻す
		while (str.length % 4) str += "=";
		const bin = atob(str);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}

	encodeBalanceToPassword(balance: number): string {
		const obj = { v: 1, b: Math.round(Number(balance) || 0), t: Date.now() };
		const s = JSON.stringify(obj);
		const data = this._utf8ToBytes(s);
		const salt = this._utf8ToBytes(this.getPersistenceSalt());
		const x = this._xorWithSalt(data, salt);
		return this._base64UrlEncode(x);
	}

	decodePasswordToObject(pw: string): { v: number; b: number } | null {
		try {
			const bytes = this._base64UrlDecode(pw);
			const salt = this._utf8ToBytes(this.getPersistenceSalt());
			const dec = this._xorWithSalt(bytes, salt);
			const json = this._bytesToUtf8(dec);
			const obj = JSON.parse(json);
			if (!obj || typeof obj.b !== "number") throw new Error("invalid");
			return obj;
		} catch (_e) {
			throw new Error("パスワードの形式が不正です");
		}
	}

	/**
	 * 現在の残高からパスワード文字列を生成して返す
	 */
	generateBalancePassword() {
		return this.encodeBalanceToPassword(this.balance);
	}

	/**
	 * パスワード文字列から残高を復元する。成功すれば true を返す。
	 */
	restoreFromPassword(pw: string): boolean {
		try {
			const obj = this.decodePasswordToObject(pw);
			// バージョン互換チェック
			if (obj?.v !== 1) throw new Error("unsupported version");
			this.balance = Number(obj?.b) || 0;
			this.updateBalanceUI();
			console.info("Balance restored from password:", this.balance);
			return true;
		} catch (e) {
			console.warn("Restore failed:", e);
			return false;
		}
	}

	/**
	 * 数値を通貨形式（カンマ区切り）に整形します（整数向け）。
	 * @param {number} n
	 * @returns {string}
	 */
	formatCurrency(n: number): string {
		const v = Number(n) || 0;
		return v.toLocaleString();
	}

	/**
	 * 設定された確率に基づいて、次に狙うシンボルを抽選します。
	 * @returns {string} 抽選されたシンボルの文字（例: '🍒'）
	 */
	chooseSymbolByProbability(): string {
		// 推奨: winSymbolWeights = { '7️⃣': 1.0, 'BAR': 0.5, '🍒': 0.2, ... }
		const weights = this.config.winSymbolWeights;
		if (weights && Object.keys(weights).length > 0) {
			// 全リール共通に存在するシンボルのみを対象（揃えられない候補は除外）
			const common = this.reels.reduce(
				(acc, r) => acc.filter((sym: string) => r.symbols.includes(sym)),
				Object.keys(weights),
			);
			const filtered = common.filter((sym: string) => weights[sym] > 0);
			if (filtered.length > 0) {
				// 運任せではなく、最も重みの高いシンボルを優先して選択することで
				// forced（演出による当たり）時に確実に揃えやすくします。
				// ただし、weights の重みが全て等しい場合はランダム選択にフォールバックします。
				let bestSym = filtered[0];
				let bestW = weights[bestSym];
				let allEqual = true;
				for (const sym of filtered) {
					if (weights[sym] > bestW) {
						bestSym = sym;
						bestW = weights[sym];
						allEqual = false;
					} else if (weights[sym] !== bestW) {
						allEqual = false;
					}
				}
				if (!allEqual) {
					return bestSym;
				}
				// 全て同一重みの場合は従来の重み付きランダムで決定
				const total = filtered.reduce(
					(s: number, sym: string) => s + weights[sym],
					0,
				);
				let r = Math.random() * total;
				for (const sym of filtered) {
					r -= weights[sym];
					if (r <= 0) return sym;
				}
				return filtered[filtered.length - 1];
			}
		}
		// フォールバック: 左リールからランダム
		const symbols = this.reels[0].symbols;
		return symbols[Math.floor(Math.random() * symbols.length)];
	}

	/**
	 * 各リールでのシンボル出現確率マップを返す。
	 * @returns {Array<Record<string, number>>}
	 */
	getPerReelSymbolProbs(): Array<Record<string, number>> {
		return this.reels.map((r) => {
			const counts: Record<string, number> = {};
			for (const s of r.symbols) counts[s] = (counts[s] || 0) + 1;
			const total = r.symbols.length;
			const probs: Record<string, number> = {};
			Object.keys(counts).forEach((k) => {
				probs[k] = counts[k] / total;
			});
			return probs;
		});
	}

	/**
	 * リールが停止する際のアニメーション時間を計算します。
	 * 停止までの残り距離と速度に基づいて、滑らかな停止に必要な時間を算出します。
	 * @param {number} distance - 次のシンボル位置までの残り距離 (ピクセル単位)
	 * @returns {number} アニメーション時間 (ミリ秒)。設定された最小・最大値の範囲内に収まります。
	 */
	calculateStopDuration(distance: number): number {
		// 現在のモードに応じた速度（px/frame）
		const speed = this.isAutoMode
			? this.config.autoSpeed
			: this.config.manualSpeed;
		// rAF 60fps を想定して px/frame → px/ms に換算し、イージング導関数(0)でスケール
		const msPerFrame = 1000 / 60;
		const deriv0 = this.getStopEasingDerivative0();
		let time = (distance / speed) * msPerFrame * deriv0;
		// 自動停止時は一定以上の減速時間を確保して体感差を抑える
		if (this.isAutoMode && typeof this.config.stopBaseDurationMs === "number") {
			time = Math.max(time, this.config.stopBaseDurationMs);
		}
		// 設定された最小・最大値の範囲に収まるように調整
		return Math.min(
			Math.max(time, this.config.minStopAnimTime),
			this.config.maxStopAnimTime,
		);
	}

	// 停止用イージングを設定から取得
	getStopEasingFn() {
		switch (this.config.stopEasing) {
			case "linear":
				return this.easeLinear;
			case "quad":
				return this.easeOutQuad;
			case "sine":
				return this.easeOutSine;
			default:
				return this.easeOutCubic;
		}
	}

	// 選択イージングの t=0 での導関数（初速係数）
	getStopEasingDerivative0() {
		switch (this.config.stopEasing) {
			case "linear": // f(t)=t => f'(0)=1
				return 1;
			case "quad": // 1 - (1-t)^2 => d/dt = 2 - 2t, t=0 => 2
				return 2;
			case "sine": // sin(t*pi/2) => d/dt = (pi/2)cos(t*pi/2), t=0 => pi/2
				return Math.PI / 2;
			default: // 1 - (1-t)^3 => d/dt = 3 - 6t + 3t^2, t=0 => 3
				return 3;
		}
	}

	// --- イージング関数 ---
	/**
	 * キュービックイーズイン関数。アニメーションの開始をゆっくりにし、徐々に加速させます。
	 * @param {number} t - 進行度 (0.0 - 1.0)
	 * @returns {number} 補間された値
	 */
	easeInCubic(t: number): number {
		return t * t * t;
	}

	/**
	 * キュービックイーズアウト関数。アニメーションの開始を速くし、徐々に減速させます。
	 * @param {number} t - 進行度 (0.0 - 1.0)
	 * @returns {number} 補間された値
	 */
	easeOutCubic(t: number): number {
		return 1 - (1 - t) ** 3;
	}

	/**
	 * クアドラティック（2次）イーズアウト。
	 */
	easeOutQuad(t: number): number {
		return 1 - (1 - t) * (1 - t);
	}

	/**
	 * サイン型イーズアウト。
	 */
	easeOutSine(t: number): number {
		return Math.sin((t * Math.PI) / 2);
	}

	/**
	 * リニア（直線）イージング。
	 */
	easeLinear(t: number): number {
		return t;
	}
}

// DOMが完全に読み込まれたらゲームを開始する
document.addEventListener("DOMContentLoaded", () => {
	// gameConfigがグローバルに存在することを想定
	// もし存在しない場合は、ここでconfig.jsから読み込むか、定義する必要がある
	// 注意: index.html は defer で config.js → script.js の順に読み込みます。順序を変えると gameConfig 未定義になります。
	const slotMachineElement = document.querySelector(
		gameConfig.selectors.slotMachine,
	);
	if (slotMachineElement) {
		// expose the created instance so external code can drive the slot programmatically
		const _el = slotMachineElement as HTMLElement;
		window.SLOT_GAME_INSTANCE = new SlotGame(_el, gameConfig);
	} else {
		// Non-fatal: when embedded into another app the slot HTML may be injected later by an adapter.
		// Keep SlotGame constructor available so embedder can instantiate programmatically.
		if (console?.debug)
			console.debug(
				"SlotGame: no matching element for",
				gameConfig.selectors.slotMachine,
				"- embedder may create it later.",
			);
	}
});

// Helper for embedders: create a SlotGame inside a container element or selector.
// Usage: window.createSlotIn(containerElementOrSelector, cfg)
const Win = window as Window & typeof globalThis;
Win.createSlotIn = (
	container: Element | string,
	cfg?: Partial<SlotGameConfig>,
) => {
	try {
		let el: Element | string | null = container;
		if (typeof container === "string") {
			const found = document.querySelector(container);
			if (!found) return null;
			el = found;
		}
		if (!el) return null;
		// Prefer the internal `gameConfig` defined in this script if cfg is missing or lacks selectors.
		const isConfValid =
			typeof cfg === "object" && cfg && typeof cfg.selectors === "object";
		const conf = isConfValid ? { ...gameConfig, ...cfg } : { ...gameConfig };

		const inst = new SlotGame(el as HTMLElement, conf as SlotGameConfig);
		window.SLOT_GAME_INSTANCE = inst;
		return inst;
	} catch (e) {
		console.error("createSlotIn failed:", e);
		return null;
	}
};
