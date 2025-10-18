export type ButtonEvent = "click" | "holdDown";
export interface IButton {
  /**
   * `eventName`イベントをリスナーに登録する。
   * イベントが発火すると、`listener`関数が呼び出される。
   * @param eventName イベント名
   * @param listener  コールバック関数
   */
  on(eventName: ButtonEvent, listener: () => void): void;

  /**
   * 1度だけ発火できる`eventName`イベントをリスナーに登録する。
   * イベントが発火すると、`listener`関数が呼び出され、イベントリスナーは消去される。
   * @param eventName イベント名
   * @param listener コールバック関数
   */
  once(eventName: ButtonEvent, listener: () => void): void;

  /**
   * イベント名`eventName`で登録されたすべてのイベントリスナーを消去する。
   * イベント名が指定されていない場合は、あらゆるイベント名で登録されたすべてのイベントリスナーを消去する。
   * @param eventName イベント名
   */
  removeAllListeners(eventName?: ButtonEvent): void;

  /**
   * ボタンのGPIOピンの状態を読み取る
   * @returns HIGH(1) or LOW(0)
   */
  read: () => number;
}
