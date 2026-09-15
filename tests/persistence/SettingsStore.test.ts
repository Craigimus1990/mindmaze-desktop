import { describe, it, expect, beforeEach } from 'vitest'
import { SettingsStore } from '@/persistence/SettingsStore'
import type { MindMazeBridge } from '@/types/window'
import { TOPICS } from '@/engine/model/types'
import type { GameSettings } from '@/engine/model/types'

/** Ported from Kotlin's SettingsStoreTest. Uses a fake bridge backed by an in-memory Map. */
const fakeBridge = (): MindMazeBridge => {
  const files = new Map<string, string>()
  return {
    loadActive: async () => null,
    saveActive: async () => {},
    clearActive: async () => {},
    loadSaved: async () => null,
    saveSaved: async () => {},
    clearSaved: async () => {},
    loadSettings: async () => files.get('settings.json') ?? null,
    saveSettings: async (json) => void files.set('settings.json', json),
    loadCustomQuestions: async () => null,
    saveCustomQuestions: async () => {},
  }
}

describe('SettingsStore', () => {
  let store: SettingsStore

  beforeEach(() => {
    store = new SettingsStore(fakeBridge())
  })

  it('default settings have KINDERGARTEN difficulty', async () => {
    expect((await store.load()).difficulty).toBe('KINDERGARTEN')
  })

  it('default settings have all topics selected', async () => {
    expect([...(await store.load()).topics].sort()).toEqual([...TOPICS].sort())
  })

  it('default complexity is SIMPLE', async () => {
    expect((await store.load()).complexity).toBe('SIMPLE')
  })

  it('saved settings survive round-trip', async () => {
    const settings: GameSettings = {
      topics: new Set(['MATH', 'SCIENCE']),
      difficulty: 'ADULT',
      complexity: 'HARD',
    }
    await store.save(settings)
    const loaded = await store.load()
    expect(loaded.difficulty).toBe(settings.difficulty)
    expect(loaded.complexity).toBe(settings.complexity)
    expect([...loaded.topics].sort()).toEqual([...settings.topics].sort())
  })

  it('default musicEnabled is true', async () => {
    expect(await store.musicEnabled()).toBe(true)
  })

  it('setMusicEnabled persists across loads', async () => {
    await store.setMusicEnabled(false)
    expect(await store.musicEnabled()).toBe(false)
    await store.setMusicEnabled(true)
    expect(await store.musicEnabled()).toBe(true)
  })

  it('musicEnabled survives independently of a settings save', async () => {
    // Guards the doc-comment reasoning: musicEnabled is not a field on GameSettings, so saving
    // settings must not disturb it and vice versa.
    await store.setMusicEnabled(false)
    await store.save({ topics: new Set(['HISTORY']), difficulty: 'ADULT', complexity: 'HARD' })
    expect(await store.musicEnabled()).toBe(false)
  })
})
