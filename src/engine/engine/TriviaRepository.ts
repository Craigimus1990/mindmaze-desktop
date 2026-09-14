import type { Difficulty, Topic, TriviaQuestion } from '../model/types'
import { TOPICS, DIFFICULTIES } from '../model/types'

interface RawQuestion {
  id: string
  topic: string
  difficulty: string
  question: string
  answers: string[]
  correctIndex: number
}

/** Validate a raw question to fail fast on bad data, like Kotlin's valueOf() and kotlinx.serialization.
 *  Kotlin threw IllegalArgumentException on unknown enum values and deserialization errors; this
 *  restores that fail-fast behaviour. Without it, correctIndex: -1 (from a missing field) would
 *  make every answer wrong and softlock the maze with no error message — a child is told they
 *  answered wrong when they answered right. Runs once per game at startup, cost is irrelevant. */
const validateQuestion = (r: unknown): RawQuestion => {
  if (typeof r !== 'object' || r === null) {
    throw new Error('question entry must be an object')
  }
  const q = r as Record<string, unknown>

  // id and question: non-empty strings
  if (typeof q.id !== 'string' || q.id.trim() === '') {
    throw new Error(`question entry missing or empty id: ${JSON.stringify(r)}`)
  }
  if (typeof q.question !== 'string' || q.question.trim() === '') {
    throw new Error(`question "${q.id}": missing or empty question text`)
  }

  // topic: must be a valid Topic
  if (typeof q.topic !== 'string') {
    throw new Error(`question "${q.id}": topic must be a string`)
  }
  if (!TOPICS.includes(q.topic as Topic)) {
    throw new Error(`question "${q.id}": unknown topic "${q.topic}"`)
  }

  // difficulty: must be a valid Difficulty
  if (typeof q.difficulty !== 'string') {
    throw new Error(`question "${q.id}": difficulty must be a string`)
  }
  if (!DIFFICULTIES.includes(q.difficulty as Difficulty)) {
    throw new Error(`question "${q.id}": unknown difficulty "${q.difficulty}"`)
  }

  // answers: array of at least 2 strings
  if (!Array.isArray(q.answers)) {
    throw new Error(`question "${q.id}": answers must be an array`)
  }
  if (q.answers.length < 2) {
    throw new Error(`question "${q.id}": answers must have at least 2 entries`)
  }
  if (!q.answers.every((a) => typeof a === 'string')) {
    throw new Error(`question "${q.id}": all answers must be strings`)
  }

  // correctIndex: integer in [0, answers.length)
  if (typeof q.correctIndex !== 'number' || !Number.isInteger(q.correctIndex)) {
    throw new Error(`question "${q.id}": correctIndex must be an integer`)
  }
  if (q.correctIndex < 0 || q.correctIndex >= q.answers.length) {
    throw new Error(`question "${q.id}": correctIndex ${q.correctIndex} out of range [0, ${q.answers.length})`)
  }

  return {
    id: q.id,
    topic: q.topic as Topic,
    difficulty: q.difficulty as Difficulty,
    question: q.question,
    answers: q.answers as string[],
    correctIndex: q.correctIndex,
  }
}

export class TriviaRepository {
  private readonly pool: readonly TriviaQuestion[]
  private readonly used = new Set<string>()

  constructor(
    questionsJson: string,
    topics: ReadonlySet<Topic>,
    difficulty: Difficulty,
  ) {
    const parsed = JSON.parse(questionsJson)
    if (!Array.isArray(parsed)) {
      throw new Error('questions JSON must be an array')
    }
    const raw = parsed as unknown[]
    const all: TriviaQuestion[] = raw.map((r) => {
      const validated = validateQuestion(r)
      return {
        id: validated.id,
        topic: validated.topic as Topic,
        difficulty: validated.difficulty as Difficulty,
        question: validated.question,
        answers: validated.answers,
        correctIndex: validated.correctIndex,
      }
    })

    // An empty pool is a softlock, not a cosmetic problem: nextQuestion() returns null, the
    // engine answers InvalidAction("No trivia questions available"), and every closed door in
    // the maze becomes impassable with no way for the player to tell why. So the player's exact
    // selection is a preference, not a hard constraint — relax it a step at a time rather than
    // hand back nothing.
    const exact = all.filter(
      (q) => q.difficulty === difficulty && topics.has(q.topic),
    )
    const byDifficulty = all.filter((q) => q.difficulty === difficulty)
    const byTopic = all.filter((q) => topics.has(q.topic))

    this.pool =
      exact.length > 0 ? exact
      : byDifficulty.length > 0 ? byDifficulty
      : byTopic.length > 0 ? byTopic
      : all
  }

  /** The next question with shuffled answer order, or null if the pool is empty. */
  nextQuestion(): TriviaQuestion | null {
    if (this.pool.length === 0) return null
    let candidates = this.pool.filter((q) => !this.used.has(q.id))
    if (candidates.length === 0) {
      this.used.clear()
      candidates = [...this.pool]
    }
    const raw = candidates[Math.floor(Math.random() * candidates.length)]!
    this.used.add(raw.id)
    return shuffleAnswers(raw)
  }
}

const shuffleAnswers = (q: TriviaQuestion): TriviaQuestion => {
  const correctText = q.answers[q.correctIndex]!
  const shuffled = [...q.answers]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = shuffled[i]!
    const b = shuffled[j]!
    shuffled[i] = b
    shuffled[j] = a
  }
  return { ...q, answers: shuffled, correctIndex: shuffled.indexOf(correctText) }
}
