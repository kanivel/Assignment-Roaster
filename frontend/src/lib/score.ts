export type ScoreTier = 'low' | 'mid' | 'high'

export const MAX_SCORE = 10

/** Colour tier for a 0-10 score: red below 4, orange 4-6, green above 6. */
export const getScoreTier = (score: number): ScoreTier => {
  if (score < 4) return 'low'
  if (score <= 6) return 'mid'
  return 'high'
}

export const clampScore = (score: number): number =>
  Math.min(MAX_SCORE, Math.max(0, Math.round(score)))
