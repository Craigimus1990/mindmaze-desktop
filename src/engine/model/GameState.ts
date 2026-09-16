import type { Maze } from './Maze'
import type { GameSettings, Inventory } from './types'

export interface GameState {
  readonly maze: Maze
  readonly currentRoomId: number
  readonly visitedRoomIds: ReadonlySet<number>
  readonly inventory: Inventory
  readonly coinsCollected: number
  /**
   * Bonus points from jewels, over and above what coinsCollected already scores.
   *
   * Kept separate because ScoreCalculator multiplies the coin COUNT by COIN_POINTS; folding a
   * jewel's value into that field would multiply it again and score 40,000 for one gem.
   */
  readonly treasureBonus: number
  /**
   * Correct answers banked at each windlass so far, keyed by room id.
   *
   * Separate from Maze.treasureLock's completed set: that records finished windlasses, this
   * records work in progress. Held on the state rather than the room so it survives save/reload
   * without changing the Room shape.
   */
  readonly windlassProgress: ReadonlyMap<number, number>
  readonly correctAnswers: number
  readonly elapsedMillis: number
  readonly settings: GameSettings
  readonly isComplete: boolean
}
