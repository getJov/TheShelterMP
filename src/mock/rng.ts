/**
 * mulberry32 — small, fast, fully deterministic.
 * No Math.random() anywhere in src/mock. The same seed must produce a
 * byte-identical dataset on every run or the demo changes between reloads.
 */
export function createRng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    float: (min: number, max: number) => min + next() * (max - min),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    bool: (p = 0.5) => next() < p,
    weighted: <T>(xs: readonly (readonly [T, number])[]): T => {
      const total = xs.reduce((s, [, w]) => s + w, 0)
      let r = next() * total
      for (const [v, w] of xs) {
        r -= w
        if (r <= 0) return v
      }
      return xs[xs.length - 1]![0]
    },
    shuffle: <T>(xs: T[]): T[] => {
      const out = [...xs]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j]!, out[i]!]
      }
      return out
    },
  }
}

export type Rng = ReturnType<typeof createRng>

/** Change this and the whole park changes. */
export const SEED = 20260729
