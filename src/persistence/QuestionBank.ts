import type { Difficulty, Topic } from '@/engine/model/types'
import { DIFFICULTIES, TOPICS } from '@/engine/model/types'

/**
 * Merges the bundled question set with the player's own additions.
 *
 * The bundled questions ship as a read-only asset, so "adding" means keeping a second list in
 * app storage and "deleting" a bundled question means recording its id as hidden. Both are
 * folded together here, and `TriviaRepository` sees one ordinary JSON array with no idea any of
 * this happened.
 *
 * Everything is plain string-to-string so it can be tested without Electron.
 */
export namespace QuestionBank {
  export interface Entry {
    readonly id: string
    readonly topic: string
    readonly difficulty: string
    readonly question: string
    readonly answers: readonly string[]
    readonly correctIndex: number
  }

  const isEntry = (v: unknown): v is Entry => {
    if (typeof v !== 'object' || v === null) return false
    const o = v as Record<string, unknown>
    return (
      typeof o.id === 'string' &&
      typeof o.topic === 'string' &&
      typeof o.difficulty === 'string' &&
      typeof o.question === 'string' &&
      Array.isArray(o.answers) &&
      o.answers.every((a) => typeof a === 'string') &&
      typeof o.correctIndex === 'number'
    )
  }

  /** Parses a question array, returning empty rather than throwing on malformed input. */
  export const parse = (text: string): Entry[] => {
    // On-device data the user can edit; a parse failure must not take the game down.
    try {
      const parsed: unknown = JSON.parse(text)
      if (!Array.isArray(parsed) || !parsed.every(isEntry)) return []
      return parsed as Entry[]
    } catch {
      return []
    }
  }

  export const toJson = (entries: readonly Entry[]): string => JSON.stringify(entries)

  export const count = (text: string): number => parse(text).length

  /**
   * The pool the game should actually draw from.
   *
   * Custom entries win over bundled ones sharing an id, which is how editing a bundled question
   * works — the edit is stored as a custom entry under the same id rather than mutating the
   * asset.
   *
   * `hidden` removes bundled questions the player deleted, but is ignored outright when it would
   * empty the pool: `TriviaRepository` treats an empty pool as "no questions available", which
   * makes every closed door in the maze impassable with no explanation. Refusing to hide is
   * strictly better than shipping an unplayable game.
   */
  export const merge = (bundledJson: string, customJson: string, hidden: ReadonlySet<string>): string => {
    const bundled = parse(bundledJson)
    const custom = parse(customJson)
    const customIds = new Set(custom.map((e) => e.id))

    const kept = bundled.filter((e) => !customIds.has(e.id) && !hidden.has(e.id))
    const pool = [...kept, ...custom]
    const safe = pool.length === 0
      ? [...bundled.filter((e) => !customIds.has(e.id)), ...custom]
      : pool
    return toJson(safe.length === 0 ? bundled : safe)
  }

  /**
   * Whether a question is usable by the game. Checked before saving, because each of these would
   * otherwise surface far from its cause — a bad index throws inside answer shuffling, and a
   * blank answer renders as an empty button the player cannot tell apart.
   */
  export const isValid = (question: string, answers: readonly string[], correctIndex: number): boolean => {
    if (question.trim().length === 0) return false
    if (answers.length !== 4) return false
    if (answers.some((a) => a.trim().length === 0)) return false
    if (correctIndex < 0 || correctIndex >= answers.length) return false
    // Two identical answers make the question unanswerable: picking the "wrong" duplicate is
    // marked incorrect even though the text matches.
    const normalized = new Set(answers.map((a) => a.trim().toLowerCase()))
    if (normalized.size !== answers.length) return false
    return true
  }

  /** The Topic/Difficulty name sets, exposed for callers validating a raw Entry's fields. */
  export const TOPIC_NAMES: readonly Topic[] = TOPICS
  export const DIFFICULTY_NAMES: readonly Difficulty[] = DIFFICULTIES
}
