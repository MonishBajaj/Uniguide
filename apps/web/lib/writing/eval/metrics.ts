/** Rank correlation between two score lists (average ranks for ties). */
export function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const sorted = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const ranks = new Array<number>(xs.length);
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1]![0] === sorted[i]![0]) j++;
      for (let k = i; k <= j; k++) ranks[sorted[k]![1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return ranks;
  };
  const ra = rank(a);
  const rb = rank(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function variance(xs: number[]): number {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
}

export const overall = (scores: number[]) => scores.reduce((s, x) => s + x, 0) / scores.length;
