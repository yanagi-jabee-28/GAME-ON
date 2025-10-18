import type { IButton } from "../hardware";

export interface GameLifecycle {
	/**
	 * ゲームを開始する。
	 * 既にゲームが進行中であれば何もしない。
	 */
	start(): void;

	/**
	 * 進行中のゲームを終了する。
	 */
	stop(): void;

	/**
	 * ゲームが進行中であるかどうかを返す。
	 * @returns 進行中であればtrue、そうでなければfalse
	 */
	isRunning(): boolean;
}

export class GameSwitcher {
	private readonly button: IButton;
	private readonly gameControllers: GameLifecycle[];
	private currentGameIndex: number = 0;
	private currentGame: GameLifecycle;

	/**
	 * 複数のゲームを切り替える
	 * @param button 切り替えに使うボタン。長押しで次のゲームに切り替える
	 * @param gameControllers ゲームの配列
	 * @param initialGameIndex 初期設定のゲーム。gameControllersのインデックスで指定する。デフォルトは0
	 */
	public constructor(
		button: IButton,
		gameControllers: GameLifecycle[],
		initialGameIndex: number = 0,
	) {
		this.gameControllers = gameControllers;
		this.currentGame = gameControllers[initialGameIndex];

		gameControllers.forEach((controller) => {
			controller.stop();
		});

		this.currentGame.start();

		this.button = button;
		this.button.on("holdDown", () => {
			this.next();
		});
	}

	public next(): void {
		this.currentGame.stop();

		this.currentGameIndex =
			(this.currentGameIndex + 1) % this.gameControllers.length;
		this.currentGame = this.gameControllers[this.currentGameIndex];
		this.currentGame.start();
	}

	public getCurrentGame(): GameLifecycle {
		return this.currentGame;
	}
}
