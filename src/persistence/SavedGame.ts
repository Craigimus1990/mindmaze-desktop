import type { Direction } from '@/engine/model/Direction'
import { DIRECTIONS } from '@/engine/model/Direction'
import type { GameState } from '@/engine/model/GameState'
import { deserializeGameState, serializeGameState } from '@/persistence/serialization'

/**
 * A persisted game: the engine's {@link GameState} plus the UI-layer facing direction.
 *
 * `entryDirection` is the direction the player entered the current room from. It is not part of
 * `GameState` because the engine has no notion of facing — the maze is absolute (NORTH is
 * NORTH), while the first-person room view is relative to the way the player is looking. The
 * rendering layer is the natural home for it, so it is carried here instead of on the engine
 * model.
 *
 * Without it a resumed game re-frames to start-room orientation — `ExitLayout` for a null entry
 * yields a different rotation from any real entry, so the player resumes facing the wrong way
 * with the wrong background asset, the wrong exit overlays, and no Back button until their next
 * move.
 */
export interface SavedGame {
  readonly state: GameState
  readonly entryDirection: Direction | null
}

/**
 * Envelope format version, independent of `GameState`'s own `version` field inside
 * `serialization.ts`. Bumped only if the envelope's own shape changes (e.g. a new top-level
 * field); a `GameState` format change is already versioned separately by that module.
 */
const ENVELOPE_VERSION = 1

interface SerializedSavedGame {
  readonly envelopeVersion: number
  readonly state: unknown
  readonly entryDirection: Direction | null
}

export const serializeSavedGame = (game: SavedGame): string =>
  JSON.stringify({
    envelopeVersion: ENVELOPE_VERSION,
    // state is itself a fully-formed JSON document (with its own `version` field); nesting it
    // as a parsed value here keeps this module out of the business of encoding GameState.
    state: JSON.parse(serializeGameState(game.state)) as unknown,
    entryDirection: game.entryDirection,
  } satisfies SerializedSavedGame)

/**
 * Thrown when a file does not decode as a `SavedGame` envelope at all — as opposed to
 * `deserializeGameState`'s "corrupt save" errors, which cover a file that IS envelope- or
 * GameState-shaped but has bad contents (wrong version, bogus enum, missing field). Callers use
 * this type, not string-matching on a message, to tell "wrong shape, try the legacy format" from
 * "right shape, genuinely broken".
 */
export class NotEnvelopeError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Decodes a `SavedGame` envelope.
 *
 * Distinguishing "this isn't an envelope, try the legacy bare-GameState format" from "this is an
 * envelope but corrupt" cannot be done by catching whatever `deserializeGameState` throws: that
 * function throws a plain `Error` with a `corrupt save: ...` message for BOTH a `GameState`
 * version mismatch and genuine field corruption, and an old bare-`GameState` file parses as an
 * object too, so a naive "catch and retry" would also swallow a corrupt envelope and silently
 * reinterpret it as legacy data.
 *
 * So the shape check happens here, structurally, before any GameState decoding is attempted:
 * only a file lacking the envelope's own top-level keys (`envelopeVersion`, `state`,
 * `entryDirection`) throws {@link NotEnvelopeError}. Once the shape is confirmed to be an
 * envelope, any further failure — including inside the nested `state` — is a genuine corrupt
 * save and propagates as `deserializeGameState`'s ordinary Error, which the caller does NOT
 * retry as legacy.
 */
export const deserializeSavedGame = (json: string): SavedGame => {
  const parsed: unknown = JSON.parse(json)
  if (!isObject(parsed)) {
    throw new NotEnvelopeError('not a SavedGame envelope: root is not an object')
  }
  if (
    !('envelopeVersion' in parsed) ||
    !('state' in parsed) ||
    !('entryDirection' in parsed)
  ) {
    throw new NotEnvelopeError('not a SavedGame envelope: missing envelope fields')
  }

  const entryDirection = parsed.entryDirection
  if (entryDirection !== null && !DIRECTIONS.includes(entryDirection as Direction)) {
    throw new Error(`corrupt save: entryDirection must be a Direction or null, got ${JSON.stringify(entryDirection)}`)
  }

  // From here on, any throw is a genuine corrupt-save error from the shared decoder — the shape
  // is already confirmed to be an envelope, so it must NOT be retried as legacy.
  const state = deserializeGameState(JSON.stringify(parsed.state))

  return { state, entryDirection: entryDirection as Direction | null }
}
