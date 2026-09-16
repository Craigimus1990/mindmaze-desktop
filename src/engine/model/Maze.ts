import type { GatePair } from './types'
import type { Room } from './Room'

/**
 * What stands between the player and the treasure room.
 *
 * Every door into the treasure room carries the same barrier, so the final room cannot be reached
 * by wandering into it from a lucky direction — the point is that the player has to go and *do*
 * something first.
 *
 * Which barrier is used depends on Complexity, not on trivia Difficulty: this is about the
 * shape of the maze, while Difficulty is only about how hard the questions are.
 */
export type TreasureLock =
  /** SIMPLE: nothing blocks the treasure. */
  | { readonly type: 'Open' }
  /**
   * MEDIUM: one key, hidden in a room somewhere off the path to the treasure.
   *
   * keyRoomId is recorded so the generator's guarantee — that the key is reachable without
   * passing through the door it opens — can be asserted rather than hoped for.
   */
  | { readonly type: 'Locked'; readonly keyRoomId: number }
  /**
   * HARD: two windlass rooms, each raised by answering QUESTIONS_PER_WINDLASS questions.
   *
   * completed holds the room ids whose windlass has been fully raised. The gate opens only
   * once both are in the set; a partially-answered windlass keeps its progress in
   * GameState.windlassProgress rather than here, so this stays a record of finished work.
   */
  | {
      readonly type: 'Barred'
      readonly windlassRoomIds: ReadonlySet<number>
      readonly completed: ReadonlySet<number>
    }

export const TREASURE_OPEN: TreasureLock = { type: 'Open' }

/** Kotlin had this as a property on Barred; TypeScript unions carry no methods. */
export const isRaised = (lock: TreasureLock): boolean =>
  lock.type === 'Barred' &&
  [...lock.windlassRoomIds].every((id) => lock.completed.has(id))

/**
 * The number of consecutive correct answers a windlass requires to open the gate.
 */
export const QUESTIONS_PER_WINDLASS = 3

/**
 * Whether a wrong answer discards progress on the current windlass.
 *
 * Reset-to-zero was chosen deliberately, so three correct in a row are needed. This is easy to
 * underestimate: at a 75% answer rate a clean run of three lands about 42% of the time, so each
 * windlass takes ~2.4 attempts and there are two of them. If that proves frustrating in play,
 * flipping this to false keeps partial progress and turns each windlass into three questions
 * total rather than three consecutive.
 */
export const WRONG_ANSWER_RESETS = true

export interface Maze {
  readonly rooms: ReadonlyMap<number, Room>
  readonly gatePairs: ReadonlyMap<string, GatePair>
  readonly startId: number
  readonly treasureId: number
  readonly treasureLock: TreasureLock
}
