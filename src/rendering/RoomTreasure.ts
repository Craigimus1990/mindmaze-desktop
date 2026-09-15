import type { Pickup } from '../engine/model/Room'
import { bucket } from './hash'
import { DOOR_X } from './RoomGeometry'

export const COIN_POINTS = 100
export const JEWEL_POINTS = 400

/** Tap tolerance, in pane fractions. */
export const HIT_RADIUS = 0.09

/** The key is always centred and low, where it cannot be walked past. */
export const KEY_X = 0.5
export const KEY_Y = 0.86

/** Fraction of coin rooms that hold a jewel instead. */
const JEWEL_RATE = 0.2

const COINS = ['pickup_coin', 'pickup_coin_stack']
const JEWELS = ['pickup_jewel_ruby', 'pickup_jewel_emerald', 'pickup_jewel_sapphire']

/**
 * Minimum distance a treasure keeps from any door centre.
 *
 * The room pane doubles as the movement control — tapping left, centre or right walks through
 * that door — so a coin sitting on a door would steal the tap meant for it.
 */
const DOOR_CLEARANCE = 0.11

const BUCKETS = 1024

/**
 * A tappable coin, jewel or key sitting in a room.
 *
 * Coins used to be collected simply by walking in, which made them invisible as a reward — the
 * score went up and nothing on screen explained why. Now they are drawn in the room and have to
 * be tapped, so finding one is an act rather than a side effect.
 *
 * Position and kind are *derived* from the room id, exactly as `themeFor` (backdropName.ts) and
 * `PlacementMap` derive a backdrop and a character. That keeps them stable across save/reload
 * with nothing added to the engine's save format, and — importantly — independent of the door
 * configuration, which changes as the player turns around. Deriving from the config instead would
 * make a coin jump across the room on re-entry, the same bug that hit room themes.
 *
 * Keys work the same way. A key is the one pickup a player must not miss, which is precisely why
 * it is worth drawing where they can see it rather than adding it silently to an inventory — and
 * the locked treasure door now says outright that a key is needed. Hints still auto-collect: they
 * are a small bonus with no art of their own.
 */
export interface RoomTreasure {
  readonly asset: string
  readonly x: number
  readonly y: number
  readonly isJewel: boolean
  /** A key is picked up rather than scored; it opens the treasure door. */
  readonly isKey: boolean
}

export const treasurePoints = (t: Pick<RoomTreasure, 'isKey' | 'isJewel'>): number => {
  if (t.isKey) return 0
  return t.isJewel ? JEWEL_POINTS : COIN_POINTS
}

/**
 * Whether a tap at these pane fractions lands on this treasure.
 *
 * Generous on purpose: the target is small and the players are small, so the hit area is wider
 * than the art. {@link HIT_RADIUS} stays under half the clearance kept from each doorway, so a
 * generous tap still cannot swallow a door tap.
 */
export const hitTestTreasure = (t: Pick<RoomTreasure, 'x' | 'y'>, tapX: number, tapY: number): boolean => {
  const dx = tapX - t.x
  const dy = tapY - t.y
  return dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS
}

/**
 * An x that clears every doorway.
 *
 * Walks candidate positions rather than nudging one: nudging piles treasures up against the same
 * clearance boundary, so they all end up in the same few spots.
 */
const placeX = (roomId: number): number => {
  const start = bucket(roomId, 0x13c7, BUCKETS)
  for (let i = 0; i < BUCKETS; i++) {
    const candidate = 0.08 + (((start + i) % BUCKETS) / BUCKETS) * 0.84
    if (DOOR_X.every((dx) => Math.abs(candidate - dx) > DOOR_CLEARANCE)) return candidate
  }
  // Unreachable with the current door layout, but a safe corner beats an exception.
  return 0.08
}

export const roomTreasureFor = (roomId: number, pickup: Pickup): RoomTreasure | null => {
  // A key is tappable too, and placed by the same rules so it also clears the doorways. It is
  // the one pickup the player must not miss, which is exactly why it is worth drawing in the
  // room rather than silently adding to an inventory they never saw.
  if (pickup.type === 'Key') {
    return {
      asset: 'pickup_key',
      // Centred and low, rather than scattered like a coin. The key is the one pickup a player
      // must not miss, so it is put where the eye goes first.
      //
      // Centre-screen is also the CENTRE DOOR's x, and the treasure hit-test runs before the
      // door check — so a key at the door's own height would swallow taps meant for it. KEY_Y
      // sits well below: 0.26 from the door centre at 0.60, against a hit radius of 0.09.
      x: KEY_X,
      y: KEY_Y,
      isJewel: false,
      isKey: true,
    }
  }
  if (pickup.type !== 'Coin') return null

  const isJewel = bucket(roomId, 0x5c1d, BUCKETS) < Math.trunc(JEWEL_RATE * BUCKETS)
  const pool = isJewel ? JEWELS : COINS
  const asset = pool[bucket(roomId, 0x2a6f, pool.length)]

  return {
    asset: asset ?? pool[0]!,
    x: placeX(roomId),
    // Treasure sits on the floor, below the horizon, in the lower half of the pane.
    y: 0.58 + (bucket(roomId, 0x77b3, BUCKETS) / BUCKETS) * 0.26,
    isJewel,
    isKey: false,
  }
}
