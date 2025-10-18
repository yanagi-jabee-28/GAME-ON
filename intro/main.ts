// 音声ファイルのパス一覧
const audioFiles = [
	"assets/01-001_四国めたん（ノーマル）_こちらは、5Eのク….mp3",
	"assets/02-002_四国めたん（ノーマル）_5Eでは創造工学実….mp3",
	"assets/03-003_四国めたん（ノーマル）_創造工学実習とは、….mp3",
	"assets/04-004_四国めたん（ノーマル）_それぞれの想像力を….mp3",
	"assets/05-005_四国めたん（ノーマル）_ぜひお楽しみくださ….mp3",
];

// 音声再生用関数
function playAudio(index: number) {
	// Audioオブジェクトを生成し、再生
	const audio = new Audio(audioFiles[index]);
	audio.play();
}

// 各ボタンにイベントリスナーを設定
for (let i = 0; i < 5; i++) {
	const btn = document.getElementById(`btn${i + 1}`);
	if (btn) {
		btn.addEventListener("click", () => playAudio(i));
	}
}

// 並び替え可能なブロックの順番・間隔でループ再生
let isLooping = false; // ループ再生の状態管理

async function loopPlay() {
	const blockList = document.getElementById("audioBlockList");
	if (!blockList) return;

	isLooping = true;
	const loopBtn = document.getElementById("loopPlay") as HTMLButtonElement;
	if (loopBtn) {
		loopBtn.textContent = "停止";
	}

	// 無限ループで繰り返し再生
	while (isLooping) {
		const blocks = Array.from(blockList.children) as HTMLLIElement[];
		for (let i = 0; i < blocks.length; i++) {
			if (!isLooping) break; // ループ停止時は即座に中断

			const type = blocks[i].getAttribute("data-type");
			if (type === "audio") {
				const idx = Number(blocks[i].dataset.index);
				await playAudioAsync(idx);
			} else if (type === "interval") {
				const intervalInput = blocks[i].querySelector(
					'input[type="number"]',
				) as HTMLInputElement;
				if (intervalInput) {
					await wait(Number(intervalInput.value) * 1000);
				}
			}
		}
	}

	// ループ停止後、ボタンテキストを元に戻す
	if (loopBtn) {
		loopBtn.textContent = "ループ再生";
	}
}

// 間隔ブロック追加・削除UI
const addIntervalBtn = document.getElementById("addIntervalBlock");
if (addIntervalBtn) {
	addIntervalBtn.addEventListener("click", () => {
		const tmpl = document.getElementById(
			"intervalBlockTemplate",
		) as HTMLTemplateElement;
		const blockList = document.getElementById("audioBlockList");
		if (tmpl && blockList) {
			const clone = tmpl.content.cloneNode(true) as HTMLElement;
			blockList.appendChild(clone);
			// 削除ボタンイベント設定
			setTimeout(() => {
				const last = blockList.lastElementChild as HTMLElement;
				if (last) {
					const removeBtn = last.querySelector(".remove-interval");
					if (removeBtn) {
						removeBtn.addEventListener("click", () => last.remove());
					}
				}
			}, 10);
		}
	});
}
// ドラッグ＆ドロップ並び替えUIのイベント設定（音声・間隔両方対応）
const blockList = document.getElementById("audioBlockList");
if (blockList) {
	let dragged: HTMLElement | null = null;
	blockList.addEventListener("dragstart", (e) => {
		const target = e.target as HTMLElement;
		if (
			target.classList.contains("audio-block") ||
			target.classList.contains("interval-block")
		) {
			dragged = target;
			target.classList.add("dragging");
		}
	});
	blockList.addEventListener("dragend", () => {
		if (dragged) dragged.classList.remove("dragging");
		dragged = null;
	});
	blockList.addEventListener("dragover", (e) => {
		e.preventDefault();
		const after = getDragAfterElement(blockList, e.clientY);
		if (dragged && after !== dragged) {
			blockList.insertBefore(dragged, after);
		}
	});
}

// ドラッグ位置判定補助関数
function getDragAfterElement(container: Element, y: number): Element | null {
	const draggableElements = [
		...container.querySelectorAll(
			".audio-block:not(.dragging), .interval-block:not(.dragging)",
		),
	];
	let closest: { offset: number; element: Element | null } = {
		offset: Number.NEGATIVE_INFINITY,
		element: null,
	};
	draggableElements.forEach((el) => {
		const box = el.getBoundingClientRect();
		const offset = y - box.top - box.height / 2;
		if (offset < 0 && offset > closest.offset) {
			closest = { offset, element: el };
		}
	});
	return closest.element;
}

// Promiseで音声再生が終わるまで待つ
function playAudioAsync(index: number): Promise<void> {
	return new Promise((resolve) => {
		const audio = new Audio(audioFiles[index]);
		audio.onended = () => resolve();
		audio.play();
	});
}

// 指定ミリ秒待つ
function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ループ再生ボタンにイベントリスナー
const loopBtn = document.getElementById("loopPlay");
if (loopBtn) {
	loopBtn.addEventListener("click", () => {
		if (isLooping) {
			// ループ中なら停止
			isLooping = false;
		} else {
			// ループ開始
			loopPlay();
		}
	});
}
