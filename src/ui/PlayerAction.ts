import type { Direction } from '../engine/model/Direction'

/**
 * Every player intent. Mouse and keyboard both produce these, so the two input paths
 * cannot diverge in behaviour.
 */
export type PlayerAction =
  | { readonly type: 'AttemptDoor'; readonly direction: Direction }
  | { readonly type: 'Move'; readonly direction: Direction }
  | { readonly type: 'MoveBack' }
  | { readonly type: 'UseKey' }
  | { readonly type: 'UseHint' }
  /** Clicking a coin or jewel drawn in the room. `points` depends on which was shown. */
  | { readonly type: 'CollectTreasure'; readonly points: number }
  | { readonly type: 'CollectPickup' }
  | { readonly type: 'PressButton' }
  /** Clicking the windlass sprite in a windlass chamber. */
  | { readonly type: 'TurnWindlass' }
  | { readonly type: 'SubmitAnswer'; readonly index: number }
