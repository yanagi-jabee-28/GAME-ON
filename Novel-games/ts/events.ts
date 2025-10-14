/**
 * @file events.js
 * @description ゲーム内イベントの処理を記述するファイル
 * シナリオイベントやランダムイベントなどを関数として定義します。
 */

import { CONFIG } from "./config.ts";
import type {
	EventActionId,
	EventChanges,
	EventData,
	RandomEventChoiceEntry,
	RandomEventConsequencesEntry,
	RandomEventEntry,
	RandomEventProbabilityOutcome,
} from "./eventsData.ts";
import { EVENTS } from "./eventsData.ts";
import type { GameManager } from "./gameManager.ts";
import type { ItemId } from "./items.ts";
import { ITEMS } from "./items.ts";
import type { UIManager } from "./ui.ts";

declare const ui: UIManager;
declare const gameManager: GameManager;

type ShopId = keyof typeof CONFIG.SHOPS;
type ChangeInput = Parameters<GameManager["applyChanges"]>[0];

const normalizeEventChanges = (changes: EventChanges): ChangeInput => {
	const normalized: EventChanges = {
		...changes,
		stats: changes.stats ? { ...changes.stats } : undefined,
	};

	if (typeof normalized.connections === "number") {
		normalized.cp = (normalized.cp ?? 0) + normalized.connections;
		delete (normalized as { connections?: number }).connections;
	}

	(["physical", "mental", "technical", "academic"] as const).forEach((key) => {
		const value = normalized[key];
		if (typeof value === "number") {
			const current = normalized.stats?.[key] ?? 0;
			normalized.stats = {
				...normalized.stats,
				[key]: current + value,
			};
			delete normalized[key];
		}
	});

	if (typeof normalized.condition === "number") {
		const current = normalized.stats?.condition ?? 0;
		normalized.stats = {
			...normalized.stats,
			condition: current + normalized.condition,
		};
		delete normalized.condition;
	}

	if (normalized.stats && Object.keys(normalized.stats).length === 0) {
		delete normalized.stats;
	}

	delete normalized.itemsRemove;

	return normalized as ChangeInput;
};

