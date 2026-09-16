import { describe, expect, it } from 'vitest'
import { GATES, indexFor } from '@/react/screens/MenuBackdrop'
import { hasAsset } from '@/rendering/assetManifest'

/**
 * Covers the launch-time gate selection.
 *
 * Only `indexFor` is exercised: `current` reads the clock and resolves once at module load, so
 * asserting on it would test module-init timing rather than any logic of ours. The index function
 * is where the actual behaviour lives.
 *
 * Kotlin's MenuBackdropTest asserted on R.drawable ints; here the names are asserted to resolve
 * through `assetManifest`, which is the equivalent "the art actually exists" check.
 */
describe('MenuBackdrop', () => {
  const size = GATES.length

  it('index is always a valid position in the gate list', () => {
    // Includes 0 and a negative, which is what floorMod is there for — a plain % would
    // return a negative index and read undefined out of the list.
    for (const t of [0, 1, 999, Number.MAX_SAFE_INTEGER, -1, -12345]) {
      const i = indexFor(t)
      expect(i, `indexFor(${t}) = ${i}, outside 0..${size - 1}`).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(size)
    }
  })

  it('the same launch timestamp always picks the same gate', () => {
    // The selection must be a pure function of the timestamp: MenuScreen re-renders on every
    // settings chip click, and a gate that moved under the player would flicker constantly.
    const t = 1_754_236_800_000
    expect(indexFor(t)).toBe(indexFor(t))
  })

  it('consecutive milliseconds walk the whole rotation', () => {
    // Guards against a selection that collapses onto one gate. Every gate must be reachable,
    // or the extra art is dead weight.
    const seen = new Set(Array.from({ length: size }, (_, i) => indexFor(i)))
    expect(seen.size).toBe(size)
  })

  it('realistic launch times spread across the gates', () => {
    // Wall-clock millis at launch are effectively arbitrary, so a run of plausible timestamps
    // should hit every gate rather than favouring one. Sampling at a prime-ish stride avoids
    // accidentally aligning with the modulus.
    const base = 1_754_236_800_000
    const seen = new Set(Array.from({ length: 300 }, (_, i) => indexFor(base + i * 7919)))
    expect(seen.size).toBe(size)
  })

  it('every gate in the rotation is distinct', () => {
    expect(new Set(GATES).size).toBe(size)
  })

  it('every gate name resolves to a bundled drawable', () => {
    for (const name of GATES) expect(hasAsset(name), name).toBe(true)
  })
})
