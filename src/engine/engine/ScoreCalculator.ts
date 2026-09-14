export const COIN_POINTS = 100
export const ANSWER_POINTS = 50
export const MAX_TIME_BONUS = 5000
export const MAX_TIME_MILLIS = 30 * 60 * 1000 // 30 minutes

export interface ScoreBreakdown {
  readonly coinPoints: number
  readonly answerPoints: number
  readonly timeBonus: number
  /** Extra value from jewels, over what their coin count already scores. */
  readonly treasureBonus: number
  /** Kotlin had this as a computed property; interfaces carry no getters. */
  readonly total: number
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), hi)

export const computeScore = (
  coins: number,
  correctAnswers: number,
  elapsedMillis: number,
  treasureBonus = 0,
): ScoreBreakdown => {
  const coinPoints = Math.max(coins, 0) * COIN_POINTS
  const answerPoints = Math.max(correctAnswers, 0) * ANSWER_POINTS
  const fraction = clamp(elapsedMillis, 0, MAX_TIME_MILLIS) / MAX_TIME_MILLIS
  const timeBonus = Math.trunc(MAX_TIME_BONUS * (1 - fraction))
  return {
    coinPoints,
    answerPoints,
    timeBonus,
    treasureBonus,
    total: coinPoints + answerPoints + timeBonus + treasureBonus,
  }
}
