import { describe, it, expect } from 'vitest'
import {
  computeScore, MAX_TIME_BONUS, MAX_TIME_MILLIS,
} from '@/engine/engine/ScoreCalculator'

describe('ScoreCalculator', () => {
  it('zero game gives zero score', () => {
    expect(computeScore(0, 0, MAX_TIME_MILLIS).total).toBe(0)
  })

  it('coins add 100 each', () => {
    expect(computeScore(3, 0, 0).coinPoints).toBe(300)
  })

  it('correct answers add 50 each', () => {
    expect(computeScore(0, 4, 0).answerPoints).toBe(200)
  })

  it('time bonus is max at zero elapsed', () => {
    expect(computeScore(0, 0, 0).timeBonus).toBe(MAX_TIME_BONUS)
  })

  it('time bonus is zero at or beyond max time', () => {
    expect(computeScore(0, 0, MAX_TIME_MILLIS).timeBonus).toBe(0)
  })

  it('time bonus decreases linearly', () => {
    expect(computeScore(0, 0, MAX_TIME_MILLIS / 2).timeBonus).toBe(MAX_TIME_BONUS / 2)
  })

  it('total is the sum of all components', () => {
    // coins=2 -> 200, answers=3 -> 150, elapsed=0 -> bonus=5000, total=5350
    expect(computeScore(2, 3, 0).total).toBe(5350)
  })
})
