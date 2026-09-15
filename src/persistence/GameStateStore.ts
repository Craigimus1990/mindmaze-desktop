import type { SavedGame } from '@/persistence/SavedGame'
import { NotEnvelopeError, deserializeSavedGame, serializeSavedGame } from '@/persistence/SavedGame'
import { deserializeGameState } from '@/persistence/serialization'
import type { MindMazeBridge } from '@/types/window'

/**
 * Reads and writes the two save slots — the active in-progress game and the cross-session
 * saved game — through the sandboxed bridge.
 *
 * Takes a `MindMazeBridge` (or a fake matching its shape) by constructor injection rather than
 * reaching for `window.mindmaze` directly, so the store can be unit-tested with an in-memory
 * `Map<string, string>` and no Electron runtime — mirroring how the Kotlin version took an
 * injected `Context` in its constructor and was tested with Robolectric.
 */
export class GameStateStore {
  constructor(private readonly bridge: MindMazeBridge) {}

  saveActive(game: SavedGame): Promise<void> {
    return this.bridge.saveActive(serializeSavedGame(game))
  }

  loadActive(): Promise<SavedGame | null> {
    return this.readSlot(() => this.bridge.loadActive())
  }

  clearActive(): Promise<void> {
    return this.bridge.clearActive()
  }

  saveCrossSession(game: SavedGame): Promise<void> {
    return this.bridge.saveSaved(serializeSavedGame(game))
  }

  loadCrossSession(): Promise<SavedGame | null> {
    return this.readSlot(() => this.bridge.loadSaved())
  }

  clearSaved(): Promise<void> {
    return this.bridge.clearSaved()
  }

  /**
   * Reads a save slot, falling back to the pre-envelope format.
   *
   * Files written before `entryDirection` was persisted hold a bare `GameState` rather than a
   * `SavedGame` envelope. `deserializeSavedGame` throws `NotEnvelopeError` specifically when the
   * JSON does not have the envelope's shape at all — as opposed to its ordinary `Error` for an
   * envelope-shaped file with corrupt contents (bad version, bogus enum, etc). Only the former is
   * retried as legacy; the latter is a genuine corrupt save and must not be silently
   * reinterpreted as an old-format file, so it propagates and this file loads as null. Without
   * the legacy fallback at all, an upgrade would throw on launch and strand the player's game —
   * this mirrors Kotlin's `GameStateStore.readFile`.
   */
  private async readSlot(read: () => Promise<string | null>): Promise<SavedGame | null> {
    const text = await read()
    if (text === null) return null

    try {
      return deserializeSavedGame(text)
    } catch (e) {
      if (!(e instanceof NotEnvelopeError)) {
        // Envelope-shaped but corrupt (or JSON.parse failed inside it) — not a legacy-format
        // question. Degrade to null rather than propagate: a save file must never crash launch.
        return null
      }
    }

    try {
      const state = deserializeGameState(text)
      return { state, entryDirection: null }
    } catch {
      // Neither an envelope nor a bare GameState — genuinely unparseable. Degrade, never throw.
      return null
    }
  }
}
