import type { User } from './auth'
import type { PaginationParams, Submission, SubmissionStatus } from './submission'

export interface AdminUser extends User {
  submissions_count: number
}

export interface AdminSubmission extends Submission {
  user_email: string
}

export interface AdminStats {
  total_users: number
  active_users: number
  submissions_by_status: Record<string, number>
  total_reviews: number
  total_input_tokens: number
  total_output_tokens: number
}

export interface UpdateAdminUserRequest {
  is_active?: boolean
  is_admin?: boolean
}

export interface AdminUsersParams extends PaginationParams {
  /** Case-insensitive match on email. */
  search?: string
}

export interface AdminSubmissionsParams extends PaginationParams {
  status?: SubmissionStatus
}
