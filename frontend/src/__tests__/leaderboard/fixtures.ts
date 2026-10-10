import type { LeaderboardEntry, MyRank } from '../../types/leaderboard'

export const makeEntry = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: 1,
  user_id: 1,
  full_name: 'Ada Lovelace',
  avatar_url: null,
  best_score: 9,
  average_score: 8.25,
  submissions_count: 4,
  last_submission_at: '2026-10-10T10:00:00Z',
  ...overrides,
})

export const makeMyRank = (overrides: Partial<MyRank> = {}): MyRank => ({
  rank: 2,
  best_score: 8,
  average_score: 7.5,
  submissions_count: 3,
  ...overrides,
})
