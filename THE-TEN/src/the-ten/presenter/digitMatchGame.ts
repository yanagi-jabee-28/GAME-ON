import type { IButton, IDisplay, ILED } from "../hardware";
import { DigitMatchGameCore } from "../logic/digitMatchGame";
import {
	type EffectClip,
	EffectContoroller,
	type EffectDevices,
	type EffectSequence,
	EffectsManager,
	type IEffectController,
	type IEffectFactory,
} from "./effect";
import type { GameLifecycle } from "./gameLifecycle";

export class DigitMatchGamePresenter implements GameLifecycle {
	private _isRunning: boolean = false;

	private game: DigitMatchGameCore;

	private readonly button: IButton;

	private readonly display: IDisplay;
	private readonly effect: EffectsManager;

	private intervalId: number = -1;

	public constructor({
		display,
		button,
		correctLed,
		wrongLed,
	}: {
		display: IDisplay;
		button: IButton;
		correctLed: ILED;
		wrongLed: ILED;
	}) {
		// 生焼けを防ぐために、コンストラクタで初期化しておく
		// playRound()を呼び出すと、gameが再初期化される
		this.game = new DigitMatchGameCore();

		this.button = button;

		this.effect = new EffectsManager(
			{
				opening: new OpeningEffectFactory(),
				result: new ResultEffectFactory(() => this.game),
			},
			{
				correctLed,
				wrongLed,
				display,
			},
		);
		this.display = display;
	}

	public start(): void {
		if (this._isRunning) {
			console.log("already started");
			return;
		}
		this._isRunning = true;

		this.effect
			.playEffect("opening")
			.then(() => {
				this.playRound();
			})
			.catch(console.error);
	}

	private playRound(): void {
		if (!this._isRunning) {
			return;
		}

		this.effect.reset();

		this.game = new DigitMatchGameCore();

		// 数字を動かし始める
		clearInterval(this.intervalId);
		this.intervalId = setInterval(() => {
			this.game.updateDigits();
			this.updateDisplay();
		}, 150);

		// ボタンのハンドラを設定
		this.setupButtonHandlers();
	}

	private setupButtonHandlers(): void {
		const handleClick = () => {
			if (!this._isRunning) {
				return;
			}

			// ボタンを押したときに、桁をロックする
			this.game.lockDigit();

			if (this.game.isLockedAll()) {
				this.handleComplete();
			} else {
				// ロックしてない桁がある場合、再度イベントを登録
				this.button.once("click", handleClick);
			}
		};

		this.button.once("click", handleClick);
	}

	private updateDisplay(): void {
		this.display.display(this.game.getDigits().join(""));
	}

	private handleComplete(): void {
		if (!this._isRunning) {
			return;
		}

		// 数字の動きを止める
		clearInterval(this.intervalId);

		this.effect.cancel();
		this.effect.reset();
		this.effect.playEffect("result").catch(console.error);

		// ボタンを押したときに、次のラウンドを開始する
		this.button.removeAllListeners("click");
		this.button.once("click", () => {
			this.effect.cancel();

			this.playRound();
		});
	}

	public stop(): void {
		this._isRunning = false;

		clearInterval(this.intervalId);

		this.button.removeAllListeners("click");

		this.effect.cancel();
		this.effect.reset();
		this.display.clear();
	}

	public isRunning(): boolean {
		return this._isRunning;
	}
}

class ResultEffectFactory implements IEffectFactory {
	private readonly getGame: () => DigitMatchGameCore;

	constructor(getGame: () => DigitMatchGameCore) {
    this.getGame = getGame;
	}

	createEffect(devices: EffectDevices): IEffectController {
		return new EffectContoroller({
			sequence: this.createEffectData(),
			devices,
		});
	}

	private createEffectData(): EffectSequence {
		const game = this.getGame();
		if (!game.isLockedAll()) {
			return {
				loop: false,
				clips: [],
			};
		}

		const digits = game.getDigits();
		const result = game.getScore();
		console.log(result);

		const digitsText = digits.join("");

		// 一致した桁だけを点滅させるために、
		// 一致している桁を空白にする
		const matchedDigitsText = digits
			.map((digit) => {
				if (result.count >= 2 && digit === result.number) {
					return " ";
				} else {
					return `${digit}`;
				}
			})
			.join("");

		const blinkMatchedClips: EffectClip[] = [];
		for (let i = 0; i < 6; i++) {
			blinkMatchedClips.push({
				duration: 250,
				display: { on: true, text: digitsText },
			});
			blinkMatchedClips.push({
				duration: 250,
				display: { on: true, text: matchedDigitsText },
			});
		}

		// 2桁以上揃っているときにポイントが入る
		const points = result.count >= 2 ? result.count : 0;

		// 右寄せでポイントを表示
		const pointsClips: EffectClip[] = [
			{
				duration: 3000,
				display: { on: true, text: `  ${points}PT` },
			},
		];

		return {
			loop: true,
			clips: [...blinkMatchedClips, ...pointsClips],
		};
	}
}

class OpeningEffectFactory implements IEffectFactory {
	createEffect(devices: EffectDevices): IEffectController {
		const clips: EffectClip[] = [];

		// "77777"を点滅
		for (let i = 0; i < 4; i++) {
			clips.push({
				duration: 300,
				display: {
					on: true,
					text: "77777",
				},
			});
			clips.push({ duration: 200, display: { on: false } });
		}

		return new EffectContoroller({
			sequence: {
				loop: false,
				clips,
			},
			devices,
		});
	}
}
