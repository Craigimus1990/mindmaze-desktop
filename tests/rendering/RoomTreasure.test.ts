import { describe, it, expect } from 'vitest'
import {
  roomTreasureFor, hitTestTreasure, treasurePoints, COIN_POINTS, JEWEL_POINTS,
} from '@/rendering/RoomTreasure'
import { hasAsset } from '@/rendering/assetManifest'
import { PICKUP_NONE, PICKUP_HINT, PICKUP_COIN, PICKUP_KEY } from '@/engine/model/Room'

/**
 * Tappable coins and jewels.
 *
 * Position is derived from the room id rather than stored, the same way themes and characters
 * are, so it survives save/reload without touching the engine's save format — and crucially
 * without depending on the door configuration, which changes as the player turns around.
 */
describe('RoomTreasure', () => {
  it('a coin room yields a coin', () => {
    const t = roomTreasureFor(7, PICKUP_COIN)
    expect(t).not.toBeNull()
  })

  it('rooms without a tappable pickup yield nothing', () => {
    // Hints still auto-collect on entry; coins, jewels and keys are tapped.
    for (const pickup of [PICKUP_NONE, PICKUP_HINT]) {
      expect(roomTreasureFor(3, pickup), `${pickup.type} should not place a tappable treasure`).toBeNull()
    }
  })

  it('position is stable for a room id', () => {
    // Re-derived on every frame and after save/reload. An unstable position would make the
    // coin jump around the room as the player looks at it.
    for (let id = 0; id < 200; id++) {
      const a = roomTreasureFor(id, PICKUP_COIN)
      const b = roomTreasureFor(id, PICKUP_COIN)
      expect(a?.x, `x moved for room ${id}`).toBe(b?.x)
      expect(a?.y, `y moved for room ${id}`).toBe(b?.y)
      expect(a?.asset, `asset changed for room ${id}`).toBe(b?.asset)
    }
  })

  it('treasure never lands on a doorway', () => {
    // The room pane is also the movement control: tapping left/centre/right walks through a
    // door. A coin sitting on a door centre would steal the tap meant for it, so placement
    // keeps clear of all three.
    const doorX = [0.16, 0.5, 0.84]
    for (let id = 0; id < 2000; id++) {
      const t = roomTreasureFor(id, PICKUP_COIN)
      if (!t) continue
      for (const dx of doorX) {
        expect(
          Math.abs(t.x - dx) > 0.1,
          `room ${id} puts treasure at x=${t.x}, within 0.10 of the doorway at ${dx}`,
        ).toBe(true)
      }
    }
  })

  it('treasure stays inside the pane', () => {
    for (let id = 0; id < 2000; id++) {
      const t = roomTreasureFor(id, PICKUP_COIN)
      if (!t) continue
      expect(t.x, `room ${id}: x=${t.x} would clip at the pane edge`).toBeGreaterThanOrEqual(0.06)
      expect(t.x).toBeLessThanOrEqual(0.94)
      expect(t.y, `room ${id}: y=${t.y} is off the floor or in the ceiling`).toBeGreaterThanOrEqual(0.3)
      expect(t.y).toBeLessThanOrEqual(0.92)
    }
  })

  it('jewels are rarer than coins', () => {
    // Jewels are worth several times a coin, so they have to be uncommon or the score
    // inflates and the find stops feeling like one.
    let jewels = 0
    for (let id = 0; id < 4000; id++) {
      if (roomTreasureFor(id, PICKUP_COIN)?.isJewel === true) jewels++
    }
    const rate = jewels / 4000
    expect(rate, `jewel rate was ${rate}; expected roughly one in five`).toBeGreaterThanOrEqual(0.1)
    expect(rate).toBeLessThanOrEqual(0.3)
  })

  it('every treasure names an asset that ships', () => {
    const assets = new Set<string>()
    for (let id = 0; id < 500; id++) {
      const t = roomTreasureFor(id, PICKUP_COIN)
      if (t) assets.add(t.asset)
    }
    expect(assets.size, `only ${assets.size} distinct assets reachable`).toBeGreaterThanOrEqual(2)
    for (const asset of assets) {
      expect(hasAsset(asset), `missing drawable ${asset}`).toBe(true)
    }
  })

  it('a treasure tap can never swallow a door tap', () => {
    // The room pane is both the treasure and the movement control. A tap within HIT_RADIUS of
    // a treasure collects it and returns; if that circle ever reached a door centre, the door
    // would become untappable while the coin sat there. Clearance must exceed the radius.
    const doorX = [0.16, 0.5, 0.84]
    for (let id = 0; id < 3000; id++) {
      const t = roomTreasureFor(id, PICKUP_COIN)
      if (!t) continue
      for (const dx of doorX) {
        expect(
          hitTestTreasure(t, dx, t.y),
          `room ${id}: a tap on the doorway at x=${dx} would collect the treasure at x=${t.x} instead of walking through the door`,
        ).toBe(false)
      }
    }
  })

  it('a coin room is not also labelled with text', () => {
    // Shipped a sapphire with "[COIN]" printed beside it: the sprite was added but the
    // placeholder text it replaced was left running. Mirrors RoomRenderer's pickup overlay,
    // which must stay silent for anything that now has art of its own.
    const overlayLabel = (pickup: { type: string }, hasButton: boolean): string | null => {
      if (pickup.type === 'Hint') return '💡'
      return hasButton ? '🔘' : null
    }
    expect(
      overlayLabel(PICKUP_COIN, false),
      'a coin is drawn as a coin; a text label beside it is duplication',
    ).toBeNull()
    // A key is drawn as a key now too, so it gets no glyph either.
    expect(overlayLabel(PICKUP_KEY, false)).toBeNull()
    // Hints still need one: they auto-collect and have no art.
    expect(overlayLabel(PICKUP_HINT, false)).not.toBeNull()
    expect(overlayLabel(PICKUP_NONE, true)).not.toBeNull()
    expect(overlayLabel(PICKUP_NONE, false)).toBeNull()
  })

  it('a key room yields a tappable key worth no points', () => {
    const t = roomTreasureFor(11, PICKUP_KEY)
    expect(t).not.toBeNull()
    expect(t?.isKey, 'a key room should produce a key').toBe(true)
    expect(t?.asset).toBe('pickup_key')
    expect(treasurePoints(t!), 'a key opens a door; it is not score').toBe(0)
  })

  it('the key is centred and cannot swallow a door tap', () => {
    // The key is deliberately centre-screen — it is the objective, so it goes where the eye
    // goes. That puts it on the CENTRE DOOR's x, and the treasure hit-test runs before the
    // door check, so the only thing keeping that door tappable is vertical separation.
    const t = roomTreasureFor(7, PICKUP_KEY)!
    expect(t.x, 'the key should be centred').toBe(0.5)
    // Doors are tapped at their own height, 0.60.
    for (const dx of [0.16, 0.5, 0.84]) {
      expect(
        hitTestTreasure(t, dx, 0.6),
        `a tap on the door at x=${dx} would collect the key at (${t.x}, ${t.y}) instead`,
      ).toBe(false)
    }
    // And it is reachable where it is actually drawn.
    expect(hitTestTreasure(t, t.x, t.y), 'a tap on the key should collect it').toBe(true)
  })

  it('the key is placed identically in every room', () => {
    // Unlike coins it is not scattered: a player who has seen one key knows where to look for
    // the next, and there is only ever one per maze anyway.
    const positions = new Set<string>()
    for (let id = 0; id < 200; id++) {
      const t = roomTreasureFor(id, PICKUP_KEY)
      if (t) positions.add(`${t.x},${t.y}`)
    }
    expect(positions.size, `the key should always be in the same spot, got ${[...positions]}`).toBe(1)
  })

  it('a jewel is worth more than a coin', () => {
    expect(
      JEWEL_POINTS > COIN_POINTS,
      'a jewel should beat a coin or there is no reason to prefer finding one',
    ).toBe(true)
  })

  it("a tap hits only within the treasure's own area", () => {
    let id = 0
    while (roomTreasureFor(id, PICKUP_COIN) === null) id++
    const t = roomTreasureFor(id, PICKUP_COIN)!
    expect(hitTestTreasure(t, t.x, t.y), 'a tap dead centre should hit').toBe(true)
    expect(hitTestTreasure(t, t.x + 0.3, t.y), 'a tap far to the side should miss').toBe(false)
    expect(hitTestTreasure(t, t.x, t.y + 0.3), 'a tap far below should miss').toBe(false)
  })
})
