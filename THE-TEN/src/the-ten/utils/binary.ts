/**
 * 数値を2進数表示の文字列に変換する
 * @param num 変換したい数値
 * @param minDigits 最低桁数。デフォルトは0
 * @returns 2進数表示の文字列
 */
export function toBinaryString(num: number, minDigits: number = 0): string {
  const body = num.toString(2).padStart(minDigits, "0");
  const prefix = "0b";
  return prefix + body;
}
