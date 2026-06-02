/** Bjorklund / Euclidean rhythm — evenly distributes pulses across steps */
export function euclidean(pulses: number, steps: number, rotation = 0): boolean[] {
  if (steps <= 0) return [];
  const p = Math.max(0, Math.min(pulses, steps));
  if (p === 0) return new Array(steps).fill(false);
  if (p === steps) return new Array(steps).fill(true);

  let pattern = bjorklund(p, steps);
  if (rotation !== 0) {
    const r = ((rotation % steps) + steps) % steps;
    pattern = [...pattern.slice(r), ...pattern.slice(0, r)];
  }
  return pattern;
}

function bjorklund(pulses: number, steps: number): boolean[] {
  const pattern: boolean[] = [];
  const counts: number[] = [];
  const remainders: number[] = [pulses];

  let divisor = steps - pulses;
  let level = 0;

  while (true) {
    counts.push(Math.floor(divisor / remainders[level]!));
    remainders.push(divisor % remainders[level]!);
    divisor = remainders[level]!;
    level++;
    if (remainders[level]! <= 1) break;
  }
  counts.push(divisor);

  const build = (lvl: number): void => {
    if (lvl === -1) {
      pattern.push(false);
    } else if (lvl === -2) {
      pattern.push(true);
    } else {
      for (let i = 0; i < counts[lvl]!; i++) build(lvl - 1);
      if (remainders[lvl]! !== 0) build(lvl - 2);
    }
  };

  build(level);
  return pattern.slice(0, steps);
}

/** Step hit with optional humanization */
export function euclideanHit(
  pattern: boolean[],
  step: number,
  probability = 0.85,
): boolean {
  if (!pattern[step % pattern.length]) return false;
  return Math.random() < probability;
}
