import type { IButton, IDisplay, ILED } from "../hardware";
import { MakeTenGameCore, type Question } from "../logic/quiz";
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
import type { IOperationReader } from "./operationInput";

/**
 * 10を作るクイズのゲーム
 */
export class MakeTenGamePresenter implements GameLifecycle {
	private _isRunning: boolean = false;

	private quiz: MakeTenGameCore;

	private quizCount: number = 0;
	private correctChain: number = 0;

	private readonly button: IButton;
	private readonly leftOperationReader: IOperationReader;
	private readonly rightOperationReader: IOperationReader;

	private readonly effect: EffectsManager;
	private readonly display: IDisplay;

	public constructor({
		display,
		correctLed,
		wrongLed,
		button,
		leftOperationReader,
		rightOperationReader,
	}: {
		display: IDisplay;
		correctLed: ILED;
		wrongLed: ILED;
		button: IButton;
		leftOperationReader: IOperationReader;
		rightOperationReader: IOperationReader;
	}) {
		// 一旦[0, 0, 0]で初期化
		// startQuiz()で有効なQuizが生成される
		this.quiz = new MakeTenGameCore([0, 0, 0]);

		this.button = button;
		this.leftOperationReader = leftOperationReader;
		this.rightOperationReader = rightOperationReader;

		this.effect = new EffectsManager(
			{
				opening: new OpeningEffectFactory(),
				correct: new CorrectEffectFactory(),
				wrong: new WrongEffectFactory(),
				displayQuiz: new DisplayQuizEffectFactory(() => ({
					count: this.quizCount,
					question: this.quiz.question,
				})),
			},
			{
				correctLed,
				wrongLed,
				display: display,
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

		this.quizCount = 0;
		this.correctChain = 0;

		this.effect
			.playEffect("opening")
			.then(() => {
				this.startQuiz();
			})
			.catch(console.error);
	}

	/**
	 * numbersDisplayに問題を表示する
	 */
	private displayQuiz() {
		this.effect.playEffect("displayQuiz").catch(console.error);

		console.log(this.quiz.question);
	}

	private checkAnswer = (): boolean => {
		// デバッグしやすくするため、
		// operationInput1が失敗していても
		// operationInput1, operationInput2を取得、表示する

		const operationInput1 = this.leftOperationReader.read();

		const operationInput2 = this.rightOperationReader.read();

		// どちらかの入力が失敗していたら不正解
		if (!operationInput1.success || !operationInput2.success) {
			console.log("Input Error\n");
			return false;
		}

		const playerAnswer = {
			leftOperation: operationInput1.operation,
			rightOperation: operationInput2.operation,
		};
		const isCorrect = this.quiz.checkAnswer(playerAnswer);

		console.log(isCorrect ? "Correct\n" : "Wrong\n");

		return isCorrect;
	};

	/**
	 * 回答に応じた演出を表示し、
	 * 正解なら次の問題に進む。
	 * 不正解なら再度回答を受け付ける。
	 */
	private async handleAnswer() {
		if (!this._isRunning) {
			return;
		}

		const isCorrect = this.checkAnswer();

		this.effect.reset();

		if (isCorrect) {
			// 正解

			this.correctChain++;

			// 演出を表示したあと次の問題に進む
			// 演出中にボタンが押された場合、演出を中断して次の問題に進む
			let isEffectCancelled = false;

			this.button.once("click", () => {
				isEffectCancelled = true;

				this.effect.cancel();
				this.startQuiz();
			});

			await this.effect.playEffect("correct");

			// ボタンが押されていない場合、次の問題に進む
			if (!isEffectCancelled && this._isRunning) {
				this.button.removeAllListeners("click");
				this.startQuiz();
			}
		} else {
			// 不正解
			// 演出を表示し、回答を受け付ける（演出中でも回答できる）
			this.effect.playEffect("wrong").catch(console.error);

			this.button.once("click", () => {
				this.handleAnswer().catch(console.error);
			});
		}
	}

	private startQuiz() {
		if (!this._isRunning) {
			return;
		}

		// 次の問題を生成
		this.quiz = this.quiz.next();
		this.quizCount++;

		// 問題を表示
		this.effect.reset();
		this.displayQuiz();

		// 回答を受け付ける
		this.button.once("click", () => {
			this.handleAnswer().catch(console.error);
		});
	}

	public stop() {
		this._isRunning = false;

		this.button.removeAllListeners("click");

		this.effect.cancel();
		this.effect.reset();
		this.display.clear();
	}

	public isRunning(): boolean {
		return this._isRunning;
	}
}

class CorrectEffectFactory implements IEffectFactory {
	createEffect(devices: EffectDevices): IEffectController {
		return new EffectContoroller({
			sequence: this.createEffectData(),
			devices,
		});
	}

	private createEffectData = (): EffectSequence => {
		const sections: EffectClip[] = [];

		const blinkCount = 5;
		const onDuration = 240;
		const offDuration = 160;

		// ピコピコする感じ
		for (let i = 0; i < blinkCount; i++) {
			sections.push({
				duration: onDuration,
				correctLed: true,
				display: { on: true },
			});

			if (i + 1 !== blinkCount) {
				sections.push({
					duration: offDuration,
					correctLed: false,
					display: { on: false },
				});
			} else {
				// 最後の消灯時間はスキップする
				sections.push({
					duration: 0,
					correctLed: false,
					display: { on: true },
				});
			}
		}

		return {
			loop: false,
			clips: sections,
		};
	};
}

class WrongEffectFactory implements IEffectFactory {
	createEffect(devices: EffectDevices): IEffectController {
		return new EffectContoroller({
			sequence: this.createEffectData(),
			devices,
		});
	}

	private createEffectData = (): EffectSequence => {
		const sections: EffectClip[] = [];

		// ブッブッブーみたいな感じ
		for (let i = 0; i < 2; i++) {
			sections.push({ duration: 400, wrongLed: true });
			sections.push({ duration: 280, wrongLed: false });
		}
		sections.push({ duration: 800, wrongLed: true });
		sections.push({ duration: 0, wrongLed: false });

		return {
			loop: false,
			clips: sections,
		};
	};
}

class DisplayQuizEffectFactory implements IEffectFactory {
	private readonly getQuizData: () => {
		count: number;
		question: Question;
	};

	constructor(
		getQuizData: () => {
			count: number;
			question: Question;
		},
	) {
		this.getQuizData = getQuizData;
	}

	createEffect(devices: EffectDevices): IEffectController {
		return new EffectContoroller({
			sequence: this.createEffectData(),
			devices,
		});
	}

	private createEffectData(): EffectSequence {
		const { count, question } = this.getQuizData();

		// 右揃えで問題番号を表示
		const countText = `Q${count}`.padStart(5, " ");

		// 問題と目標値の10を表示
		const questionText = `${question[0]}${question[1]}${question[2]}10`;

		return {
			loop: false,
			clips: [
				{
					duration: 1000,
					display: { on: true, text: countText },
				},
				{
					duration: 0,
					display: { on: true, text: questionText },
				},
			],
			cancel: { display: { on: true, text: questionText } },
		};
	}
}

class OpeningEffectFactory implements IEffectFactory {
	createEffect(devices: EffectDevices): IEffectController {
		const clips: EffectClip[] = [];

		// 目標値の10を点滅
		for (let i = 0; i < 4; i++) {
			clips.push({
				duration: 300,
				display: {
					on: true,
					text: "   10",
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
