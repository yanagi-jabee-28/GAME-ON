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
let isSpinning = false; // スピン中フラグ

// 各リールの現在位置（インデックス）を管理
const reelPositions = [0, 0, 0];

// リールストリップ要素を保持
const reelStrips: HTMLDivElement[] = [];

// アニメーション設定
const SPIN_DURATION = 1000; // スピン全体の時間（ミリ秒）
const SPIN_SPEED = 25; // スピン速度（1フレームあたりの移動ピクセル数）
const STOP_DELAY = 500; // 各リールが止まる間隔（ミリ秒）

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

// リールをアニメーションで回転させる
function startReelSpin(reelIndex: number): Promise<void> {
	return new Promise((resolve) => {
		const strip = reelStrips[reelIndex];
		const reelData = slotConfig.reelsData[reelIndex];
		
		strip.classList.add("spinning");
		strip.style.transition = "none"; // トランジションを無効化
		
		let currentY = 0;
		const maxY = reelData.length * SYMBOL_HEIGHT;
		let animationFrameId: number;
		let velocity = SPIN_SPEED; // 現在の速度
		let isStopping = false;
		let targetY = 0; // 停止目標位置
		let startY = 0; // 減速開始位置
		let decelerationStartTime = 0;
		let lastY = 0; // 前フレームの位置
		const DECELERATION_DURATION = 800; // 減速にかける時間（ミリ秒）
		
		// 高速回転アニメーション
		const animate = (timestamp: number) => {
			if (isStopping) {
				// 減速開始からの経過時間
				const elapsed = timestamp - decelerationStartTime;
				const progress = Math.min(elapsed / DECELERATION_DURATION, 1); // 0～1
				
				// カスタムイージング関数：速度が回転速度を上回らないように調整
				// ease-out cubic を使用し、より強い減速カーブを適用
				const easeOutCubic = 1 - Math.pow(1 - progress, 3);
				
				// 開始位置から目標位置への補間
				const newY = startY + (targetY - startY) * easeOutCubic;
				
				// 前フレームとの差分（瞬間速度）を計算
				const instantSpeed = newY - lastY;
				
				// 速度がSPIN_SPEEDを上回らないように制限
				if (instantSpeed > SPIN_SPEED) {
					currentY = lastY + SPIN_SPEED;
				} else {
					currentY = newY;
				}
				
				lastY = currentY;
				strip.style.transform = `translateY(-${currentY}px)`;
				
				// 目標位置に到達したら終了
				if (progress >= 1 || currentY >= targetY) {
					cancelAnimationFrame(animationFrameId);
					strip.classList.remove("spinning");
					
					// 最終的な停止位置に正規化
					const normalizedY = targetY % maxY;
					strip.style.transform = `translateY(-${normalizedY}px)`;
					resolve();
					return;
				}
			} else {
				// 通常の高速回転
				currentY += velocity;
				// 無限ループのように見せるため、リールデータの長さを超えたら巻き戻す
				if (currentY >= maxY) {
					currentY = currentY % maxY;
				}
				strip.style.transform = `translateY(-${currentY}px)`;
			}
			
			animationFrameId = requestAnimationFrame(animate);
		};
		
		animationFrameId = requestAnimationFrame(animate);
		
		// 指定時間後に減速開始
		const stopDelay = SPIN_DURATION + (reelIndex * STOP_DELAY);
		setTimeout(() => {
			// 次の論理位置に進める
			advanceReel(reelIndex);
			
			// 停止位置（インデックス）とターゲットYを計算
			const targetPosition = reelPositions[reelIndex];
			const offset = (targetPosition + reelData.length - 1) % reelData.length;
			const baseTargetY = offset * SYMBOL_HEIGHT;
			
			// 現在位置から目標位置までの距離を計算
			const transform = strip.style.transform || "";
			const m = /translateY\(-?(\d+(?:\.\d+)?)px\)/.exec(transform);
			const currentYSnapshot = m ? Number(m[1]) : 0;
			
			// 目標Yは回転方向に合わせて選ぶ（最低でも1回転分は進む）
			targetY = baseTargetY;
			if (targetY <= currentYSnapshot) {
				targetY += maxY; // 次のサイクル分前進して停止
			}
			
			// さらに、減速時間と速度を考慮して、適切な距離を確保
			// 平均速度を計算：SPIN_SPEEDから始まって0まで減速
			// ease-out cubic の場合、平均速度は約 SPIN_SPEED * 0.4
			const estimatedFrames = (DECELERATION_DURATION / 1000) * 60; // 60fps想定
			const estimatedDistance = SPIN_SPEED * 0.4 * estimatedFrames;
			const requiredDistance = Math.max(estimatedDistance, maxY * 0.5);
			
			while (targetY - currentYSnapshot < requiredDistance) {
				targetY += maxY;
			}
			
			// 現在位置を保存（減速開始位置）
			startY = currentYSnapshot;
			currentY = currentYSnapshot;
			lastY = currentYSnapshot;
			
			// 減速開始
			isStopping = true;
			decelerationStartTime = performance.now();
		}, stopDelay);
	});
}

async function spin() {
	if (isSpinning) return;
	
	if (balance < currentBet) {
		alert("残高不足です");
		return;
	}
	
	isSpinning = true;
	spinBtn.disabled = true;
	payoutResult.textContent = "";
	
	balance -= currentBet;
	updateBalanceDisplay();
	
	// 全リールのスピンアニメーションを開始（並列実行）
	const spinPromises = reels.map((_, index) => startReelSpin(index));
	
	// 全リールが停止するまで待機
	await Promise.all(spinPromises);
	
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
	
	isSpinning = false;
	spinBtn.disabled = false;
}

spinBtn.addEventListener("click", spin);

// 初期化
initializeReelStrips();

// 初期位置を設定（各リールとも18番目のインデックス）
const INITIAL_REEL_POSITION = 18;
reels.forEach((_, index) => {
	const reelData = slotConfig.reelsData[index];
	// リールデータの長さを超えないように調整
	reelPositions[index] = INITIAL_REEL_POSITION % reelData.length;
	updateReelDisplay(index);
});

setBet(slotConfig.minBet);
updateBalanceDisplay();
