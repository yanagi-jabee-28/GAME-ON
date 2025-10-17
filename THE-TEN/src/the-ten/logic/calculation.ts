/**
 * 2つの数値の演算
 */
export interface Operation {
  /**
   * 2つの数値を計算する
   * @param a 1つ目の数値
   * @param b 2つ目の数値
   * @returns 計算結果
   */
  readonly calculate: (a: number, b: number) => number;

  /**
   * 計算の優先度
   * 優先度が高い演算を先に行う
   */
  readonly priority: number;
}

const HIGH_PRIORITY = 2;
const LOW_PRIORITY = 1;

// 新しい演算を追加する場合：
// 1. 新しい演算をOperationに従って作成する
// 2. 新しい演算のテストを作成する
// 必要に応じて新しい問題を作成する

export const add: Operation = {
  calculate: (a: number, b: number) => a + b,
  priority: LOW_PRIORITY,
};

export const subtract: Operation = {
  calculate: (a: number, b: number) => a - b,
  priority: LOW_PRIORITY,
};

export const multiply: Operation = {
  calculate: (a: number, b: number) => a * b,
  priority: HIGH_PRIORITY,
};

export const divide: Operation = {
  calculate: (a: number, b: number) => a / b,
  priority: HIGH_PRIORITY,
};

export function calculate3Numbers(
  a: number,
  b: number,
  c: number,
  op1: Operation,
  op2: Operation,
): number {
  if (op1.priority < op2.priority) {
    return op1.calculate(a, op2.calculate(b, c));
  } else {
    return op2.calculate(op1.calculate(a, b), c);
  }
}
