import type { Submission } from './submission'

export interface DashboardStats {
  total_submissions: number
  done_count: number
  failed_count: number
  pending_count: number
  average_score: number | null
  best_score: number | null
  latest_submission: Submission | null
}
