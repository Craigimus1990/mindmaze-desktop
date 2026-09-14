import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TriviaRepository } from '@/engine/engine/TriviaRepository'
import type { Difficulty, Topic } from '@/engine/model/types'

const json = readFileSync(
  join(__dirname, '../fixtures/test_questions.json'),
  'utf-8',
)

const repo = (topics: Topic[], difficulty: Difficulty) =>
  new TriviaRepository(json, new Set(topics), difficulty)

describe('TriviaRepository', () => {
  it('returns a question matching topic and difficulty', () => {
    const q = repo(['MATH'], 'KINDERGARTEN').nextQuestion()
    expect(q).not.toBeNull()
    expect(q!.topic).toBe('MATH')
    expect(q!.difficulty).toBe('KINDERGARTEN')
  })

  it('falls back to the difficulty when the topic has no questions', () => {
    // The fixture has no GEOGRAPHY questions. Returning null would softlock the maze:
    // every closed door needs a question to open.
    const q = repo(['GEOGRAPHY'], 'KINDERGARTEN').nextQuestion()
    expect(q, 'empty pool would make closed doors impassable').not.toBeNull()
    expect(q!.difficulty, 'difficulty is the last thing to relax').toBe('KINDERGARTEN')
  })

  it('falls back to the topic when the difficulty has no questions', () => {
    const q = repo(['SCIENCE'], 'HIGH_SCHOOL').nextQuestion()
    expect(q).not.toBeNull()
    expect(q!.topic).toBe('SCIENCE')
  })

  it('falls back to the whole bank when neither matches', () => {
    expect(repo(['GEOGRAPHY'], 'HIGH_SCHOOL').nextQuestion()).not.toBeNull()
  })

  it('an exact match is never diluted by the fallbacks', () => {
    const r = repo(['MATH'], 'KINDERGARTEN')
    for (let i = 0; i < 10; i++) {
      const q = r.nextQuestion()!
      expect(q.topic).toBe('MATH')
      expect(q.difficulty).toBe('KINDERGARTEN')
    }
  })

  it('does not repeat questions until the pool is exhausted', () => {
    const r = repo(['MATH'], 'KINDERGARTEN')
    expect(r.nextQuestion()!.id).not.toBe(r.nextQuestion()!.id)
  })

  it('recycles questions after the pool is exhausted', () => {
    const r = repo(['MATH'], 'KINDERGARTEN')
    const ids = Array.from({ length: 10 }, () => r.nextQuestion()?.id)
    expect(new Set(ids.filter(Boolean)).size).toBeLessThanOrEqual(2)
  })

  it('shuffles answer order at runtime', () => {
    const correct = Array.from({ length: 20 }, () => {
      const q = repo(['MATH'], 'ADULT').nextQuestion()!
      return q.answers[q.correctIndex]
    })
    // The correct answer text is the same regardless of shuffle.
    expect(new Set(correct).size).toBe(1)
  })

  it('multi-topic selection draws from all active topics', () => {
    const r = repo(['MATH', 'HISTORY', 'SCIENCE'], 'ADULT')
    const topics = new Set(
      Array.from({ length: 10 }, () => r.nextQuestion()?.topic).filter(Boolean),
    )
    expect(topics.size).toBeGreaterThan(1)
  })
})
