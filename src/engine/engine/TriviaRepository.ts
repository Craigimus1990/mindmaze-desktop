import type { Difficulty, Topic, TriviaQuestion } from '../model/types'

interface RawQuestion {
  id: string
  topic: string
  difficulty: string
  question: string
  answers: string[]
  correctIndex: number
}

export class TriviaRepository {
  private readonly pool: readonly TriviaQuestion[]
  private readonly used = new Set<string>()

  constructor(
    questionsJson: string,
    topics: ReadonlySet<Topic>,
    difficulty: Difficulty,
  ) {
    const raw = JSON.parse(questionsJson) as RawQuestion[]
    const all: TriviaQuestion[] = raw.map((r) => ({
      id: r.id,
      topic: r.topic as Topic,
      difficulty: r.difficulty as Difficulty,
      question: r.question,
      answers: r.answers,
      correctIndex: r.correctIndex,
    }))

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
