export interface IDisplay {
  /**
   * ディスプレイに文字列を表示する。
   * @param text 表示する文字列
   */
  display(text: string): void;

  /**
   * ディスプレイに表示されている文字列を消去する。
   */
  clear(): void;

  /**
   * ディスプレイを点灯する。
   */
  on(): void;

  /**
   *  ディスプレイを消灯する。
   *
   * 表示されていた文字列は保存され、`on()`を呼び出すと再度表示される。
   */
  off(): void;
}
