import type { AdminStats, AdminSubmission, AdminUser } from '../../types/admin'
import { mockUser } from '../auth/fixtures'
import { makeSubmission } from '../submissions/fixtures'

export const makeAdminUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  ...mockUser,
  submissions_count: 2,
  ...overrides,
})

export const makeAdminSubmission = (overrides: Partial<AdminSubmission> = {}): AdminSubmission => ({
  ...makeSubmission(),
  user_email: 'ada@example.com',
  ...overrides,
})

export const makeAdminStats = (overrides: Partial<AdminStats> = {}): AdminStats => ({
  total_users: 12,
  active_users: 10,
  submissions_by_status: { pending: 1, reviewing: 2, done: 20, failed: 3 },
  total_reviews: 20,
  total_input_tokens: 123456,
  total_output_tokens: 65432,
  ...overrides,
})
