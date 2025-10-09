/**
 * @file gameManager.js
 * @description ゲームの状態を管理するファイル
 * プレイヤーのステータス、時間、フラグなどを一元管理します。
 */

import { CONFIG } from "./config.ts";
import { ITEMS } from "./items.ts";
import { RANDOM_EVENTS } from "./eventsData.ts";

// ----------------------
// Type definitions (TS)
// ----------------------
type Stats = {
	academic: number;
	physical: number;
	mental: number;
	technical: number;
	// legacy for interoperability
	condition?: number;
};

type ChangeSet = {
	stats?: Partial<Stats>;
	money?: number;
	cp?: number;
	reportDebt?: number;
	itemsAdd?: string[];
	menuLocked?: boolean;
};

type ApplyOptions = {
	suppressDisplay?: boolean;
};

type EffectMap = Record<
	string,
	{ turns: number; displayName?: string } | undefined
>;

type Character = {
	id?: string;
	name?: string;
	trust?: number;
	status?: Record<string, unknown>;
};

type Report = {
	id: string;
	title?: string;
	progress: number;
	required: number;
	changes?: ChangeSet;
	progressMessage?: string;
	completeChanges?: ChangeSet;
	completeMessage?: string;
};

type HistoryEntry = {
	type: string;
	actionId?: string;
	eventId?: string;
	choiceId?: string;
	result?: string;
	changes?: object;
	detail?: any;
	_label?: string;
	timestamp?: number;
	day?: number;
	turn?: string;
};

type PlayerStatus = {
	day: number;
	turnIndex: number;
	condition: number;
	money: number;
	cp: number;
	stats: Stats;
	items: string[];
	history: HistoryEntry[];
	reportDebt: number;
	reports: Report[];
	menuLocked: boolean;
	effects?: EffectMap;
	lastExamRunDay?: number;
	examFailed?: number;
	gameOver?: boolean;
	characters?: Character[];
};

export class GameManager {
	playerStatus: PlayerStatus;
	private _listeners: Array<(newStatus: PlayerStatus) => void>;
	/**
	 * GameManagerのコンストラクタ
	 * @param {object} initialStatus - プレイヤーの初期ステータス
	 */
	constructor(initialStatus) {
		// config.jsから受け取った初期ステータスをディープコピーして設定
		// Deep-copy initial status so mutations don't affect callers
		this.playerStatus = JSON.parse(JSON.stringify(initialStatus));
		// 持続効果を管理するためのオブジェクト（例: { energy_boost: { turns: 3 } } ）
		if (!this.playerStatus.effects) this.playerStatus.effects = {};
		// 変更リスナー (UIやイベントが購読可能)
		this._listeners = [];
		// STAT_DEFS に基づいて stats の欠損キーを初期化する
		if (
			typeof CONFIG !== "undefined" &&
			CONFIG.STAT_DEFS &&
			this.playerStatus.stats
		) {
			for (const key of Object.keys(CONFIG.STAT_DEFS)) {
				if (typeof this.playerStatus.stats[key] === "undefined") {
					this.playerStatus.stats[key] = CONFIG.STAT_DEFS[key].default || 0;
				}
			}
		}
		// 念のため stats オブジェクトが無い旧データに対応（必須キーを初期化）
		if (!this.playerStatus.stats)
			this.playerStatus.stats = {
				academic: 0,
				physical: 0,
				mental: 0,
				technical: 0,
			};
		["academic", "physical", "mental", "technical"].forEach((k) => {
			if (
				typeof this.playerStatus.stats[k] === "undefined" &&
				CONFIG.STAT_DEFS[k]
			) {
				this.playerStatus.stats[k] = CONFIG.STAT_DEFS[k].default || 0;
			}
		});
	}

