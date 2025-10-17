export interface IReedSwitch {
  /**
   * @return 1: 磁気あり, 0: 磁気なし
   */
  read(): number;
}
