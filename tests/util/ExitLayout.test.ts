import { describe, it, expect } from 'vitest'
import { forEntry } from '@/util/ExitLayout'
import { DIRECTIONS, opposite } from '@/engine/model/Direction'

/**
 * entryDirection points *back* the way the player came, so the player faces its opposite.
 * Each case below names the facing explicitly, because asserting compass values alone is what
 * let a left/right swap sit here green: the original tests asserted the mirrored layout, so
 * the suite locked the bug in rather than catching it.
 */
describe('ExitLayout.forEntry', () => {
  it('entered from EAST so facing WEST - left is SOUTH, right is NORTH', () => {
    const layout = forEntry('EAST')
    expect(layout.center).toBe('WEST')
    expect(layout.left).toBe('SOUTH')
    expect(layout.right).toBe('NORTH')
  })

  it('entered from WEST so facing EAST - left is NORTH, right is SOUTH', () => {
    const layout = forEntry('WEST')
    expect(layout.center).toBe('EAST')
    expect(layout.left).toBe('NORTH')
    expect(layout.right).toBe('SOUTH')
  })

  it('entered from NORTH so facing SOUTH - left is EAST, right is WEST', () => {
    const layout = forEntry('NORTH')
    expect(layout.center).toBe('SOUTH')
    expect(layout.left).toBe('EAST')
    expect(layout.right).toBe('WEST')
  })

  it('entered from SOUTH so facing NORTH - left is WEST, right is EAST', () => {
    const layout = forEntry('SOUTH')
    expect(layout.center).toBe('NORTH')
    expect(layout.left).toBe('WEST')
    expect(layout.right).toBe('EAST')
  })

  it('start room with no entry direction faces NORTH by convention', () => {
    const layout = forEntry(null)
    expect(layout.center).toBe('NORTH')
    expect(layout.left).toBe('WEST')
    expect(layout.right).toBe('EAST')
  })

  /** Straight ahead is always the way back out — the property that stayed correct through
   *  the swap, and the reason forward play never surfaced it. */
  it('center is always the reverse of the entry direction', () => {
    DIRECTIONS.forEach((entry) => {
      expect(forEntry(entry).center).toBe(opposite(entry))
    })
  })

  /** Left and right must be mirror images. A layout that got the handedness backwards would
   *  still satisfy this, but a layout that scrambled them independently would not. */
  it('left and right are always opposites of each other', () => {
    DIRECTIONS.forEach((entry) => {
      const layout = forEntry(entry)
      expect(opposite(layout.left)).toBe(layout.right)
    })
  })

  /**
   * Pins the handedness itself, which is the thing that was wrong.
   *
   * Turning left from a facing is a fixed 90° rotation: NORTH->WEST->SOUTH->EAST->NORTH.
   * Deriving it independently here means a future edit to the table has to agree with
   * an actual rotation, not merely with whatever the table already said.
   */
  it('left is a ninety degree counter-clockwise turn from the facing', () => {
    const leftOf: Record<string, string> = {
      NORTH: 'WEST',
      WEST: 'SOUTH',
      SOUTH: 'EAST',
      EAST: 'NORTH',
    }
    DIRECTIONS.forEach((entry) => {
      const facing = opposite(entry)
      const layout = forEntry(entry)
      expect(layout.left).toBe(leftOf[facing])
    })
  })

  // entryDirection points BACK the way the player came, so the player faces its opposite
  // and that facing is always the centre — straight ahead is the way back out.
  it('entering from the north faces south', () => {
    expect(forEntry('NORTH')).toEqual({ left: 'EAST', center: 'SOUTH', right: 'WEST' })
  })

  it('entering from the south faces north', () => {
    expect(forEntry('SOUTH')).toEqual({ left: 'WEST', center: 'NORTH', right: 'EAST' })
  })

  it('entering from the east faces west', () => {
    expect(forEntry('EAST')).toEqual({ left: 'SOUTH', center: 'WEST', right: 'NORTH' })
  })

  it('entering from the west faces east', () => {
    expect(forEntry('WEST')).toEqual({ left: 'NORTH', center: 'EAST', right: 'SOUTH' })
  })

  it('the start room faces north by convention', () => {
    expect(forEntry(null)).toEqual({ left: 'WEST', center: 'NORTH', right: 'EAST' })
  })

  it('left and right take the player perspective, not the map', () => {
    // Facing NORTH puts WEST on the left; facing SOUTH puts EAST there. Getting this backwards
    // is invisible in forward play and only shows up after backtracking.
    expect(forEntry('SOUTH').left).toBe('WEST')
    expect(forEntry('NORTH').left).toBe('EAST')
  })
})
