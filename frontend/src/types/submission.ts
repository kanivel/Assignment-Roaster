import type { Review } from './review'

export type SubmissionStatus = 'pending' | 'reviewing' | 'done' | 'failed'

export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'pending',
  'reviewing',
  'done',
  'failed',
] as const

export interface Submission {
  id: number
  user_id: number
  github_url: string
  repo_owner: string
  repo_name: string
  default_branch: string
  commit_sha: string
  status: SubmissionStatus
  error_message: string | null
  review: Review | null
  created_at: string
  /** `null` until the row is first updated (e.g. a freshly created submission). */
  updated_at: string | null
}

export interface CreateSubmissionRequest {
  github_url: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface PaginationParams {
  limit?: number
  offset?: number
}
