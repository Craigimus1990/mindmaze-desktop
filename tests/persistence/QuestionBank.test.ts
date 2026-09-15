import { describe, it, expect } from 'vitest'
import { QuestionBank } from '@/persistence/QuestionBank'
import { TriviaRepository } from '@/engine/engine/TriviaRepository'
import { TOPICS, DIFFICULTIES, DIFFICULTY_ACTIVE } from '@/engine/model/types'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Ported from Kotlin's QuestionBankTest (guards the shipping bank itself) and
 * CustomQuestionMergeTest (the merge/hide/validate logic). This file is test-only code; it may
 * use `fs` freely even though the renderer's own persistence code must not — QuestionBank is
 * pure string-in/string-out logic with no bridge dependency, same split as Kotlin's version.
 */

const bundled = `
[
  {"id":"b1","topic":"MATH","difficulty":"KINDERGARTEN","question":"2+2?",
   "answers":["3","4","5","6"],"correctIndex":1},
  {"id":"b2","topic":"SCIENCE","difficulty":"KINDERGARTEN","question":"Sky colour?",
   "answers":["Blue","Red","Green","Pink"],"correctIndex":0}
]`

describe('QuestionBank: the shipping question bank', () => {
  const json = fs.readFileSync(
    path.resolve(__dirname, '../../src/assets/data/questions.json'),
    'utf-8',
  )
  const questions = QuestionBank.parse(json)

  it('every question is well formed', () => {
    for (const q of questions) {
      expect(q.answers.length, `${q.question}: expected 4 answers`).toBe(4)
      expect(new Set(q.answers).size, `${q.question}: duplicate answer text`).toBe(4)
      expect(q.correctIndex, `${q.question}: correctIndex out of range`).toBeGreaterThanOrEqual(0)
      expect(q.correctIndex).toBeLessThan(q.answers.length)
      expect(q.question.trim().length, 'blank question text').toBeGreaterThan(0)
      expect(q.answers.every((a) => a.trim().length > 0), `${q.question}: blank answer`).toBe(true)
    }
  })

  it('ids and question text are unique', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length)
    expect(new Set(questions.map((q) => q.question.trim().toLowerCase())).size).toBe(
      questions.length,
    )
  })

  it('topics and difficulties are names the engine knows', () => {
    for (const q of questions) {
      expect(TOPICS).toContain(q.topic)
      expect(DIFFICULTIES).toContain(q.difficulty)
    }
  })

  it('every kid-facing topic has questions of its own', () => {
    const kinder = questions.filter((q) => q.difficulty === 'KINDERGARTEN')
    for (const topic of TOPICS) {
      const n = kinder.filter((q) => q.topic === topic).length
      expect(n, `KINDERGARTEN/${topic} has only ${n} questions`).toBeGreaterThanOrEqual(10)
    }
  })

  it('every menu combination yields a question', () => {
    for (const difficulty of DIFFICULTIES.filter((d) => DIFFICULTY_ACTIVE[d])) {
      for (const topic of TOPICS) {
        const repo = new TriviaRepository(json, new Set([topic]), difficulty)
        expect(
          repo.nextQuestion(),
          `no question for ${difficulty}/${topic} — closed doors would be impassable`,
        ).not.toBeNull()
      }
    }
  })

  it('kindergarten answers are short enough to read aloud', () => {
    for (const q of questions.filter((q) => q.difficulty === 'KINDERGARTEN')) {
      for (const a of q.answers) {
        expect(a.length, `${q.question}: answer "${a}" is ${a.length} chars`).toBeLessThanOrEqual(30)
      }
    }
  })
})

describe('QuestionBank.merge', () => {
  it('custom questions join the bundled pool', () => {
    const custom = `[{"id":"c1","topic":"MATH","difficulty":"KINDERGARTEN","question":"3+3?",
      "answers":["5","6","7","8"],"correctIndex":1}]`
    const merged = QuestionBank.merge(bundled, custom, new Set())
    expect(merged).toContain('c1')
    expect(merged).toContain('b1')
    expect(QuestionBank.count(merged)).toBe(3)
  })

  it('a hidden bundled question is removed from the pool', () => {
    const merged = QuestionBank.merge(bundled, '[]', new Set(['b1']))
    expect(merged).not.toContain('"b1"')
    expect(merged).toContain('"b2"')
    expect(QuestionBank.count(merged)).toBe(1)
  })

  it('a custom question overrides a bundled one with the same id', () => {
    const custom = `[{"id":"b1","topic":"MATH","difficulty":"KINDERGARTEN","question":"EDITED 2+2?",
      "answers":["3","4","5","6"],"correctIndex":1}]`
    const merged = QuestionBank.merge(bundled, custom, new Set())
    expect(QuestionBank.count(merged)).toBe(2)
    expect(merged).toContain('EDITED')
    expect(merged).not.toContain('"2+2?"')
  })

  it('malformed custom json falls back to the bundled set', () => {
    const merged = QuestionBank.merge(bundled, '{ not json', new Set())
    expect(QuestionBank.count(merged)).toBe(2)
  })

  it('hiding every bundled question still leaves a usable pool when custom exist', () => {
    const custom = `[{"id":"c1","topic":"MATH","difficulty":"KINDERGARTEN","question":"3+3?",
      "answers":["5","6","7","8"],"correctIndex":1}]`
    const merged = QuestionBank.merge(bundled, custom, new Set(['b1', 'b2']))
    expect(QuestionBank.count(merged)).toBe(1)
  })

  it('hiding everything with no custom questions leaves the bundled set intact', () => {
    const merged = QuestionBank.merge(bundled, '[]', new Set(['b1', 'b2']))
    expect(
      QuestionBank.count(merged),
      'emptying the pool entirely would make every closed door impassable',
    ).toBe(2)
  })
})

describe('QuestionBank.isValid', () => {
  it('rejects questions the game cannot use', () => {
    expect(QuestionBank.isValid('', ['a', 'b', 'c', 'd'], 0)).toBe(false)
    expect(QuestionBank.isValid('Q?', ['a', 'b', 'c'], 0)).toBe(false)
    expect(QuestionBank.isValid('Q?', ['a', 'b', 'c', ''], 0)).toBe(false)
    expect(QuestionBank.isValid('Q?', ['a', 'b', 'c', 'd'], 4)).toBe(false)
    expect(QuestionBank.isValid('Q?', ['a', 'b', 'c', 'd'], -1)).toBe(false)
    expect(QuestionBank.isValid('Q?', ['a', 'a', 'c', 'd'], 0)).toBe(false)
    expect(QuestionBank.isValid('Q?', ['a', 'b', 'c', 'd'], 2)).toBe(true)
  })
})

describe('QuestionBank round-trip', () => {
  it('a written question survives a round trip', () => {
    const json = QuestionBank.toJson([
      { id: 'c9', topic: 'HISTORY', difficulty: 'ADULT', question: 'Who?', answers: ['a', 'b', 'c', 'd'], correctIndex: 3 },
    ])
    const back = QuestionBank.parse(json)
    expect(back.length).toBe(1)
    expect(back[0]?.id).toBe('c9')
    expect(back[0]?.correctIndex).toBe(3)
    expect(back[0]?.question).toBe('Who?')
  })

  it('parse returns empty rather than throwing on malformed input', () => {
    expect(QuestionBank.parse('{ not json')).toEqual([])
    expect(QuestionBank.parse('not even close')).toEqual([])
  })

  it('count is the number of parsed entries', () => {
    expect(QuestionBank.count(bundled)).toBe(2)
    expect(QuestionBank.count('{ not json')).toBe(0)
  })
})