	/**
	 * 汎用ステータス変更メソッド。
	 * changes のフォーマット例:
	 * {
	 *   stats: { academic: 5, physical: -3 },
	 *   money: 200,
	 *   cp: 1,
	 *   reportDebt: 1,
	 *   itemsAdd: ['energy_drink']
	 * }
	 * @param {object} changes
	 */
	applyChanges(changes: ChangeSet = {}, options: ApplyOptions = {}) {
		// スナップショットを取り、差分を計算してメッセージを生成する
		const before = JSON.parse(JSON.stringify(this.playerStatus));
		let mutated = false;

		if (changes.stats) {
			// 内部処理では updateCondition の呼び出しを抑制する
			this.changeStats(changes.stats, { suppressUpdateCondition: true });
			mutated = true;
			console.log("Stats changes applied:", changes.stats); // デバッグ用ログ
			console.log(
				"Current player stats after changes:",
				this.playerStatus.stats,
			); // デバッグ用ログ
		}

		if (typeof changes.money === "number") {
			this.playerStatus.money += changes.money;
			mutated = true;
		}

		if (typeof changes.cp === "number") {
			this.playerStatus.cp += changes.cp;
			mutated = true;
		}

		if (typeof changes.reportDebt === "number") {
			this.playerStatus.reportDebt += changes.reportDebt;
			mutated = true;
		}

		if (Array.isArray(changes.itemsAdd)) {
			changes.itemsAdd.forEach((itemId) =>
				this.playerStatus.items.push(itemId),
			);
			mutated = true;
		}

		if (typeof changes.menuLocked === "boolean") {
			this.playerStatus.menuLocked = changes.menuLocked;
			mutated = true;
		}

		// 変更があればコンディション更新と通知、差分メッセージ生成
		if (mutated) {
			this.updateCondition();
			this._notifyListeners();

			// 差分を計算してメッセージ配列を生成
			const after = this.playerStatus;
			const messages = [];

			// stats の差分（physical/mental/technical/academic を個別に表示）
			if (before.stats && after.stats) {
				const map = {
					academic: "学力",
					physical: "体力",
					mental: "精神力",
					technical: "技術力",
					condition: "コンディション",
				};
				for (const key of Object.keys(after.stats)) {
					const delta = after.stats[key] - (before.stats[key] || 0);
					if (delta !== 0) {
						const sign = delta > 0 ? "+" : "";
						messages.push(`${map[key] || key}: ${sign}${delta}`);
					}
				}
			}

			// money
			if (typeof after.money === "number" && after.money !== before.money) {
				const delta = after.money - (before.money || 0);
				const sign = delta > 0 ? "+" : "";
				// Access LABELS in a type-safe, optional way (config.ts adds it later)
				const unit = (CONFIG as any)?.LABELS?.currencyUnit ?? "円";
				messages.push(`所持金: ${sign}${delta}${unit}`);
			}

			// cp
			if (typeof after.cp === "number" && after.cp !== before.cp) {
				const delta = after.cp - (before.cp || 0);
				const sign = delta > 0 ? "+" : "";
				messages.push(`人脈: ${sign}${delta}`);
			}

			// reportDebt
			if (
				typeof after.reportDebt === "number" &&
				after.reportDebt !== before.reportDebt
			) {
				const delta = after.reportDebt - (before.reportDebt || 0);
				const sign = delta > 0 ? "+" : "";
				messages.push(`レポート負債: ${sign}${delta}`);
			}

			// itemsAdd: show added items
			if (Array.isArray(changes.itemsAdd) && changes.itemsAdd.length > 0) {
				const itemNames = changes.itemsAdd.map((id) =>
					ITEMS[id] && ITEMS[id].name ? ITEMS[id].name : id,
				);
				messages.push(`アイテム入手: ${itemNames.join(", ")}`);
				// play item get sound
				try {
					if (typeof soundManager !== "undefined")
						soundManager.play("item_get");
				} catch (e) {}
			}

			// menuLocked
			if (typeof changes.menuLocked === "boolean") {
				messages.push(
					`メニューロック: ${changes.menuLocked ? "有効" : "解除"}`,
				);
			}

			// Play sounds based on deltas
			try {
				// stats
				if (before.stats && after.stats) {
					for (const key of Object.keys(after.stats)) {
						const delta = after.stats[key] - (before.stats[key] || 0);
						if (delta > 0) {
							if (typeof soundManager !== "undefined")
								soundManager.play("stat_up");
						} else if (delta < 0) {
							if (typeof soundManager !== "undefined")
								soundManager.play("stat_down");
						}
					}
				}
				// money
				if (typeof after.money === "number" && after.money !== before.money) {
					const delta = after.money - (before.money || 0);
					if (delta > 0) {
						if (typeof soundManager !== "undefined")
							soundManager.play("money_up");
					} else if (delta < 0) {
						if (typeof soundManager !== "undefined")
							soundManager.play("money_down");
					}
				}
				// cp
				if (typeof after.cp === "number" && after.cp !== before.cp) {
					const delta = after.cp - (before.cp || 0);
					if (delta > 0) {
						if (typeof soundManager !== "undefined") soundManager.play("cp_up");
					} else if (delta < 0) {
						if (typeof soundManager !== "undefined")
							soundManager.play("cp_down");
					}
				}
			} catch (e) {
				/* ignore sound errors */
			}

			return messages;
		}
		return [];
	}

	/**
	 * 変更リスナーを登録する
	 * @param {function} listener - (newStatus) => void
	 */
	subscribe(listener) {
		if (typeof listener === "function") this._listeners.push(listener);
	}

	_notifyListeners() {
		console.log(
			`_notifyListeners: notifying ${this._listeners.length} listeners`,
		);
		this._listeners.forEach((fn) => {
			try {
				fn(this.getStatus());
			} catch (e) {
				console.error("Listener error", e);
			}
		});
	}

