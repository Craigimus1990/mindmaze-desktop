import type { Direction } from '../engine/model/Direction'

export interface ExitLayout {
  readonly left: Direction
  readonly center: Direction
  readonly right: Direction
}

/**
 * Lays out a room's exits relative to the player's view.
 *
 * `entryDirection` points *back* the way the player came (GameViewModel records
 * `opposite(moved)`), so the player faces its opposite, and that facing goes in `center` —
 * straight ahead is always the way back out.
 *
 * Left and right follow from the facing, taking the player's perspective rather than a map's:
 * facing NORTH puts WEST on the left, but facing SOUTH puts EAST there. Getting this backwards
 * is invisible in forward play — `center` is unaffected — and only shows up as a door appearing
 * on the wrong side after backtracking.
 */
export const forEntry = (entryDirection: Direction | null): ExitLayout => {
  switch (entryDirection) {
    case 'NORTH': return { left: 'EAST', center: 'SOUTH', right: 'WEST' }   // facing SOUTH
    case 'SOUTH': return { left: 'WEST', center: 'NORTH', right: 'EAST' }   // facing NORTH
    case 'EAST':  return { left: 'SOUTH', center: 'WEST', right: 'NORTH' }  // facing WEST
    case 'WEST':  return { left: 'NORTH', center: 'EAST', right: 'SOUTH' }  // facing EAST
    // Start room: nothing entered from, so face NORTH by convention.
    case null:    return { left: 'WEST', center: 'NORTH', right: 'EAST' }
  }
}
