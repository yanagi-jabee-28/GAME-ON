export function random(): number {
  try {
    const us = micros();
    // xorshiftという疑似乱数生成アルゴリズム
    let x = us;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;

    // 0~1の中で10^9刻みの乱数を生成する
    // 10^9にした意味は特にない
    const factor = 1000_000_000;

    return Math.abs((x % factor) / factor);
  } catch (_) {
    return Math.random();
  }
}
