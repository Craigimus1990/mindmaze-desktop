import { describe, it, expect, beforeEach } from 'vitest'
import { GameStateStore } from '@/persistence/GameStateStore'
import { serializeGameState } from '@/persistence/serialization'
import type { MindMazeBridge } from '@/types/window'
import type { GameState } from '@/engine/model/GameState'
import { door, makeRoom } from '@/engine/model/Room'

/**
 * Ported from Kotlin's GameStateStoreTest.
 *
 * The Kotlin test used Robolectric's real filesystem via a File-backed Context. Here the store
 * is given a fake bridge — an in-memory Map keyed by filename — so the suite needs no Electron
 * and no disk. This mirrors what `electron/preload.ts` actually exposes: read/write/delete by
 * a fixed filename, returning null for a missing file.
 */
const fakeBridge = (): MindMazeBridge => {
  const files = new Map<string, string>()
  return {
    loadActive: async () => files.get('game_state.json') ?? null,
    saveActive: async (json) => void files.set('game_state.json', json),
    clearActive: async () => void files.delete('game_state.json'),
    loadSaved: async () => files.get('saved_game.json') ?? null,
    saveSaved: async (json) => void files.set('saved_game.json', json),
    clearSaved: async () => void files.delete('saved_game.json'),
    loadSettings: async () => files.get('settings.json') ?? null,
    saveSettings: async (json) => void files.set('settings.json', json),
    loadCustomQuestions: async () => files.get('custom_questions.json') ?? null,
    saveCustomQuestions: async (json) => void files.set('custom_questions.json', json),
    // Expose the backing map for legacy-format / corruption tests that need to write raw text.
    __files: files,
  } as MindMazeBridge & { __files: Map<string, string> }
}

const sampleState = (): GameState => ({
  maze: {
    rooms: new Map([
      [0, makeRoom(0, new Map([['EAST', door('OPEN')]]), { type: 'None' }, null)],
      [1, makeRoom(1, new Map([['WEST', door('OPEN')]]), { type: 'None' }, null)],
    ]),
    gatePairs: new Map(),
    startId: 0,
    treasureId: 1,
    treasureLock: { type: 'Open' },
  },
  currentRoomId: 0,
  visitedRoomIds: new Set([0]),
  inventory: { keys: 0, hints: 0 },
  coinsCollected: 0,
  treasureBonus: 0,
  windlassProgress: new Map(),
  correctAnswers: 0,
  elapsedMillis: 1000,
  settings: { topics: new Set(['MATH']), difficulty: 'KINDERGARTEN', complexity: 'SIMPLE' },
  isComplete: false,
})

describe('GameStateStore', () => {
  let bridge: MindMazeBridge & { __files: Map<string, string> }
  let store: GameStateStore

  beforeEach(() => {
    bridge = fakeBridge() as MindMazeBridge & { __files: Map<string, string> }
    store = new GameStateStore(bridge)
  })

  it('active state is null when nothing saved', async () => {
    expect(await store.loadActive()).toBeNull()
  })

  it('save and load active state round-trips', async () => {
    const state = sampleState()
    await store.saveActive({ state, entryDirection: null })
    const loaded = await store.loadActive()
    expect(loaded?.state).toEqual(state)
  })

  it('clearActive removes active state', async () => {
    await store.saveActive({ state: sampleState(), entryDirection: null })
    await store.clearActive()
    expect(await store.loadActive()).toBeNull()
  })

  it('saved game round-trips', async () => {
    const state = sampleState()
    await store.saveCrossSession({ state, entryDirection: null })
    const loaded = await store.loadCrossSession()
    expect(loaded?.state).toEqual(state)
  })

  it('clearSaved removes saved game', async () => {
    await store.saveCrossSession({ state: sampleState(), entryDirection: null })
    await store.clearSaved()
    expect(await store.loadCrossSession()).toBeNull()
  })

  it('entryDirection round-trips', async () => {
    await store.saveActive({ state: sampleState(), entryDirection: 'SOUTH' })
    const loaded = await store.loadActive()
    expect(loaded?.entryDirection).toBe('SOUTH')
  })

  it('entryDirection round-trips as null for a start room', async () => {
    await store.saveActive({ state: sampleState(), entryDirection: null })
    const loaded = await store.loadActive()
    expect(loaded?.entryDirection).toBeNull()
  })

  /**
   * Saves written before entryDirection was persisted hold a bare GameState (from
   * `serializeGameState`, not the `SavedGame` envelope). Decoding one must not throw — an
   * upgrade would otherwise strand the player's in-flight game.
   *
   * This is the carry-forward from Task 7: `deserializeGameState` throws a plain Error for a
   * version mismatch AND for genuine corruption, using the same "corrupt save: ..." message
   * shape. A bare envelope-shaped file (missing `state`/`entryDirection` keys but holding the
   * plain GameState fields directly) fails the envelope decode. The legacy retry must actually
   * exercise the pre-envelope format used by the real app, not a synthetic shape.
   */
  it('legacy bare GameState files still load', async () => {
    const state = sampleState()
    bridge.__files.set('game_state.json', serializeGameState(state))

    const loaded = await store.loadActive()
    expect(loaded?.state).toEqual(state)
    expect(loaded?.entryDirection).toBeNull()
  })

  it('legacy bare GameState files still load from cross-session storage', async () => {
    const state = sampleState()
    bridge.__files.set('saved_game.json', serializeGameState(state))

    const loaded = await store.loadCrossSession()
    expect(loaded?.state).toEqual(state)
    expect(loaded?.entryDirection).toBeNull()
  })

  it('unparseable save file loads as null rather than throwing', async () => {
    bridge.__files.set('game_state.json', '{ not json at all')
    await expect(store.loadActive()).resolves.toBeNull()
  })

  /**
   * The distinguishing case: a save with a bad version is a genuinely different failure from a
   * save with garbled fields, but both throw a plain Error with a "corrupt save: ..." message
   * from the shared decoder. If the legacy retry branched on "any throw", a corrupted *envelope*
   * save would be silently reinterpreted as a legacy bare GameState — and since the envelope's
   * outer shape (`{ state: {...}, entryDirection: ... }`) does not match GameState's shape
   * either, the legacy decode would ALSO throw and the file would load as null. That's the
   * correct outcome here, but only because both decodes reject it — not because the code told
   * version-mismatch and corruption apart. This test pins that a corrupt envelope save (valid
   * JSON, wrong shape, not a version issue) is discarded as null, not partially adopted.
   */
  it('corrupt envelope save (not a legacy bare GameState) loads as null', async () => {
    bridge.__files.set(
      'game_state.json',
      JSON.stringify({ state: { version: 1 }, entryDirection: null }),
    )
    await expect(store.loadActive()).resolves.toBeNull()
  })
})