export const GameEventManager = {
	lastCheckedDay: 1, // 日付変更時の回復メッセージ表示用
	// 自由行動（選択肢表示）フラグ。メニューを開けるかどうかの判定に使う。
	isInFreeAction: false,

	/**
	 * 汎用的な行動実行関数
	 * @param actionId config.jsのEVENTSに定義されたアクションID
	 */
	executeAction: async function (actionId: EventActionId) {
		// 行動が始まるので自由行動フラグを下ろす
		this.isInFreeAction = false;
		const eventData = EVENTS[actionId] as EventData | undefined;
		if (!eventData) {
			console.error(`Action data not found for ID: ${actionId}`);
			return;
		}

		// メッセージ表示
		if (eventData.message) {
			const speaker = eventData.noSpeaker
				? undefined
				: eventData.name || "システム";
			ui.displayMessage(eventData.message, speaker);
			await ui.waitForClick();
		}

		// ステータス変動
		if (eventData.changes) {
			const normalizedChanges = normalizeEventChanges(eventData.changes);
			// applyChanges の内部表示は呼び出し側で制御して
			// 明示的にメッセージを表示・待機するようにする
			const msgs =
				gameManager.applyChanges(normalizedChanges, {
					suppressDisplay: true,
				}) || [];
			ui.updateStatusDisplay(gameManager.getStatus());
			if (msgs.length > 0) {
				ui.displayMessage(msgs.join("\n"), "システム");
				if (typeof ui.waitForClick === "function") await ui.waitForClick();
			}
		}

		// 行動後のメッセージ表示 (eventData.afterMessage)
		if (eventData.afterMessage) {
			const afterSpeaker =
				eventData.noSpeakerForAfterMessage || eventData.noSpeaker
					? undefined
					: eventData.name || "システム";
			ui.displayMessage(eventData.afterMessage, afterSpeaker);
			await ui.waitForClick();
		}

		// ターンを進める
		// 次の処理へ（必要なクリック待ちは個々の表示で行っているためここでは直接進める）
		await gameManager.nextTurn();
		ui.updateStatusDisplay(gameManager.getStatus());

		// 日付が変わったかチェックし、回復処理とメッセージ表示
		await this.checkAndApplyDailyRecovery();

		// 次の行動へ
		if (eventData.nextAction === "showMainActions") {
			this.showMainActions();
		}
		// TODO: 他の nextAction の種類も考慮する
	},

	/**
	 * イベントデータを受け取り、メッセージ表示とステータス変化を同期的に実行する。
	 * この関数はターン進行を直接行わないため、呼び出し側で nextTurn を制御できます。
	 * @param eventData { message, name?, changes?, afterMessage? }
	 */
	executeEventInline: async function (eventData: EventData | undefined) {
		this.isInFreeAction = false;
		if (!eventData) return;

		if (eventData.message) {
			const speaker = eventData.noSpeaker
				? undefined
				: eventData.name || "システム";
			ui.displayMessage(eventData.message, speaker);
			await ui.waitForClick();
		}

		if (eventData.changes) {
			// applyChanges 側で表示制御が可能なのでここでは通常通り適用する
			// suppress display in applyChanges and show messages here so the
			// caller controls the click-wait timing and the player sees the
			// money/stat deltas clearly.
			const normalized = normalizeEventChanges(eventData.changes);
			const msgs =
				gameManager.applyChanges(normalized, { suppressDisplay: true }) || [];
			ui.updateStatusDisplay(gameManager.getStatus());
			if (msgs.length > 0) {
				ui.displayMessage(msgs.join("\n"), "システム");
				if (typeof ui.waitForClick === "function") await ui.waitForClick();
			}
		}

		if (eventData.afterMessage) {
			const afterSpeaker =
				eventData.noSpeakerForAfterMessage || eventData.noSpeaker
					? undefined
					: eventData.name || "システム";
			ui.displayMessage(eventData.afterMessage, afterSpeaker);
			await ui.waitForClick();
		}
	},

	/**
	 * 汎用的に changes を受け取りイベントとして実行するラッパー。
	 * gameManager など外部からはこの関数を通してイベント表示と changes を適用する。
	 * @param {{ name?:string, message?:string, changes?:object, afterMessage?:string }} eventData
	 */
	performChangesEvent: async function (eventData: EventData | undefined) {
		// イベントとしての実行は executeEventInline に委譲
		try {
			await this.executeEventInline(eventData);
		} catch (e) {
			console.warn("performChangesEvent failed", e);
			// フォールバック: 直接 applyChanges を呼ぶ
			if (eventData?.changes) {
				const normalized = normalizeEventChanges(eventData.changes);
				gameManager.applyChanges(normalized);
				if (typeof ui.waitForClick === "function") await ui.waitForClick();
			}
		}
	},

	/**
	 * 日付が変わったかチェックし、回復処理とメッセージ表示を行う共通関数
	 */
	checkAndApplyDailyRecovery: async function () {
		const currentStatus = gameManager.getStatus();
		if (
			currentStatus.turnIndex === 0 &&
			currentStatus.day > this.lastCheckedDay
		) {
			ui.displayMessage("夜が明け、新しい一日が始まりました。"); // 導入メッセージ（発話者オフ）
			await ui.waitForClick();

			// 回復処理（体力と精神力を少し回復）
			// applyChanges を使って差分メッセージを取得し、他のステータス変化
			// と同じフォーマットで表示する。
			const recovery = { stats: { physical: 4, mental: 3 } };
			const msgs =
				typeof gameManager.applyChanges === "function"
					? gameManager.applyChanges(recovery, { suppressDisplay: true })
					: [];
			ui.updateStatusDisplay(gameManager.getStatus()); // 回復後のステータスを更新
			if (msgs && msgs.length > 0) {
				ui.displayMessage(msgs.join("\n"), "システム");
				if (typeof ui.waitForClick === "function") await ui.waitForClick();
			}
			this.lastCheckedDay = currentStatus.day; // 日付を更新
		}
	},

	/**
	 * ゲーム開始時のイベント
	 */
	startGame: async function () {
		ui.displayMessage("目が覚めると、見慣れた寮の天井が目に入った。", "主人公");
		await ui.waitForClick();

		// TODO: ここから初期設定診断のイベントを開始する

		ui.displayMessage("（これからどうしようか...）");
		// 最初の行動選択へ
		this.showMainActions();
	},

	/**
	 * そのターンで実行可能な行動の選択肢を表示する
	 */
	showMainActions: function () {
		const status = gameManager.getStatus();
		// ゲームオーバー時は通常の選択肢を表示せず、ゲームオーバー処理へ
		if (status?.gameOver) {
			if (typeof this.triggerGameOver === "function") this.triggerGameOver();
			return;
		}
		const turnName = gameManager.getCurrentTurnName();

		ui.displayMessage(`今日は何をしようか... (${turnName})`, "主人公");
		// 自由行動選択肢を表示している間はメニューを開ける
		this.isInFreeAction = true;

		// ここでターンの種類や状況に応じて選択肢を動的に変更する
		// 午前かつ平日（月〜金）の場合、授業ターンとして専用の選択肢を出す
		const weekday =
			typeof gameManager.getWeekdayName === "function"
				? gameManager.getWeekdayName()
				: "";
		const isWeekday = ["月", "火", "水", "木", "金"].includes(weekday);

		if (turnName === "午前" && isWeekday) {
			const choices = [
				{ text: "授業に集中する", callback: () => this.doAttendClass() },
				{ text: "授業中に内職する", callback: () => this.doMoonlightWork() },
				{ text: "授業中に居眠りする", callback: () => this.doDozeOff() },
				{ text: "授業中に隠れて遊ぶ", callback: () => this.doHidePlay() },
			];

			ui.displayChoices(choices);
			return;
		}

		const choices = [
			{
				text: "勉強する",
				callback: () => this.doStudy(),
			},
			{
				text: "レポートを進める",
				callback: () => this.doReport(),
			},
			{
				text: "バイトに行く",
				callback: () => this.doWork(),
			},
			{
				text: "休む",
				callback: () => this.doRest(),
			},
		];

		// 追加: 土日午前でもスーパーに行けるようにする
		if (turnName === "午前" && ["土", "日"].includes(weekday)) {
			const shop = CONFIG.SHOPS.supermarket;
			const shopLabel = shop.label || "スーパー";
			choices.push({
				text: `${shopLabel}に行く`,
				callback: () => this.openShop("supermarket"),
			});
		}

		// 放課後（TURNS の '放課後'）なら購買/スーパーに行く選択肢を追加
		if (turnName === "放課後") {
			// 土日はスーパーに行くようにする
			const shopId = ["土", "日"].includes(weekday) ? "supermarket" : "school";
			const shopLabel = CONFIG.SHOPS[shopId]?.label || "購買";
			choices.push({
				text: `${shopLabel}に行く`,
				callback: () => this.openShop(shopId),
			});
		}

		// 夜ならコンビニへ行く選択肢を追加
		if (turnName === "夜") {
			choices.push({
				text: "コンビニに行く",
				callback: () => this.goToConveni(),
			});
		}

		ui.displayChoices(choices);
	},

	/**
	 * 学校の購買に行く（放課後の行動）
	 */
	goToSchoolShop: async function () {
		return await this.openShop("school");
	},

	/**
	 * 汎用ショップオープン関数
	 * @param {string} shopId
	 */
	openShop: async function (shopId: ShopId) {
		this.isInFreeAction = false;
		const shop = CONFIG.SHOPS[shopId];
		if (!shop) {
			ui.displayMessage("そのお店は現在利用できません。", "システム");
			await ui.waitForClick();
			this.showMainActions();
			return;
		}

		// 履歴に「ショップ訪問」を記録
		gameManager.addHistory({
			type: "shop_visit",
			detail: { shopId: shopId, shopLabel: shop.label },
		});

		// Show prompt above choices (do not wait for click so message stays visible while choices are shown)
		ui.displayMessage(`${shop.label}に行ってみよう。何を買う？`, "主人公");

		const items = (shop.items ?? []) as ItemId[];
		const unit = CONFIG.LABELS.currencyUnit;
		const choices = items.map((id: ItemId) => ({
			text: `${ITEMS[id].name} - ${ITEMS[id].price}${unit}`,
			callback: async () => {
				await this.attemptPurchase(id, shopId);
			},
		}));
		choices.push({
			text: "買わない",
			callback: async () => {
				// 履歴に「買わずに退店」を記録
				gameManager.addHistory({
					type: "shop_leave",
					detail: { shopId: shopId, purchased: false },
				});
				this.showMainActions();
			},
		});

		ui.displayChoices(choices);
	},

	/**
	 * コンビニに行く（夜の行動）
	 */
	goToConveni: async function () {
		return await this.openShop("conveni");
	},

	/**
	 * 購入処理の共通化
	 * @param {string} itemId
	 */
	attemptPurchase: async function (itemId: ItemId, shopId: ShopId) {
		const item = ITEMS[itemId];
		if (!item) return;

		const status = gameManager.getStatus();
		console.log(
			`Attempting purchase: ${itemId} (${item.name}) price=${item.price}, playerMoney=${status.money}`,
		);
		if (status.money < item.price) {
			ui.displayMessage("所持金が足りません。", "システム");
			await ui.waitForClick();
			this.showMainActions();
			return;
		}

		// お金を減らしてアイテムを所持に追加し、差分メッセージを受け取る
		const msgs = gameManager.applyChanges({
			money: -item.price,
			itemsAdd: [itemId],
		});
		console.log(
			`Purchase applied: -${item.price}. New money: ${gameManager.getStatus().money}`,
		);

		// 購入履歴を残す
		if (
			typeof gameManager !== "undefined" &&
			typeof gameManager.addHistory === "function"
		) {
			gameManager.addHistory({
				type: "purchase",
				detail: {
					itemId: itemId,
					itemName: item.name,
					price: item.price,
					shopId: shopId,
				},
			});
			// 購入したので退店履歴を更新（購入あり）
			gameManager.addHistory({
				type: "shop_leave",
				detail: {
					shopId: shopId,
					purchased: true,
					itemId: itemId,
					price: item.price,
				},
			});
		}

		// 差分メッセージがあれば表示
		if (msgs.length > 0) {
			ui.displayMessage(msgs.join("\n"), "システム");
			await ui.waitForClick();
		}

		// 購入後はターンを進める
		await gameManager.nextTurn();
		ui.updateStatusDisplay(gameManager.getStatus());
		await this.checkAndApplyDailyRecovery();
		this.showMainActions();
	},

	// --- 授業ターン用の行動 ---
	doAttendClass: async function () {
		await this.executeAction("ATTEND_CLASS_ACTION");
	},

	doMoonlightWork: async function () {
		ui.displayMessage(
			"授業中に内職（レポートを進める）をする。授業の時間を使ってレポートを進めよう。",
		);
		await ui.waitForClick();

		// 内職は「レポートを進める」と同等の処理にする
		await this.doReport();
	},

	doDozeOff: async function () {
		await this.executeAction("DOZE_OFF_ACTION");
	},

	doHidePlay: async function () {
		await this.executeAction("HIDE_PLAY_ACTION");
	},

	// --- 以下、各行動の処理 --- //

	/**
	 * 「勉強する」を選択したときの処理
	 */
	doStudy: async function () {
		await this.executeAction("STUDY_ACTION");
	},

	/**
	 * 「バイトに行く」を選択したときの処理
	 */
	doWork: async function () {
		await this.executeAction("WORK_ACTION");
	},

	/**
	 * 「休む」を選択したときの処理
	 */
	doRest: async function () {
		await this.executeAction("REST_ACTION");
	},

	/**
	 * 「レポートを進める」を選択したときの処理
	 */
	doReport: async function () {
		console.log("[doReport] enter");
		this.isInFreeAction = false;
		const reports = gameManager.getReports
			? gameManager.getReports()
			: gameManager.getStatus().reports || [];
		console.log("[doReport] reports:", reports);

		if (reports.length === 0) {
			ui.displayMessage("現在、進行中のレポートはありません。");
			await ui.waitForClick();
			this.showMainActions(); // やることがないのでメインアクションに戻る
			return;
		}

		const eventData = EVENTS.REPORT_ACTION;
		console.log(
			"[doReport] eventData exists:",
			!!eventData,
			"message:",
			eventData?.message,
		);
		// まずイベント本文を表示してクリック待ち
		if (eventData?.message) {
			console.log("[doReport] show intro message");
			ui.displayMessage(eventData.message);
		} else {
			console.log("[doReport] show default intro message");
			ui.displayMessage("溜まっているレポートを片付けないと...");
		}
		await ui.waitForClick();
		console.log("[doReport] after intro click");

		// クリック後、選択肢の上に残る案内を表示して選択肢を出す（ここでは await しない）
		const prompt = "どのレポートを進める？";
		try {
			console.log("[doReport] display prompt");
			ui.displayMessage(prompt, "システム");
		} catch (e) {
			console.error("[doReport] display prompt error", e);
		}

		// 選択肢イベントとして、どのレポートを進めるかプレイヤーに選ばせる
		console.log("[doReport] build choices:", reports.length);
		const choices = reports.map((r) => ({
			text: `${r.title} （${r.progress}/${r.required}）`,
			callback: async () => {
				console.log("[doReport.choice] selected:", r.id, r.title);
				this.isInFreeAction = false;
				ui.displayMessage(
					`${r.title} を進めます（${r.progress}/${r.required}）`,
				);
				if (typeof ui.waitForClick === "function") await ui.waitForClick();
				// 進行処理
				console.log("[doReport.choice] progressReport start");
				const progressResult = gameManager.progressReport(r.id, 1);
				console.log("[doReport.choice] progressReport result:", progressResult);
				// progressResult: { message, changeMsgs }
				if (progressResult?.message) {
					ui.displayMessage(progressResult.message, "システム");
					if (typeof ui.waitForClick === "function") await ui.waitForClick();
				}
				// レポート進捗によるステータス変化（report.changeMsgs）とイベント側の changes をまとめて表示
				const combinedMsgs = [];
				if (
					progressResult?.changeMsgs &&
					Array.isArray(progressResult.changeMsgs) &&
					progressResult.changeMsgs.length > 0
				) {
					combinedMsgs.push(...progressResult.changeMsgs);
				}
				if (eventData?.changes) {
					console.log("[doReport.choice] apply changes:", eventData.changes);
					const normalized = normalizeEventChanges(eventData.changes);
					const msgs =
						gameManager.applyChanges(normalized, {
							suppressDisplay: true,
						}) || [];
					ui.updateStatusDisplay(gameManager.getStatus());
					if (msgs.length > 0) combinedMsgs.push(...msgs);
				}
				if (combinedMsgs.length > 0) {
					ui.displayMessage(combinedMsgs.join("\n"), "システム");
					if (typeof ui.waitForClick === "function") await ui.waitForClick();
				}
				// ターンを進める
				console.log("[doReport.choice] nextTurn");
				await gameManager.nextTurn();
				ui.updateStatusDisplay(gameManager.getStatus());
				await this.checkAndApplyDailyRecovery();
				this.showMainActions();
			},
		}));
		choices.push({
			text: "やめる",
			callback: async () => {
				console.log("[doReport.choice] cancel");
				this.showMainActions();
			},
		});
		ui.displayChoices(choices);
		console.log("[doReport] choices displayed");
		// 念のため、選択肢描画直後にも案内を表示しておく（別処理で消えてしまうのを防ぐ）
		try {
			console.log("[doReport] re-display prompt");
			ui.displayMessage("どのレポートを進める？", "システム");
		} catch (e) {
			console.error("[doReport] re-display prompt error", e);
		}
	},

	// TODO: 今後、ランダムイベントなどをここに追加していく

	/**
	 * ランダムイベントを処理する汎用関数
	 * @param eventData eventsData.ts の RANDOM_EVENTS で定義されたイベントデータ
	 */
	handleRandomEvent: async function (eventData: RandomEventEntry) {
		this.isInFreeAction = false; // イベント中は自由行動を制限

		// イベントメッセージの表示
		if (eventData.message) {
			ui.displayMessage(eventData.message, eventData.name); // イベント名をキャラクター名として表示
			await ui.waitForClick();
		}

		// 選択肢の表示
		if (eventData.choices && eventData.choices.length > 0) {
			const choices = eventData.choices.map((choice) => ({
				text: choice.text,
				callback: async () => {
					// 選択肢の結果を処理
					await this.processRandomEventChoice(
						eventData.id,
						choice.text,
						choice.consequences,
					); // eventData.id と choice.text を追加
					// 選択履歴を記録
					gameManager.recordChoice(choice.text); // 拡張された addHistory を利用
					// ターンを進める
					await gameManager.nextTurn();
					ui.updateStatusDisplay(gameManager.getStatus());
					await this.checkAndApplyDailyRecovery();
					this.showMainActions(); // メインアクションに戻る
				},
			}));
			ui.displayChoices(choices);
		} else {
			// 選択肢がない場合（直接結果が適用されるイベント）
			// TODO: 直接結果を適用するロジックをここに追加する
			// 現時点ではランダムイベントは選択肢を持つ前提で進める
			console.warn(
				`Random event ${eventData.id} has no choices. Direct consequence handling not yet implemented.`,
			);
			// ターンを進める
			await gameManager.nextTurn();
			ui.updateStatusDisplay(gameManager.getStatus());
			await this.checkAndApplyDailyRecovery();
			this.showMainActions(); // メインアクションに戻る
		}
	},

	/**
	 * ランダムイベントの選択肢の結果を処理する
	 * @param eventId イベントのID
	 * @param choiceText 選択された選択肢のテキスト
	 * @param consequences 選択肢の結果データ
	 */
	processRandomEventChoice: async (
		eventId: RandomEventEntry["id"],
		choiceText: RandomEventChoiceEntry["text"],
		consequences: RandomEventConsequencesEntry,
	) => {
		if ("probability" in consequences) {
			const outcome = consequences as RandomEventProbabilityOutcome;
			const rand = Math.random();
			if (rand < outcome.probability) {
				if (outcome.success.message) {
					ui.displayMessage(outcome.success.message, "システム");
					await ui.waitForClick();
				}
				if (outcome.success.changes) {
					const normalized = normalizeEventChanges(outcome.success.changes);
					const msgs = gameManager.applyChanges(normalized) || [];
					if (msgs.length > 0) {
						ui.displayMessage(msgs.join("\n"), "システム");
						await ui.waitForClick();
					}
					gameManager.addHistory({
						type: "random_event_result",
						eventId,
						choiceId: choiceText,
						result: "success",
						changes: outcome.success.changes,
					});
				}
			} else {
				if (outcome.failure.message) {
					ui.displayMessage(outcome.failure.message, "システム");
					await ui.waitForClick();
				}
				if (outcome.failure.changes) {
					const normalized = normalizeEventChanges(outcome.failure.changes);
					const msgs = gameManager.applyChanges(normalized) || [];
					if (msgs.length > 0) {
						ui.displayMessage(msgs.join("\n"), "システム");
						await ui.waitForClick();
					}
					gameManager.addHistory({
						type: "random_event_result",
						eventId,
						choiceId: choiceText,
						result: "failure",
						changes: outcome.failure.changes,
					});
				}
			}
		} else {
			const outcome = consequences;
			if (outcome.message) {
				ui.displayMessage(outcome.message, "システム");
				await ui.waitForClick();
			}
			if (outcome.changes) {
				const normalized = normalizeEventChanges(outcome.changes);
				const msgs = gameManager.applyChanges(normalized) || [];
				if (msgs.length > 0) {
					ui.displayMessage(msgs.join("\n"), "システム");
					await ui.waitForClick();
				}
				gameManager.addHistory({
					type: "random_event_result",
					eventId,
					choiceId: choiceText,
					result: "normal",
					changes: outcome.changes,
				});
			}
		}
	},

	/**
	 * ゲームオーバー処理を統一して扱うユーティリティ
	 * 表示: GAME_OVER_EVENT の message, afterMessage を表示し、
	 * 選択肢でリスタート or タイトルへ戻るを選ばせる
	 */
	triggerGameOver: async (customMessage?: string) => {
		// フラグを立てる
		if (typeof gameManager !== "undefined")
			gameManager.playerStatus.gameOver = true;

		const eventData = Object.assign({}, EVENTS.GAME_OVER_EVENT);
		if (customMessage) eventData.message = customMessage;

		// メッセージ表示
		if (eventData.message) {
			ui.displayMessage(eventData.message, "システム");
			await ui.waitForClick();
		}
		if (eventData.afterMessage) {
			ui.displayMessage(eventData.afterMessage, "システム");
			await ui.waitForClick();
		}

		// リスタート / タイトルへ戻る 選択肢
		const choices = [
			{
				text: "リスタート",
				callback: () => {
					// 単純にページをリロードして初期化（簡易実装）
					location.reload();
				},
			},
			{
				text: "タイトルへ戻る",
				callback: () => {
					// トップページへ移動。index.html がトップならばそれをロード
					window.location.href = "../index.html";
				},
			},
		];

		ui.displayChoices(choices);
	},
};
