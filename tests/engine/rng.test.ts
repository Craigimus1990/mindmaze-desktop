import { describe, it, expect } from 'vitest'
import { makeRng } from '@/engine/engine/rng'

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const drawA = Array.from({ length: 20 }, () => a.nextInt(1000))
    const drawB = Array.from({ length: 20 }, () => b.nextInt(1000))
    expect(drawA).toEqual(drawB)
  })

  it('differs across seeds', () => {
    const a = Array.from({ length: 20 }, () => makeRng(1).nextInt(1000))
    const b = Array.from({ length: 20 }, () => makeRng(2).nextInt(1000))
    expect(a).not.toEqual(b)
  })

  it('nextInt stays within [0, bound)', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const n = rng.nextInt(10)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(10)
    }
  })

  it('shuffled preserves every element', () => {
    const rng = makeRng(3)
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = rng.shuffled(source)
    expect([...shuffled].sort((x, y) => x - y)).toEqual(source)
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]) // input untouched
  })

  it('shuffled actually reorders over repeated draws', () => {
    const rng = makeRng(11)
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    const seen = new Set(
      Array.from({ length: 20 }, () => rng.shuffled(source).join(',')),
    )
    expect(seen.size).toBeGreaterThan(1)
  })

  it('pickOrNull returns null only for an empty list', () => {
    const rng = makeRng(5)
    expect(rng.pickOrNull([])).toBeNull()
    expect(rng.pickOrNull(['only'])).toBe('only')
  })

  it('pick draws from the list', () => {
    const rng = makeRng(9)
    const items = ['a', 'b', 'c']
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items))
  })
})
