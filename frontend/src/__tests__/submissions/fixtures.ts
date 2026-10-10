import type { Review, Submission } from '../../types'

export const makeReview = (overrides: Partial<Review> = {}): Review => ({
  id: 1,
  submission_id: 1,
  score: 8,
  summary: 'Solid work, da.',
  roast_text: 'Code super, but README-la onnume illa.\nTests-um kedaiyathu.',
  strengths: ['Clean structure', 'Typed everywhere'],
  improvements: ['Write a README', 'Add tests'],
  model_used: 'claude-test',
  input_tokens: 1200,
  output_tokens: 340,
  created_at: '2026-10-10T10:00:00Z',
  ...overrides,
})

export const makeSubmission = (overrides: Partial<Submission> = {}): Submission => ({
  id: 1,
  user_id: 1,
  github_url: 'https://github.com/octocat/hello-world',
  repo_owner: 'octocat',
  repo_name: 'hello-world',
  default_branch: 'main',
  commit_sha: 'abcdef1234567890',
  status: 'done',
  error_message: null,
  review: makeReview(),
  created_at: '2026-10-10T09:00:00Z',
  updated_at: '2026-10-10T10:00:00Z',
  ...overrides,
})
