/**
 * Seeded randomness for maze generation.
 *
 * MazeGenerator takes an injected RNG so a seed reproduces a maze; Math.random() cannot do
 * that, so this supplies the same contract Kotlin's Random offered the generator.
 *
 * Note: a seed does NOT reproduce the Kotlin app's mazes — the bit generators differ.
 * Determinism holds within this port, which is what the tests require.
 */
export interface Rng {
  /** Uniform integer in [0, bound). */
  nextInt(bound: number): number
  nextBoolean(): boolean
  /** Kotlin's List.random(rng). Throws on an empty list, as Kotlin does. */
  pick<T>(items: readonly T[]): T
  /** Kotlin's List.randomOrNull(rng). */
  pickOrNull<T>(items: readonly T[]): T | null
  /** Kotlin's List.shuffled(rng) — returns a new list, leaves the input alone. */
  shuffled<T>(items: readonly T[]): T[]
}

/** mulberry32: small, fast, and good enough for maze layout. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fromFloat = (next: () => number): Rng => ({
  nextInt(bound: number): number {
    if (bound <= 0) throw new Error(`bound must be positive, got ${bound}`)
    return Math.floor(next() * bound)
  },
  nextBoolean(): boolean {
    return next() < 0.5
  },
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from an empty list')
    return items[Math.floor(next() * items.length)]!
  },
  pickOrNull<T>(items: readonly T[]): T | null {
    if (items.length === 0) return null
    return items[Math.floor(next() * items.length)]!
  },
  shuffled<T>(items: readonly T[]): T[] {
    // Fisher-Yates over a copy.
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      const a = out[i]!
      const b = out[j]!
      out[i] = b
      out[j] = a
    }
    return out
  },
})

export const makeRng = (seed: number): Rng => fromFloat(mulberry32(seed))

/** Time-seeded, for real games. */
export const defaultRng = (): Rng => makeRng(Date.now() ^ (Math.random() * 0x100000000))
