import type { Complexity, Difficulty, GameSettings, Topic } from '@/engine/model/types'
import { COMPLEXITIES, DIFFICULTIES, TOPICS } from '@/engine/model/types'
import type { MindMazeBridge } from '@/types/window'

/** Defaults matching Kotlin's `SettingsStore` exactly: KINDERGARTEN, SIMPLE, every topic. */
const DEFAULT_DIFFICULTY: Difficulty = 'KINDERGARTEN'
const DEFAULT_COMPLEXITY: Complexity = 'SIMPLE'
const DEFAULT_MUSIC_ENABLED = true

interface StoredSettings {
  readonly difficulty?: unknown
  readonly complexity?: unknown
  readonly topics?: unknown
  /**
   * Whether background music plays. Kept here rather than on `GameSettings` because that is the
   * engine's model and gets serialised into every save file — a UI preference has no business in
   * the save format, and would change it for a setting the engine never reads. Mirrors Kotlin's
   * `SettingsStore.musicEnabled`, which lived in its own SharedPreferences key for the same
   * reason.
   */
  readonly musicEnabled?: unknown
}

const isValidDifficulty = (v: unknown): v is Difficulty =>
  typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v)

const isValidComplexity = (v: unknown): v is Complexity =>
  typeof v === 'string' && (COMPLEXITIES as readonly string[]).includes(v)

const isValidTopics = (v: unknown): v is Topic[] =>
  Array.isArray(v) && v.every((t) => (TOPICS as readonly string[]).includes(t as string))

/**
 * Persists `GameSettings` (topics, difficulty, complexity) and the separate `musicEnabled`
 * preference, through the sandboxed bridge's `settings.json` slot.
 *
 * Kotlin used Android `SharedPreferences`, which degrades key-by-key: a missing or wrong-typed
 * key just falls back to its own default. `settings.json` here is a single JSON document, so the
 * same per-field tolerance is reproduced by hand in `load()` — a corrupt or missing field falls
 * back to its own default rather than discarding the whole file, matching the Kotlin behaviour
 * this replaces.
 */
export class SettingsStore {
  constructor(private readonly bridge: MindMazeBridge) {}

  async load(): Promise<GameSettings> {
    const stored = await this.readStored()
    const difficulty = isValidDifficulty(stored.difficulty) ? stored.difficulty : DEFAULT_DIFFICULTY
    const complexity = isValidComplexity(stored.complexity) ? stored.complexity : DEFAULT_COMPLEXITY
    // Deliberate divergence from Kotlin: `SharedPreferences.getStringSet(key, default)`
    // substitutes the default only when the KEY is absent, so an explicitly-persisted empty
    // set there round-trips as empty. Here, an explicitly-saved empty topic set also falls back
    // to all topics (the `.length > 0` guard below applies regardless of whether the key was
    // present).
    //
    // This state is unreachable through the UI as ported: MenuScreen.kt guards every topic
    // toggle with `if (next.isNotEmpty())`, so a player can never deselect their last topic, and
    // Task 14's menu must keep that same guard for this to stay unreachable. Kept as the safer
    // behaviour anyway, since an empty topic set would otherwise push `TriviaRepository` onto
    // its whole-bank fallback rather than the menu's intended selection.
    const topics = isValidTopics(stored.topics) && stored.topics.length > 0
      ? new Set(stored.topics)
      : new Set(TOPICS)
    return { topics, difficulty, complexity }
  }

  async save(settings: GameSettings): Promise<void> {
    const stored = await this.readStored()
    await this.writeStored({
      ...stored,
      difficulty: settings.difficulty,
      complexity: settings.complexity,
      topics: [...settings.topics],
    })
  }

  async musicEnabled(): Promise<boolean> {
    const stored = await this.readStored()
    return typeof stored.musicEnabled === 'boolean' ? stored.musicEnabled : DEFAULT_MUSIC_ENABLED
  }

  async setMusicEnabled(on: boolean): Promise<void> {
    const stored = await this.readStored()
    await this.writeStored({ ...stored, musicEnabled: on })
  }

  private async readStored(): Promise<StoredSettings> {
    const text = await this.bridge.loadSettings()
    if (text === null) return {}
    try {
      const parsed: unknown = JSON.parse(text)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as StoredSettings)
        : {}
    } catch {
      // Settings are a small on-device preferences file; a parse failure must not take the game
      // down — fall back to defaults, same as a missing key in Kotlin's SharedPreferences.
      return {}
    }
  }

  private writeStored(stored: StoredSettings): Promise<void> {
    return this.bridge.saveSettings(JSON.stringify(stored))
  }
}
