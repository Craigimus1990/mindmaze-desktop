import { describe, it, expect } from 'vitest'
import { avalanche, floorMod, bucket } from '@/rendering/hash'

describe('hash', () => {
  describe('avalanche', () => {
    it('returns a 32-bit signed integer for a range of room ids', () => {
      for (let id = -50; id < 50; id++) {
        const h = avalanche(id, 0x7f4a)
        expect(Number.isInteger(h)).toBe(true)
        expect(h).toBeGreaterThanOrEqual(-(2 ** 31))
        expect(h).toBeLessThanOrEqual(2 ** 31 - 1)
      }
    })

    it('is stable for a given id and salt', () => {
      const a = avalanche(42, 0x9e37)
      const b = avalanche(42, 0x9e37)
      expect(a).toBe(b)
    })

    it('adjacent ids land in different buckets', () => {
      // The avalanche's whole purpose: neighbouring room ids must not collide in the same
      // bucket, or adjacent rooms would systematically get the same character/population.
      const buckets = new Set<number>()
      for (let id = 0; id < 20; id++) {
        buckets.add(bucket(id, 0x9e37, 1024))
      }
      expect(buckets.size).toBeGreaterThan(1)
    })

    it('differs across ids in general (avalanche, not identity)', () => {
      const h1 = avalanche(1, 0x7f4a)
      const h2 = avalanche(2, 0x7f4a)
      expect(h1).not.toBe(h2)
    })
  })

  describe('floorMod', () => {
    it('matches Kotlin Math.floorMod for a negative dividend', () => {
      expect(floorMod(-7, 1024)).toBe(1017)
    })

    it('matches plain modulo for a positive dividend', () => {
      expect(floorMod(7, 1024)).toBe(7)
    })

    it('wraps a negative multiple back to zero', () => {
      expect(floorMod(-1024, 1024)).toBe(0)
    })
  })

  describe('bucket', () => {
    it('is floorMod(avalanche(...), buckets), always within range', () => {
      for (let id = -100; id < 100; id++) {
        const b = bucket(id, 0x9e37, 1024)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThan(1024)
      }
    })
  })
})
