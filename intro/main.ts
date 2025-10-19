// Vite経由で扱うためにアセットをimport（ビルド後のパス解決が正しく行われる）
// 動的に assets 内の mp3 をすべて読み込む。ファイル名に特殊文字が含まれていても glob を使えば解決できる。
const audioModules = import.meta.glob("./assets/*.mp3", {
	eager: true,
	as: "url",
}) as Record<string, string>;
// ファイル名の先頭が番号になっているため、キーをソートして順序を保証する
const audioFiles = Object.keys(audioModules)
	.sort()
	.map((k) => audioModules[k]);

// 音声ファイルを事前にプリロードしてキャッシュ（頭切れ防止）
const preloadedAudios: HTMLAudioElement[] = [];
audioFiles.forEach((url) => {
	const audio = new Audio(url);
	audio.preload = "auto";
	audio.load();
	preloadedAudios.push(audio);
});

// 再生中のAudioインスタンスを管理
let playingAudios: HTMLAudioElement[] = [];
// ブラウザの自動再生ポリシーに対応するため、ユーザー操作でオーディオコンテキストをアンロックする
let audioUnlocked = false;
async function ensureAudioUnlocked(): Promise<void> {
	if (audioUnlocked) return;
	// Chromeなどはユーザー操作時にのみ再生を許可する
	try {
		const a = new Audio();
		// 空のデータを再生してみて失敗しなければアンロック
		await a
			.play()
			.catch(() => Promise.reject(new Error("user-gesture required")));
		// 再生できたら停止して巻き戻す
		a.pause();
		a.currentTime = 0;
		audioUnlocked = true;
	} catch {
		// ユーザー操作が必要
		// 何もしない。再生ボタンがユーザー操作として呼ばれるときに再試行される
	}
}

function playAudio(index: number) {
	ensureAudioUnlocked();
	const audio = new Audio(audioFiles[index]);
	audio.preload = "auto";
	playingAudios.push(audio);
	audio.load();

	// より確実な再生のため、loadeddataイベントを待つ
	const attemptPlay = () => {
		audio.play().catch((err) => {
			console.warn("Audio play blocked, will wait for user gesture", err);
		});
	};

	if (audio.readyState >= 2) {
		// すでに読み込み済みなら即座に再生
		attemptPlay();
	} else {
		// loadeddataイベントを待って再生（canplaythroughより早く発火）
		audio.addEventListener("loadeddata", attemptPlay, { once: true });
	}

	// 再生終了時にplayingAudiosから除去
	audio.onended = () => {
		playingAudios = playingAudios.filter((a) => a !== audio);
	};
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
		ensureAudioUnlocked();
		const audio = new Audio(audioFiles[index]);
		audio.preload = "auto";
		playingAudios.push(audio);
		audio.load();

		const attemptPlay = () => {
			audio.play();
		};

		if (audio.readyState >= 2) {
			// すでに読み込み済みなら即座に再生
			attemptPlay();
		} else {
			// loadeddataイベントを待って再生
			audio.addEventListener("loadeddata", attemptPlay, { once: true });
		}

		audio.onended = () => {
			playingAudios = playingAudios.filter((a) => a !== audio);
			resolve();
		};
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
			// 再生中の音声を即座に停止
			playingAudios.forEach((a) => {
				a.pause();
				a.currentTime = 0;
			});
			playingAudios = [];
			// 停止直後にボタンテキストを即座に戻す
			loopBtn.textContent = "ループ再生";
		} else {
			// ループ開始
			loopPlay();
		}
	});
}
