import type { ScoreBreakdown } from '../engine/engine/ScoreCalculator'
import type { Direction } from '../engine/model/Direction'
import type { GameState } from '../engine/model/GameState'
import type { GameSettings, TriviaQuestion } from '../engine/model/types'

/**
 * The question bank's merged view: bundled entries plus the player's own, minus deleted ones.
 *
 * Task 13 (QuestionBank) owns the real persistence-layer type; this is the shape UiState.Questions
 * needs in the meantime, mirroring Kotlin's `com.mindmaze.app.persistence.QuestionBank.Entry`.
 */
export interface QuestionBankEntry {
  readonly id: string
  readonly topic: string
  readonly difficulty: string
  readonly question: string
  readonly answers: readonly string[]
  readonly correctIndex: number
}

export type UiState =
  | { readonly type: 'Menu'; readonly settings: GameSettings; readonly hasSavedGame: boolean }
  | {
      readonly type: 'InGame'
      readonly game: GameState
      readonly toast?: string | null
      readonly entryDirection?: Direction | null
    }
  /**
   * Trivia dialog shown over the game view.
   *
   * `answers` and `correctIndex` are the *displayed* set: after a hint is used they are
   * narrowed to 2 entries and `correctIndex` is remapped into the narrowed list. The
   * original `question` is retained unchanged.
   */
  | {
      readonly type: 'Trivia'
      readonly game: GameState
      readonly question: TriviaQuestion
      readonly direction: Direction
      readonly answers: readonly string[]
      readonly correctIndex: number
      readonly hintUsed?: boolean
      readonly entryDirection?: Direction | null
    }
  | { readonly type: 'Results'; readonly game: GameState; readonly breakdown: ScoreBreakdown }
  /**
   * A modal story message shown over the game — "the door is locked", "the windlass slips".
   *
   * Rendered in the same parchment dialog as trivia rather than as a toast: these explain a
   * rule the player has to act on, and a toast that fades after two seconds is the wrong
   * vehicle for "go and find the key".
   */
  | {
      readonly type: 'Message'
      readonly game: GameState
      readonly title: string
      readonly body: string
      readonly entryDirection?: Direction | null
    }
  /**
   * The question bank editor, reached from the menu.
   *
   * `questions` is the merged view the game itself would see — bundled plus the player's own,
   * minus deleted ones — so the list on screen is exactly what a game will draw from. `custom`
   * carries the ids the player authored, which is what makes an entry editable in place rather
   * than only hideable.
   */
  | {
      readonly type: 'Questions'
      readonly settings: GameSettings
      readonly questions: readonly QuestionBankEntry[]
      readonly custom: ReadonlySet<string>
    }
