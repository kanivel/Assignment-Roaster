import type { Paginated } from './submission'

export interface LeaderboardEntry {
  rank: number
  user_id: number
  full_name: string | null
  avatar_url: string | null
  best_score: number
  average_score: number
  submissions_count: number
  last_submission_at: string
}

export type LeaderboardPage = Paginated<LeaderboardEntry>

/** The current user's standing; every score field is null until they have a done submission. */
export interface MyRank {
  rank: number | null
  best_score: number | null
  average_score: number | null
  submissions_count: number
}
