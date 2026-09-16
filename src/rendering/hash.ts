/**
 * The 32-bit integer avalanche PlacementMap and RoomTreasure both key off.
 *
 * Math.imul, not `*`: Kotlin Int multiplication wraps at 32 bits and JavaScript's does not, so a
 * plain `*` silently lands in a different bucket and moves a room's character or treasure. `>>>`
 * matches Kotlin's `ushr`; `>>` would sign-extend and diverge on negative intermediates.
 */
export const avalanche = (roomId: number, salt: number): number => {
  let h = (Math.imul(roomId, -0x61c88647) ^ salt) | 0
  h = (h ^ (h >>> 15)) | 0
  h = Math.imul(h, -0x7ee3623b)
  return (h ^ (h >>> 13)) | 0
}

/** Kotlin's Math.floorMod — JS `%` keeps the sign of the dividend, which would throw off indexing. */
export const floorMod = (a: number, n: number): number => ((a % n) + n) % n

/** floorMod(avalanche(...), buckets), the form both call sites use. */
export const bucket = (roomId: number, salt: number, buckets: number): number =>
  floorMod(avalanche(roomId, salt), buckets)