	/**
	 * キャラクター管理関連のユーティリティ
	 */
	addCharacter(character: Character) {
		// character は少なくとも { id?, name, trust?, status? } を想定
		if (!character) return null;
		if (!this.playerStatus.characters) this.playerStatus.characters = [];
		const id =
			character.id || `char_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
		const entry = Object.assign(
			{
				id: id,
				name: character.name || "名無し",
				trust: typeof character.trust === "number" ? character.trust : 50,
				status: character.status || {},
			},
			character,
		);
		// trust を 0-100 にクランプ
		entry.trust = Math.max(0, Math.min(100, Number(entry.trust) || 0));
		this.playerStatus.characters.push(entry);
		this._notifyListeners();
		this.addHistory({
			type: "add_character",
			detail: { id: entry.id, name: entry.name },
		});
		return entry.id;
	}

	getCharacters() {
		return this.playerStatus.characters || [];
	}

	getCharacter(id: string) {
		if (!this.playerStatus.characters) return null;
		return this.playerStatus.characters.find((c) => c.id === id) || null;
	}

	updateCharacterTrust(id: string, delta: number) {
		const c = this.getCharacter(id);
		if (!c) return null;
		const before = Number(c.trust || 0);
		c.trust = Math.max(0, Math.min(100, before + Number(delta || 0)));
		this._notifyListeners();
		this.addHistory({
			type: "trust_change",
			detail: { id, delta, before, after: c.trust },
		});
		return c.trust;
	}

	setCharacterStatus(id: string, statusChanges: Record<string, unknown>) {
		const c = this.getCharacter(id);
		if (!c) return false;
		if (!c.status) c.status = {};
		for (const k of Object.keys(statusChanges || {})) {
			c.status[k] = statusChanges[k];
		}
		this._notifyListeners();
		this.addHistory({
			type: "char_status_change",
			detail: { id, changes: statusChanges },
		});
		return true;
	}

	/**
	 * 指定された日数から曜日名を返す
	 * @returns {string} 曜日名（例: '水'）
	 */
	getWeekdayName() {
		// dayは1始まり。START_WEEKDAY_INDEXはWEEKDAYS配列のインデックスでday=1が何曜日か
		const startIndex = CONFIG.START_WEEKDAY_INDEX || 0;
		const weekdayIndex =
			(startIndex + (this.playerStatus.day - 1)) % CONFIG.WEEKDAYS.length;
		return CONFIG.WEEKDAYS[weekdayIndex];
	}

	/**
	 * 現在のプレイヤーのステータスを取得する
	 * @returns {object} プレイヤーのステータスオブジェクト
	 */
	getStatus(): PlayerStatus {
		return this.playerStatus;
	}

	/**
	 * プレイヤーの全ステータスを返す
	 * @returns {object} プレイヤーの全ステータスオブジェクト
	 */
	getAllStatus(): PlayerStatus {
		return this.playerStatus;
	}

	/**
	 * 指定された値でステータスを更新する
	 * @param {string} key - 更新するステータスのキー (例: 'money', 'condition')
	 * @param {any} value - 新しい値
	 */
	updateStatus<K extends keyof PlayerStatus>(key: K, value: PlayerStatus[K]) {
		if (key in this.playerStatus) {
			this.playerStatus[key] = value;
			console.log(`Status updated: ${String(key)} = ${String(value)}`);
		} else {
			console.error(`Error: Invalid status key '${String(key)}'`);
		}
	}

	/**
	 * プレイヤーの所持金を増減させる
	 * @param {number} amount - 増減させる金額
	 */
	addMoney(amount: number) {
		this.applyChanges({ money: amount });
	}

	/**
	 * 内部ステータス（学力、フィジカル、メンタルなど）を更新する
	 * @param {object} changes - 更新内容。例: { academic: 5, mental: -10 }
	 */
	/**
	 * ステータスを変更する補助。通常は applyChanges を使う想定だが
	 * 個別に呼びたい場合はこのメソッドを使う。
	 * @param {object} changes
	 * @param {object} options
	 */
	changeStats(
		changes: Partial<Stats>,
		options: { suppressUpdateCondition?: boolean } = {},
	) {
		// 可能なら applyChanges による一元管理へ委譲
		if (!options.suppressUpdateCondition) {
			this.applyChanges({ stats: changes });
			return;
		}

		// suppressUpdateCondition が真の場合は低レベルで直接変更する
		console.log("Entering changeStats. Changes:", changes); // デバッグ用ログ
		console.log(
			"Current playerStatus.stats before change:",
			this.playerStatus.stats,
		); // デバッグ用ログ

		for (const key in changes) {
			if (key in this.playerStatus.stats) {
				console.log(
					`Changing ${key}: ${this.playerStatus.stats[key]} + ${changes[key]}`,
				); // デバッグ用ログ
				this.playerStatus.stats[key] += changes[key];

				// clamp using STAT_DEFS if available
				if (
					typeof CONFIG !== "undefined" &&
					CONFIG.STAT_DEFS &&
					CONFIG.STAT_DEFS[key]
				) {
					const def = CONFIG.STAT_DEFS[key];
					if (typeof def.min === "number")
						this.playerStatus.stats[key] = Math.max(
							def.min,
							this.playerStatus.stats[key],
						);
					if (typeof def.max === "number")
						this.playerStatus.stats[key] = Math.min(
							def.max,
							this.playerStatus.stats[key],
						);
				} else {
					if (this.playerStatus.stats[key] < 0)
						this.playerStatus.stats[key] = 0;
					if (this.playerStatus.stats[key] > 100)
						this.playerStatus.stats[key] = 100;
				}
				console.log(`New value for ${key}: ${this.playerStatus.stats[key]}`); // デバッグ用ログ
			} else if (
				typeof CONFIG !== "undefined" &&
				CONFIG.STAT_DEFS &&
				CONFIG.STAT_DEFS[key]
			) {
				// 未定義だが STAT_DEFS にあれば新しく作る
				const def = CONFIG.STAT_DEFS[key];
				this.playerStatus.stats[key] = def.default || 0;
				this.playerStatus.stats[key] += changes[key];
				if (typeof def.min === "number")
					this.playerStatus.stats[key] = Math.max(
						def.min,
						this.playerStatus.stats[key],
					);
				if (typeof def.max === "number")
					this.playerStatus.stats[key] = Math.min(
						def.max,
						this.playerStatus.stats[key],
					);
				console.log(`Created and set ${key}: ${this.playerStatus.stats[key]}`);
			} else {
				console.warn(`Attempted to change unknown stat: ${key}`); // デバッグ用ログ
			}
		}
		console.log(
			"Exiting changeStats. Final playerStatus.stats:",
			this.playerStatus.stats,
		); // デバッグ用ログ
	}

	/**
	 * ターンを次に進める
	 */
	async nextTurn() {
		// ゲームオーバーであればこれ以上進めない
		if (this.playerStatus && this.playerStatus.gameOver) {
			console.log("Game is over. nextTurn aborted.");
			return;
		}
		// ターンインデックスを進める
		this.playerStatus.turnIndex++;

		// 夜ターンが終わったら、次の日に進む
		if (this.playerStatus.turnIndex >= CONFIG.TURNS.length) {
			this.playerStatus.turnIndex = 0; // 午前から
			this.playerStatus.day++;
		}
		console.log(
			`Turn advanced to: Day ${this.playerStatus.day}, ${this.getCurrentTurnName()}`,
		);
		// ターンが進んだことを購読者に通知してUIを最新化する
		try {
			this._notifyListeners();
		} catch (e) {
			console.warn("Failed to notify listeners after nextTurn", e);
		}

		// 日付が進んだ直後に期末試験の判定が必要かを確認
		try {
			await this.runExamIfNeeded();
		} catch (e) {
			console.error("runExamIfNeeded error", e);
		}

		// --- ターン経過に伴う持続効果のデクリメント処理 ---
		try {
			if (this.playerStatus.effects) {
				for (const key of Object.keys(this.playerStatus.effects)) {
					const ef = this.playerStatus.effects[key];
					if (ef && typeof ef.turns === "number") {
						ef.turns = Math.max(0, ef.turns - 1);
						if (ef.turns === 0) {
							delete this.playerStatus.effects[key];
							this.addHistory({
								type: "effect_expired",
								detail: { effect: key },
							});
						}
					}
				}
				// 持続効果の変化があれば UI に通知
				this._notifyListeners();
			}
		} catch (e) {
			console.warn("Effect decrement error", e);
		}
	}

	/**
	 * 指定日（CONFIG.EXAM.day）の到来時に学力を評価し、合否を判定する。
	 * 合格ならメッセージ表示と履歴記録、未達なら留年等のペナルティ処理を行う。
	 */
	async runExamIfNeeded() {
		try {
			if (!CONFIG || !CONFIG.EXAM) return;
			// 週次繰り返し設定がある場合は曜日ベースで判定
			const examDay = Number(CONFIG.EXAM.day) || 7;
			const repeatWeekly =
				CONFIG.EXAM_EXT && CONFIG.EXAM_EXT.repeatWeekly ? true : false;
			const targetWeekday =
				CONFIG.EXAM_EXT && CONFIG.EXAM_EXT.weekday
					? CONFIG.EXAM_EXT.weekday
					: null;

			// 既にその日で試験を実行済みなら二重実行を防止
			if (
				this.playerStatus.lastExamRunDay &&
				Number(this.playerStatus.lastExamRunDay) ===
					Number(this.playerStatus.day)
			) {
				return;
			}

			let shouldRun = false;
			// 明示的な日付指定（例: day === 7）は常に有効
			if (Number(this.playerStatus.day) === examDay) shouldRun = true;
			// 週次繰り返しは、ゲーム開始直後（day === 1）に誤実行しないよう day > 1 を要求する
			if (repeatWeekly && targetWeekday && Number(this.playerStatus.day) > 1) {
				const todayWeekday = this.getWeekdayName();
				if (todayWeekday === targetWeekday) shouldRun = true;
			}
			if (!shouldRun) return;

			// 学力・閾値を取得
			const academic =
				this.playerStatus.stats && Number(this.playerStatus.stats.academic)
					? Number(this.playerStatus.stats.academic)
					: 0;
			const threshold = Number(CONFIG.EXAM.passThreshold) || 50;

			// ヘッダーメッセージ（いつ試験が実施されたかを明確にする）
			const when = `日 ${this.playerStatus.day}（${this.getWeekdayName()}）`;
			const header = `【期末試験実施】 ${when} に期末試験が行われました。学力を評価します。`;

			// 合否判定と eventData の組立
			const eventData = {
				name: "試験官",
				message: header,
				changes: {},
				afterMessage: "",
			};
			if (academic >= threshold) {
				const rewards =
					CONFIG.EXAM_REWARDS && CONFIG.EXAM_REWARDS.pass
						? CONFIG.EXAM_REWARDS.pass
						: { money: 500, cp: 0 };
				const detail = `判定: 合格\n学力: ${academic} / 合格基準: ${threshold}\n報酬: 所持金 ${rewards.money >= 0 ? "+" : ""}${rewards.money}円、人脈 ${rewards.cp >= 0 ? "+" : ""}${rewards.cp}`;
				eventData.message = header + "\n" + detail;
				eventData.changes = {
					money: Number(rewards.money) || 0,
					cp: Number(rewards.cp) || 0,
				};
				this.addHistory({
					type: "exam",
					detail: { result: "pass", academic, threshold },
				});
			} else {
				const punish =
					CONFIG.EXAM_REWARDS && CONFIG.EXAM_REWARDS.fail
						? CONFIG.EXAM_REWARDS.fail
						: { money: -200, cp: 0 };
				const detail = `判定: 不合格\n学力: ${academic} / 合格基準: ${threshold}\nペナルティ: 所持金 ${punish.money >= 0 ? "+" : ""}${punish.money}円、人脈 ${punish.cp >= 0 ? "+" : ""}${punish.cp}\n留年の可能性が発生しました。`;
				eventData.message = header + "\n" + detail;
				eventData.changes = {
					money: Number(punish.money) || 0,
					cp: Number(punish.cp) || 0,
				};
				this.addHistory({
					type: "exam",
					detail: { result: "fail", academic, threshold },
				});
				// 留年フラグ・回数を明確に保持 (失敗時のみ)
				this.playerStatus.examFailed = (this.playerStatus.examFailed || 0) + 1;
			}

			// イベントフローで実行してUIのクリック待ちを正しく挟む
			try {
				await GameEventManager.performChangesEvent(eventData);
			} catch (e) {
				console.warn("performChangesEvent failed", e);
				const applied =
					this.applyChanges(eventData.changes, { suppressDisplay: true }) || [];
				const combined =
					eventData.message +
					(applied.length ? "\n---\n" + applied.join("\n") : "");
				if (
					typeof ui !== "undefined" &&
					typeof ui.showFloatingMessage === "function"
				) {
					await ui
						.showFloatingMessage(combined)
						.catch((e) => console.warn("showFloatingMessage failed", e));
				} else if (
					typeof ui !== "undefined" &&
					typeof ui.displayMessage === "function"
				) {
					ui.displayMessage(combined, eventData.name || "試験官");
					if (typeof ui.waitForClick === "function") await ui.waitForClick();
				}
			}

			// 実行済みフラグを記録して同日の重複実行を防止
			this.playerStatus.lastExamRunDay = Number(this.playerStatus.day);

			// 試験が目的なので終了処理を行う（合否に関わらずゲーム終了）
			this.playerStatus.gameOver = true;
			// 統一のゲームオーバー処理へ委譲
			if (
				typeof GameEventManager !== "undefined" &&
				typeof GameEventManager.triggerGameOver === "function"
			) {
				await GameEventManager.triggerGameOver(
					"試験が終了しました。これで本作のプレイは終了します。お疲れさまでした。",
				);
			}
		} catch (e) {
			console.error("Error during exam evaluation", e);
		}
	}

	/**
	 * 現在のターン名を取得する
	 * @returns {string} 現在のターン名 (例: '午前')
	 */
	getCurrentTurnName(): string {
		return CONFIG.TURNS[this.playerStatus.turnIndex];
	}

	/**
	 * ランダムイベントの発生をチェックし、条件に合致すればトリガーする
	 * @returns {Promise<boolean>} イベントが発生したかどうか
	 */
	async checkAndTriggerRandomEvent(): Promise<boolean> {
		// ここにランダムイベントの発生判定ロジックを記述
		// - 現在のターン、曜日、ステータスなどを取得
		// - RANDOM_EVENTS から条件に合致するイベントをフィルタリング
		// - フィルタリングされたイベントの中からランダムに一つ選択
		// - 選択されたイベントを GameEventManager.handleRandomEvent などに渡して実行
		console.log("Checking for random events...");
		const currentStatus = this.getStatus();
		const currentTurnName = this.getCurrentTurnName();
		const currentWeekdayName = this.getWeekdayName();

		const availableEvents = Object.values(RANDOM_EVENTS as any).filter(
			(event: any) => {
				// ターンの条件チェック
				const cond = (event && event.conditions) || {};
				if (cond.turn && !cond.turn.includes(currentTurnName)) {
					return false;
				}
				// 曜日の条件チェック (平日/休日など)
				if (
					cond.weekday &&
					!["月", "火", "水", "木", "金"].includes(currentWeekdayName)
				) {
					return false;
				}
				// TODO: その他の条件（ステータス、フラグなど）を追加

				return true; // 一旦、条件に合致するものを全て返す
			},
		);

		if (availableEvents.length > 0) {
			// 発生可能なイベントの中からランダムに一つ選択
			const randomIndex = Math.floor(Math.random() * availableEvents.length);
			const selectedEvent = availableEvents[randomIndex] as any;

			console.log(
				`Random event triggered: ${selectedEvent?.name ?? "unknown"}`,
			);
			// TODO: GameEventManager を使ってイベントを実行する
			// await GameEventManager.handleRandomEvent(selectedEvent);
			return true;
		}
		return false;
	}

	/**
	 * アイテムを追加する
	 * @param {string} itemId - 追加するアイテムのID
	 */
	addItem(itemId: string) {
		this.playerStatus.items.push(itemId);
		console.log(`Item added: ${itemId}`);
	}

	/**
	 * レポート（個別）の追加
	 * @param {object} report - { id: string, title?: string, progress: number, required: number }
	 */
	addReport(report: Report) {
		if (!report || !report.id) return;
		const r = Object.assign(
			{ title: report.title || report.id, progress: 0, required: 1 },
			report,
		);
		this.playerStatus.reports.push(r);
		// reportDebt を互換性のために更新
		this.playerStatus.reportDebt = this.playerStatus.reports.length;
		this._notifyListeners();
	}

	/**
	 * 履歴を追加するユーティリティ
	 * @param {{ type: string, actionId?: string, eventId?: string, choiceId?: string, result?: string, changes?: object, detail?: object, _label?: string }} entry
	 */
	addHistory(entry: HistoryEntry) {
		if (!this.playerStatus.history) this.playerStatus.history = [];
		const e = Object.assign(
			{
				timestamp: Date.now(),
				day: this.playerStatus.day, // 現在の日付を自動で追加
				turn: CONFIG.TURNS[this.playerStatus.turnIndex], // 現在のターンを自動で追加
			},
			entry,
		);

		// Generate a human-readable label for common internal types to avoid
		// showing raw internal IDs like 'effect_applied' in the history UI.
		try {
			switch (e.type) {
				case "effect_applied": {
					const flag = e.detail && e.detail.effect;
					let name = flag || "";
					// Try to read displayName from current effects (if already registered)
					if (
						flag &&
						this.playerStatus.effects &&
						this.playerStatus.effects[flag] &&
						this.playerStatus.effects[flag].displayName
					) {
						name = this.playerStatus.effects[flag].displayName;
					} else {
						// Fallback: search ITEMS for an effect with matching flagId
						for (const id of Object.keys(ITEMS || {})) {
							const it = ITEMS[id];
							if (it && it.effect && it.effect.flagId === flag) {
								name = it.effect.displayName || it.name || flag;
								break;
							}
						}
					}
					e._label =
						`効果付与: ${name}` +
						(e.detail && typeof e.detail.turns === "number"
							? ` (${e.detail.turns}ターン)`
							: "");
					break;
				}
				case "effect_expired": {
					const flag = e.detail && e.detail.effect;
					let name = flag || "";
					if (
						flag &&
						this.playerStatus.effects &&
						this.playerStatus.effects[flag] &&
						this.playerStatus.effects[flag].displayName
					) {
						name = this.playerStatus.effects[flag].displayName;
					} else {
						for (const id of Object.keys(ITEMS || {})) {
							const it = ITEMS[id];
							if (it && it.effect && it.effect.flagId === flag) {
								name = it.effect.displayName || it.name || flag;
								break;
							}
						}
					}
					e._label = `効果終了: ${name}`;
					break;
				}
				case "use_item": {
					const itemName =
						e.detail &&
						(e.detail.itemName ||
							(e.detail.itemId && ITEMS[e.detail.itemId]
								? ITEMS[e.detail.itemId].name
								: e.detail.itemId));
					e._label = itemName ? `アイテム使用 - ${itemName}` : "アイテム使用";
					break;
				}
				case "add_character": {
					e._label =
						e.detail && e.detail.name
							? `キャラクター追加 - ${e.detail.name}`
							: "キャラクター追加";
					break;
				}
				case "trust_change": {
					const ch = e.detail || {};
					const who =
						ch.id && this.getCharacter(ch.id)
							? this.getCharacter(ch.id).name
							: ch.id || "キャラクター";
					e._label = `信頼度変動 - ${who}: ${ch.delta > 0 ? "+" + ch.delta : ch.delta}`;
					break;
				}
				case "choice": {
					e._label =
						e.detail && e.detail.label ? `選択 - ${e.detail.label}` : "選択";
					break;
				}
				case "shop_visit": {
					e._label =
						e.detail && e.detail.shopLabel
							? `${e.detail.shopLabel}に入店`
							: "店に入店";
					break;
				}
				case "purchase": {
					const itemName =
						e.detail &&
						(e.detail.itemName ||
							(e.detail.itemId && ITEMS[e.detail.itemId]
								? ITEMS[e.detail.itemId].name
								: e.detail.itemId));
					e._label = itemName ? `購入 - ${itemName}` : "購入";
					break;
				}
				case "shop_leave": {
					const shopId = e.detail && e.detail.shopId;
					const purchased = e.detail && !!e.detail.purchased;
					const shopLabel =
						e.detail && e.detail.shopLabel
							? e.detail.shopLabel
							: shopId &&
									(CONFIG as any) &&
									(CONFIG as any).SHOPS &&
									(CONFIG as any).SHOPS[shopId] &&
									(CONFIG as any).SHOPS[shopId].label
								? (CONFIG as any).SHOPS[shopId].label
								: shopId || "店";
					if (purchased) {
						const itemName =
							e.detail &&
							(e.detail.itemName ||
								(e.detail.itemId && ITEMS[e.detail.itemId]
									? ITEMS[e.detail.itemId].name
									: e.detail.itemId));
						e._label = itemName
							? `${shopLabel}で購入して退店（${itemName}、${e.detail.price || ""}${(CONFIG as any)?.LABELS?.currencyUnit ?? ""}）`
							: `${shopLabel}で購入して退店`;
					} else {
						e._label = `${shopLabel}を訪れて何も買わず退店`;
					}
					break;
				}
				default: {
					// leave as-is; UI will fallback to type if no label exists
				}
			}
		} catch (err) {
			console.warn("addHistory label generation failed", err);
		}

		this.playerStatus.history.push(e);
		this._notifyListeners();
	}

	/**
	 * 任意の changes を inline なイベントとして実行するユーティリティ。
	 * message や name を渡すことで、UI 表示を一元化する。
	 * @param {object} changes
	 * @param {string} [name]
	 * @param {string} [message]
	 */
	async triggerInlineChanges(
		changes: ChangeSet,
		name?: string,
		message?: string,
	) {
		const eventData = {
			name: name || "システム",
			message: message || "",
			changes: changes,
		};
		try {
			await GameEventManager.performChangesEvent(eventData);
		} catch (e) {
			console.warn("performChangesEvent fallback", e);
			// フォールバックは直接 applyChanges して UI を表示
			const msgs = this.applyChanges(changes, { suppressDisplay: true }) || [];
			const combined =
				(message ? message + "\n" : "") + (msgs.length ? msgs.join("\n") : "");
			if (typeof ui !== "undefined") {
				if (typeof ui.showFloatingMessage === "function")
					await ui.showFloatingMessage(combined).catch(() => {});
				else if (typeof ui.displayMessage === "function")
					ui.displayMessage(combined, name || "システム");
			}
		}
	}

	/**
	 * 選択肢の選択を記録する
	 * @param {string} label - 選んだ選択肢の表示テキスト
	 */
	recordChoice(label: string) {
		this.addHistory({
			type: "choice",
			detail: {
				label,
				day: this.playerStatus.day,
				turn: CONFIG.TURNS[this.playerStatus.turnIndex],
			},
		});
	}

	/**
	 * レポートの進捗を進める
	 * @param {string} id
	 * @param {number} amount
	 */
	progressReport(id: string, amount: number = 1) {
		const idx = this.playerStatus.reports.findIndex((r) => r.id === id);
		if (idx === -1) return null; // 何も起きなかった

		const report = this.playerStatus.reports[idx];
		const oldProgress = report.progress;
		report.progress += amount;

		// Collect messages: allow per-report custom messages and per-progress/complete changes
		const outMsgs = [];

		// If the report defines 'changes', apply them each time progress is made
		if (report.changes) {
			try {
				const msgs =
					this.applyChanges(report.changes, { suppressDisplay: true }) || [];
				if (msgs && msgs.length) outMsgs.push(...msgs);
			} catch (e) {
				console.warn("report.changes apply failed", e);
			}
		}

		if (report.progress >= report.required) {
			// Completion: optionally apply completeChanges and use completeMessage
			if (report.completeChanges) {
				try {
					const msgs2 =
						this.applyChanges(report.completeChanges, {
							suppressDisplay: true,
						}) || [];
					if (msgs2 && msgs2.length) outMsgs.push(...msgs2);
				} catch (e) {
					console.warn("report.completeChanges apply failed", e);
				}
			}

			const completeMsg =
				report.completeMessage || `${report.title} を提出した！`;
			// show completion message first
			outMsgs.unshift(completeMsg);
			// 完了扱い: レポート配列から削除
			this.playerStatus.reports.splice(idx, 1);
		} else {
			const progMsg =
				report.progressMessage ||
				`${report.title} の進捗が ${report.progress}/${report.required} になりました。`;
			outMsgs.unshift(progMsg);
		}

		// reportDebt を互換性のために更新
		this.playerStatus.reportDebt = this.playerStatus.reports.length;
		this._notifyListeners();

		// 戻り値をオブジェクトにして、表示側で「本文」と「差分メッセージ」を分けて扱えるようにする
		const message = outMsgs.length > 0 ? (outMsgs.shift() as string) : "";
		const changeMsgs = outMsgs; // 残りは差分メッセージ
		return { message: message, changeMsgs: changeMsgs };
	}

	getReports() {
		return this.playerStatus.reports;
	}

	// --- 今後の拡張で追加する関数群 ---

	/**
	 * アイテムを使用する
	 * @param {string} itemId - 使用するアイテムのID
	 */
	async useItem(itemId: string) {
		// ここに async を追加
		const item = ITEMS[itemId];
		if (!item) {
			console.error(`Item not found: ${itemId}`);
			return false;
		}

		// プレイヤーがアイテムを所持しているか確認し、所持していれば削除
		const itemIndex = this.playerStatus.items.indexOf(itemId);
		if (itemIndex === -1) {
			console.warn(`Player does not have item: ${itemId}`);
			return false;
		}
		this.playerStatus.items.splice(itemIndex, 1); // アイテムを消費

		// アイテムの効果を適用
		if (item.effect && item.effect.changes) {
			// 汎用イベントデータを作成してイベントフローで実行する
			const eventData = {
				name: item.name,
				message: `${item.name} を使用した！\n${item.description || ""}`,
				changes: item.effect.changes,
				afterMessage: "",
			};

			try {
				// If the menu is currently open, show the item message inside the menu
				// instead of using the main message window. This prevents the main
				// message window from being pulled above the menu overlay.
				if (
					typeof ui !== "undefined" &&
					ui.menuOverlay &&
					!ui.menuOverlay.classList.contains("hidden") &&
					typeof GameEventManager !== "undefined" &&
					GameEventManager.isInFreeAction
				) {
					// Menu is open: apply changes silently and show a floating overlay above the menu.
					const messages =
						this.applyChanges(item.effect.changes, { suppressDisplay: true }) ||
						[];
					const combined = [eventData.message, ...messages].join("\n");
					try {
						if (typeof ui.showFloatingMessage === "function") {
							await ui.showFloatingMessage(combined, { lineDelay: 0 });
						} else if (typeof ui.displayMenuMessage === "function") {
							// Fallback: show inside the menu area.
							ui.displayMenuMessage(combined);
							if (typeof ui.waitForMenuClick === "function") {
								await ui.waitForMenuClick();
							} else if (typeof ui.waitForClick === "function") {
								await ui.waitForClick();
							}
							if (typeof ui.clearMenuMessage === "function")
								ui.clearMenuMessage();
						}
					} catch (innerErr) {
						console.warn("Menu-display item use flow failed", innerErr);
					}
				} else {
					// Default: use the normal event flow which shows messages in the main window
					await GameEventManager.performChangesEvent(eventData);
				}
			} catch (e) {
				console.warn("performChangesEvent failed for useItem", e);
				// フォールバック: 直接適用して差分をまとめて表示
				const messages =
					this.applyChanges(item.effect.changes, { suppressDisplay: true }) ||
					[];
				const combined = [`${item.name} を使用した！`, ...messages].join("\n");
				if (typeof ui !== "undefined") {
					if (
						ui.menuOverlay &&
						!ui.menuOverlay.classList.contains("hidden") &&
						typeof GameEventManager !== "undefined" &&
						GameEventManager.isInFreeAction
					) {
						if (typeof ui.showFloatingMessage === "function") {
							await ui.showFloatingMessage(combined, { lineDelay: 800 });
						} else if (typeof ui.displayMenuMessage === "function") {
							ui.displayMenuMessage(combined);
							if (typeof ui.waitForMenuClick === "function") {
								await ui.waitForMenuClick();
							} else if (typeof ui.waitForClick === "function") {
								await ui.waitForClick();
							}
							ui.clearMenuMessage && ui.clearMenuMessage();
						}
					} else if (typeof ui.displayMessage === "function") {
						ui.displayMessage(combined, "システム");
						if (typeof ui.waitForClick === "function") await ui.waitForClick();
					}
				}
			}

			// 持続効果（duration / flagId）が定義されていれば登録する
			try {
				if (
					item.effect &&
					typeof item.effect.duration === "number" &&
					item.effect.flagId
				) {
					this.playerStatus.effects[item.effect.flagId] = {
						turns: Number(item.effect.duration),
						displayName: item.effect.displayName || item.name,
					};
					this.addHistory({
						type: "effect_applied",
						detail: {
							effect: item.effect.flagId,
							turns: Number(item.effect.duration),
						},
					});
					this._notifyListeners();
					console.log(
						"Effect applied:",
						item.effect.flagId,
						this.playerStatus.effects[item.effect.flagId],
					);
				}
			} catch (e) {
				console.warn("Failed to apply item effect flag", e);
			}
		} else {
			console.warn(`Item ${itemId} has no defined effect.`);
		}
		// 履歴に使用を記録
		this.addHistory({
			type: "use_item",
			detail: { itemId: itemId, itemName: item.name },
		});
		this._notifyListeners(); // ステータス変更を通知
		try {
			if (typeof soundManager !== "undefined") soundManager.play("item_use");
		} catch (e) {}
		return true;
	}

	/**
	 * コンディションを計算・更新する
	 * (フィジカルとメンタルの状態から総合的なコンディションを算出するロジック)
	 */
	updateCondition() {
		// 新仕様: 体力(physical)と精神力(mental)の平均からコンディションを推定
		const p =
			this.playerStatus.stats &&
			typeof this.playerStatus.stats.physical === "number"
				? this.playerStatus.stats.physical
				: undefined;
		const m =
			this.playerStatus.stats &&
			typeof this.playerStatus.stats.mental === "number"
				? this.playerStatus.stats.mental
				: undefined;
		let cond;
		if (typeof p === "number" && typeof m === "number") {
			cond = Math.round((p + m) / 2);
		} else if (typeof p === "number") {
			cond = p;
		} else if (typeof m === "number") {
			cond = m;
		} else {
			// 後方互換: 旧 stats.condition or 既存の condition を使用
			const legacy = this.playerStatus.stats
				? this.playerStatus.stats.condition
				: undefined;
			cond =
				typeof legacy === "number" ? legacy : this.playerStatus.condition || 0;
		}
		this.playerStatus.condition = Math.max(0, Math.min(100, cond));
	}

	/**
	 * ゲームデータをロードする
	 * @param {object} loadedData - ロードされたゲームデータオブジェクト
	 */
	loadGame(loadedData: PlayerStatus) {
		// ロードされたデータを現在のプレイヤーの状態に適用
		this.playerStatus = loadedData;
		// 履歴がなければ空の配列を初期化（古いセーブデータとの互換性のため）
		if (!this.playerStatus.history) {
			this.playerStatus.history = [];
		}
		// レポートがなければ空の配列を初期化
		if (!this.playerStatus.reports) {
			this.playerStatus.reports = [];
		}
		// コンディションを再計算・更新
		this.updateCondition();
		// UIに状態の変更を通知
		this._notifyListeners();
		console.log("Game data loaded successfully.");
	}
}
