import type { Direction } from './Direction'
import type { DoorState } from './types'

export type ExitType =
  | { readonly type: 'Absent' }
  | { readonly type: 'Door'; readonly state: DoorState }
  | { readonly type: 'Gate'; readonly pairId: string; readonly open: boolean }

export const ABSENT: ExitType = { type: 'Absent' }
export const door = (state: DoorState): ExitType => ({ type: 'Door', state })
export const gate = (pairId: string, open: boolean): ExitType =>
  ({ type: 'Gate', pairId, open })

export type Pickup =
  | { readonly type: 'None' }
  | { readonly type: 'Coin' }
  | { readonly type: 'Key' }
  | { readonly type: 'Hint' }

export const PICKUP_NONE: Pickup = { type: 'None' }
export const PICKUP_COIN: Pickup = { type: 'Coin' }
export const PICKUP_KEY: Pickup = { type: 'Key' }
export const PICKUP_HINT: Pickup = { type: 'Hint' }

export interface Room {
  readonly id: number
  readonly exits: ReadonlyMap<Direction, ExitType>
  readonly pickup: Pickup
  readonly buttonGatePairId: string | null
}

export const makeRoom = (
  id: number,
  exits: ReadonlyMap<Direction, ExitType> = new Map(),
  pickup: Pickup = PICKUP_NONE,
  buttonGatePairId: string | null = null,
): Room => ({ id, exits, pickup, buttonGatePairId })
