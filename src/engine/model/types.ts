import type { Direction } from './Direction'

export type Topic = 'MATH' | 'LITERATURE' | 'HISTORY' | 'GEOGRAPHY' | 'SCIENCE'

export const TOPICS: readonly Topic[] =
  ['MATH', 'LITERATURE', 'HISTORY', 'GEOGRAPHY', 'SCIENCE']

export type Difficulty =
  | 'KINDERGARTEN' | 'FIRST_GRADE' | 'SECOND_GRADE' | 'THIRD_GRADE'
  | 'FOURTH_GRADE' | 'FIFTH_GRADE' | 'MIDDLE_SCHOOL' | 'HIGH_SCHOOL' | 'ADULT'

export const DIFFICULTIES: readonly Difficulty[] = [
  'KINDERGARTEN', 'FIRST_GRADE', 'SECOND_GRADE', 'THIRD_GRADE',
  'FOURTH_GRADE', 'FIFTH_GRADE', 'MIDDLE_SCHOOL', 'HIGH_SCHOOL', 'ADULT',
]

/**
 * Which difficulties the menu offers. Kotlin carried this as a constructor property on the
 * enum; only KINDERGARTEN and ADULT have questions written for them.
 */
export const DIFFICULTY_ACTIVE: Readonly<Record<Difficulty, boolean>> = {
  KINDERGARTEN: true,
  FIRST_GRADE: false,
  SECOND_GRADE: false,
  THIRD_GRADE: false,
  FOURTH_GRADE: false,
  FIFTH_GRADE: false,
  MIDDLE_SCHOOL: false,
  HIGH_SCHOOL: false,
  ADULT: true,
}

export type Complexity = 'SIMPLE' | 'MEDIUM' | 'HARD'
export const COMPLEXITIES: readonly Complexity[] = ['SIMPLE', 'MEDIUM', 'HARD']

export type DoorState = 'CLOSED' | 'OPEN' | 'LOCKED'

export interface GameSettings {
  readonly topics: ReadonlySet<Topic>
  readonly difficulty: Difficulty
  readonly complexity: Complexity
}

export interface Inventory {
  readonly keys: number
  readonly hints: number
}

export interface TriviaQuestion {
  readonly id: string
  readonly topic: Topic
  readonly difficulty: Difficulty
  readonly question: string
  /** 4 entries, shuffled when the question is drawn. */
  readonly answers: readonly string[]
  readonly correctIndex: number
}

export interface GatePair {
  readonly id: string
  /** Which room + direction holds the currently-open gate. */
  readonly openRoomId: number
  readonly openDirection: Direction
}
