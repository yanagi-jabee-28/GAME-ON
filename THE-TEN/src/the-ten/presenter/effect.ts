import type { IDisplay, ILED } from "../hardware";
import { asyncDelay } from "../utils/timer";

export interface EffectDevices {
	correctLed: ILED;
	wrongLed: ILED;
	display: IDisplay;
}

/**
 * 演出の外見。
 * LEDとかの表示状態を表す。
 */
export interface EffectAppearance {
	/**
	 * 正解LEDを点灯させるか
	 * undefinedの場合は変更しない
	 */
	correctLed?: boolean;

	/**
	 * 不正解LEDを点灯させるか
	 * undefinedの場合は変更しない
	 */
	wrongLed?: boolean;

	/**
	 * ディスプレイの操作
	 * undefinedの場合は変更しない
	 */
	display?: {
		/**
		 * ディスプレイを点灯させるか
		 */
		on: boolean;

		/**
		 * ディスプレイに表示するテキスト
		 *
		 * - undefinedの場合は変更しない
		 * - onがfalseの場合は無視される
		 */
		text?: string;
	};
}

/**
 * 演出の1カット
 */
export interface EffectClip extends EffectAppearance {
	/**
	 * カットの長さ
	 */
	duration: number;
}

/**
 * 演出の一連の流れ。
 * 1つの演出は複数のカットから構成される。
 */
export interface EffectSequence {
	/**
	 * ループ再生するか
	 */
	loop: boolean;

	/**
	 * カットのリスト
	 */
	clips: EffectClip[];

	/**
	 * キャンセルされたときに表示されるカット
	 */
	cancel?: EffectAppearance;
}

/**
 * ひとつの演出の開始・停止を制御する。
 * 演出を開始するたびにインスタンスを生成する必要がある。
 *
 */
export interface IEffectController {
	/**
	 * 演出を開始する
	 * @returns 演出が終了・停止するとresolveされるPromise
	 */
	execute: () => Promise<void>;

	/**
	 * 演出を停止する
	 */
	cancel: () => void;
}

export interface IEffectFactory {
	/**
	 *  ひとつの演出を再生するためのインスタンスを生成する。
	 * @param devices 演出に使用するハードウェア
	 * @returns 演出の開始・停止を制御するインスタンス
	 */
	createEffect(devices: EffectDevices): IEffectController;
}

/**
 * 複数の演出の表示や停止を制御する。
 */
export interface IEffectsManager {
	/**
	 * 演出を再生する
	 * @param type 演出の名前
	 */
	playEffect(type: string): Promise<void>;

	/**
	 * 演出を停止する
	 */
	cancel(): void;

	/**
	 * LED・ディスプレイの状態をリセットする
	 */
	reset(): void;
}

export class EffectContoroller implements IEffectController {
	private canceled: boolean = false;
	private executed: boolean = false;

	private readonly devices: EffectDevices;
	private readonly sequence: EffectSequence;

	constructor({
		sequence,
		devices,
	}: {
		sequence: EffectSequence;
		devices: EffectDevices;
	}) {
		this.devices = devices;
		this.sequence = sequence;
	}

	async execute(): Promise<void> {
		if (this.executed) {
			console.error("EffectContoroller: already executed");
			return;
		}
		this.executed = true;

		this.reset();

		// reset後すぐにLEDを点灯させようとすると
		// 点灯が不安定になるため、少し待つ
		await asyncDelay(50);

		do {
			// 演出の全体を再生
			for (const clip of this.sequence.clips) {
				if (this.canceled) {
					return;
				}

				this.setAppearance(clip);
				await asyncDelay(clip.duration);
			}

			// loopがtrueの場合は繰り返し再生
		} while (this.sequence.loop && !this.canceled);
	}

	cancel(): void {
		this.canceled = true;

		if (this.sequence.cancel) {
			this.setAppearance(this.sequence.cancel);
		}
	}

	private setAppearance(appearance: EffectAppearance): void {
		if (appearance.correctLed !== undefined) {
			if (appearance.correctLed) {
				this.devices.correctLed.on();
			} else {
				this.devices.correctLed.off();
			}
		}

		if (appearance.wrongLed !== undefined) {
			if (appearance.wrongLed) {
				this.devices.wrongLed.on();
			} else {
				this.devices.wrongLed.off();
			}
		}

		if (appearance.display) {
			if (appearance.display.on) {
				this.devices.display.on();

				if (appearance.display.text) {
					this.devices.display.display(appearance.display.text);
				}
			} else {
				this.devices.display.off();
			}
		}
	}

	private reset(): void {
		this.devices.correctLed.off();
		this.devices.wrongLed.off();
		this.devices.display.on();
	}
}

export class EffectsManager implements IEffectsManager {
	private currentEffect?: IEffectController;
	private readonly effectFactories: Record<string, IEffectFactory>;
	private readonly devices: EffectDevices;

	constructor(effects: Record<string, IEffectFactory>, devices: EffectDevices) {
		this.effectFactories = effects;
		this.devices = devices;
	}

	async playEffect(type: string): Promise<void> {
		// 進行中の演出があれば中断する
		this.currentEffect?.cancel();

		// 指定されたエフェクトを再生
		const factory = this.effectFactories[type];
		if (!factory) {
			console.error(`Unknown effect type: ${type}`);
			return;
		}

		this.currentEffect = factory.createEffect(this.devices);
		await this.currentEffect.execute();
	}

	cancel(): void {
		this.currentEffect?.cancel();
	}

	reset(): void {
		this.devices.correctLed.off();
		this.devices.wrongLed.off();
		this.devices.display.on();
	}

	// 新しいエフェクトタイプの動的追加
	registerEffectFactory(type: string, factory: IEffectFactory): void {
		this.effectFactories[type] = factory;
	}
}
