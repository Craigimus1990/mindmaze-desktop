import { QuestionBank } from '@/persistence/QuestionBank'
import type { MindMazeBridge } from '@/types/window'

interface StoredQuestions {
  readonly custom?: unknown
  readonly hidden?: unknown
}

/**
 * Persists the player's own questions and the bundled ones they have deleted.
 *
 * Kotlin kept this in SharedPreferences, reasoning that the payload is a few kilobytes of JSON
 * written only when the questions screen saves. The bridge's `custom_questions.json` slot is the
 * equivalent here — one JSON document holding both the custom entries and the hidden-id set,
 * read and rewritten as a unit through the sandboxed bridge.
 */
export class QuestionStore {
  constructor(private readonly bridge: MindMazeBridge) {}

  async customJson(): Promise<string> {
    const stored = await this.readStored()
    return Array.isArray(stored.custom) ? JSON.stringify(stored.custom) : '[]'
  }

  async custom(): Promise<QuestionBank.Entry[]> {
    return QuestionBank.parse(await this.customJson())
  }

  async hidden(): Promise<ReadonlySet<string>> {
    const stored = await this.readStored()
    const hidden = stored.hidden
    return Array.isArray(hidden) && hidden.every((h) => typeof h === 'string')
      ? new Set(hidden)
      : new Set()
  }

  async saveCustom(entries: readonly QuestionBank.Entry[]): Promise<void> {
    const stored = await this.readStored()
    await this.writeStored({ ...stored, custom: entries })
  }

  /**
   * Marks a bundled question as deleted.
   *
   * Bundled questions live in a read-only asset, so removal is recorded as an override rather
   * than an edit. `QuestionBank.merge` ignores the whole set if honouring it would empty the
   * pool.
   */
  async hide(id: string): Promise<void> {
    const hidden = await this.hidden()
    const stored = await this.readStored()
    await this.writeStored({ ...stored, hidden: [...hidden, id] })
  }

  async unhide(id: string): Promise<void> {
    const hidden = await this.hidden()
    const stored = await this.readStored()
    await this.writeStored({ ...stored, hidden: [...hidden].filter((h) => h !== id) })
  }

  /** The pool the game should use: bundled, plus the player's, minus what they deleted. */
  async mergedJson(bundledJson: string): Promise<string> {
    return QuestionBank.merge(bundledJson, await this.customJson(), await this.hidden())
  }

  private async readStored(): Promise<StoredQuestions> {
    const text = await this.bridge.loadCustomQuestions()
    if (text === null) return {}
    try {
      const parsed: unknown = JSON.parse(text)
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as StoredQuestions)
        : {}
    } catch {
      // On-device, user-editable data; a parse failure must not take the game down.
      return {}
    }
  }

  private writeStored(stored: StoredQuestions): Promise<void> {
    return this.bridge.saveCustomQuestions(JSON.stringify(stored))
  }
}
