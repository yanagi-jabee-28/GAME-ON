// SLOT-3 スロットゲーム最小ロジック
import { type SlotSymbol, slotConfig } from "./config";

const SYMBOL_HEIGHT = 120; // CSS変数 --symbol-height と同じ値
// const VISIBLE_SYMBOLS = 3; // 表示するシンボルの数（3×3）- 将来的に使用

const reelIds = ["reel-1", "reel-2", "reel-3"] as const;
const reelElements = reelIds.map((id) => document.getElementById(id));
const spinButton = document.getElementById("spin-btn");
const betLabel = document.getElementById("bet");
const balanceLabel = document.getElementById("balance");
const payoutArea = document.getElementById("payout-area");

if (
	reelElements.some((reel) => !(reel instanceof HTMLDivElement)) ||
	!(spinButton instanceof HTMLButtonElement) ||
	!(betLabel instanceof HTMLElement) ||
	!(balanceLabel instanceof HTMLElement) ||
	!(payoutArea instanceof HTMLElement)
) {
	throw new Error("SLOT-3: 必須のDOM要素が見つかりません。");
}

const reels = reelElements as HTMLDivElement[];
const spinBtn = spinButton;
const betSpan = betLabel;
const balanceSpan = balanceLabel;
const payoutResult = payoutArea;

let balance = slotConfig.defaultBalance;
let currentBet = slotConfig.minBet;

// 各リールの現在位置（インデックス）を管理
const reelPositions = [0, 0, 0];

// リールストリップ要素を保持
const reelStrips: HTMLDivElement[] = [];

const updateBalanceDisplay = () => {
	balanceSpan.textContent = balance.toString();
};

const setBet = (value: number) => {
	const normalized = Math.min(
		Math.max(value, slotConfig.minBet),
		slotConfig.maxBet,
	);
	currentBet = normalized;
	betSpan.textContent = normalized.toString();
};

// リールストリップを初期化（各リールに全シンボルを配置）
function initializeReelStrips() {
	reels.forEach((reel, reelIndex) => {
		const strip = reel.querySelector(".reel-strip") as HTMLDivElement;
		if (!strip) throw new Error(`リール ${reelIndex} のストリップが見つかりません`);
		
		reelStrips.push(strip);
		const reelData = slotConfig.reelsData[reelIndex];
		
		// リールデータを3回繰り返して連続性を確保
		const extendedData = [...reelData, ...reelData, ...reelData];
		extendedData.forEach((symbol) => {
			const symbolDiv = document.createElement("div");
			symbolDiv.className = "reel-symbol";
			symbolDiv.textContent = symbol;
			strip.appendChild(symbolDiv);
		});
	});
}

// リールの表示位置を更新（中央の3シンボルが表示されるように）
function updateReelDisplay(reelIndex: number) {
	const strip = reelStrips[reelIndex];
	const position = reelPositions[reelIndex];
	const reelData = slotConfig.reelsData[reelIndex];
	
	// 中央のシンボルを基準に上下1つずつ表示（計3つ）
	// position は中央に表示するシンボルのインデックス
	const offset = (position + reelData.length - 1) % reelData.length;
	const translateY = -(offset * SYMBOL_HEIGHT);
	strip.style.transform = `translateY(${translateY}px)`;
}

// 指定リールから次の位置に進める
function advanceReel(reelIndex: number) {
	const reelData = slotConfig.reelsData[reelIndex];
	reelPositions[reelIndex] = (reelPositions[reelIndex] + 1) % reelData.length;
}

// 中央ラインのシンボルを取得（各リールの中央）
function getCenterLineSymbols(): SlotSymbol[] {
	return reels.map((_, index) => {
		const reelData = slotConfig.reelsData[index];
		return reelData[reelPositions[index]];
	});
}

function spin() {
	if (balance < currentBet) {
		alert("残高不足です");
		return;
	}
	balance -= currentBet;
	updateBalanceDisplay();
	
	// 各リールを次の位置に進める
	reels.forEach((_, index) => {
		advanceReel(index);
		updateReelDisplay(index);
	});
	
	// 中央ライン判定
	const centerLine = getCenterLineSymbols();
	const [first, second, third] = centerLine;
	const win = first === second && second === third;
	
	if (win && first) {
		const payoutMultiplier = slotConfig.payouts[first];
		const payout = payoutMultiplier * currentBet;
		balance += payout;
		updateBalanceDisplay();
		payoutResult.textContent = `WIN! 配当: ${payout}`;
	} else {
		payoutResult.textContent = "";
	}
}

spinBtn.addEventListener("click", spin);

// 初期化
initializeReelStrips();
reels.forEach((_, index) => {
	reelPositions[index] = 0;
	updateReelDisplay(index);
});

setBet(slotConfig.minBet);
updateBalanceDisplay();
