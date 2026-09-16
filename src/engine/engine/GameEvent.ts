import type { Direction } from '../model/Direction'
import type { Pickup } from '../model/Room'
import type { TreasureLock } from '../model/Maze'
import type { TriviaQuestion } from '../model/types'

/**
 * Everything the engine can report back from an action.
 *
 * Kotlin modelled this as a sealed class; TypeScript uses a discriminated union on `type`, so
 * `assertIs<GameEvent.Moved>(e)` becomes `e.type === 'Moved'`.
 */
export type GameEvent =
  /** Player attempted a door — present this question. */
  | { readonly type: 'TriviaRequired'; readonly question: TriviaQuestion; readonly direction: Direction }
  /** Door opened after a correct answer — the player has moved to newRoomId. */
  | { readonly type: 'DoorOpened'; readonly newRoomId: number }
  /** Player moved through an already-open door or gate. */
  | { readonly type: 'Moved'; readonly newRoomId: number }
  /** Wrong trivia answer — the door stays closed. */
  | { readonly type: 'WrongAnswer' }
  | { readonly type: 'PickupCollected'; readonly pickup: Pickup }
  /** Button pressed — gate pair flipped. */
  | { readonly type: 'GateFlipped'; readonly gatePairId: string }
  /** Locked door opened with a key; the player has moved through. Emitted before Moved. */
  | { readonly type: 'DoorUnlocked'; readonly direction: Direction }
  | { readonly type: 'TreasureFound' }
  /** A windlass question was answered wrongly and that windlass slipped back to zero. */
  | { readonly type: 'WindlassSlipped'; readonly roomId: number }
  /** The player has entered a windlass chamber for the first time this game. */
  | { readonly type: 'WindlassChamberFound'; readonly roomId: number }
  /** One more correct answer banked at a windlass, but it is not finished yet. */
  | { readonly type: 'WindlassProgressed'; readonly roomId: number; readonly banked: number; readonly needed: number }
  /** A windlass was fully raised. `remaining` is how many still need raising. */
  | { readonly type: 'WindlassRaised'; readonly roomId: number; readonly remaining: number }
  /** The player returned to a windlass they have already finished. */
  | { readonly type: 'WindlassAlreadyRaised'; readonly roomId: number }
  /** Every windlass is raised and the treasure gate has opened. */
  | { readonly type: 'TreasureGateOpened' }
  /** The player tried a treasure door that is still locked or barred. */
  | { readonly type: 'TreasureBlocked'; readonly lock: TreasureLock }
  /** Action was invalid in the current state (e.g. no key in inventory). */
  | { readonly type: 'InvalidAction'; readonly reason: string }
