import type { GatePair } from './types'
import type { Room } from './Room'

export type TreasureLock =
  | { readonly type: 'Open' }
  | { readonly type: 'Locked'; readonly keyRoomId: number }
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

export const QUESTIONS_PER_WINDLASS = 3
export const WRONG_ANSWER_RESETS = true

export interface Maze {
  readonly rooms: ReadonlyMap<number, Room>
  readonly gatePairs: ReadonlyMap<string, GatePair>
  readonly startId: number
  readonly treasureId: number
  readonly treasureLock: TreasureLock
}
