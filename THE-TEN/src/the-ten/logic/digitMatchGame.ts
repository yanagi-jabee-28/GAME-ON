import { random } from "../utils/math";

export class DigitMatchGameCore {
  private static readonly DIGITS = 5;
  private digits: number[];
  private lockedCount: number = 0;

  constructor() {
    this.digits = [...Array<number>(DigitMatchGameCore.DIGITS)].map(() =>
      Math.floor(random() * 10),
    );
    this.lockedCount = 0;
  }

  public getDigits(): number[] {
    return this.digits;
  }

  /**
   * @returns 確定済みの桁数
   */
  public getLockedCount(): number {
    return this.lockedCount;
  }

  public updateDigits(): void {
    this.digits = this.digits.map((number, i) => {
      if (i + 1 <= this.lockedCount) {
        return number; // 確定済みの数字はそのまま
      }
      return number === 9 ? 0 : number + 1; // 未確定の数字はカウントアップ
    });
  }

  /**
   * 1桁確定させる
   */
  public lockDigit(): void {
    if (this.isLockedAll()) {
      return;
    }

    this.lockedCount++;
  }

  public isLockedAll(): boolean {
    return this.lockedCount >= DigitMatchGameCore.DIGITS;
  }

  /**
   * 現在のスコアを取得する。
   * 基本的にすべての桁が確定した後に呼び出す
   * @returns 一番多く出現した数字とその出現回数
   */
  public getScore(): DigitMatchScore {
    const appearedCounts: number[] = new Array<number>(10).fill(0);

    this.digits.forEach((number) => {
      appearedCounts[number]++;
    });

    const mustAppearedNumber = appearedCounts.reduce(
      (accNumber, count, number) => {
        if (count > appearedCounts[accNumber]) {
          return number;
        }
        return accNumber;
      },
      0,
    );

    return {
      number: mustAppearedNumber,
      count: appearedCounts[mustAppearedNumber],
    };
  }
}

export interface DigitMatchScore {
  number: number;
  count: number;
}
