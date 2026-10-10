import type {
  CreateSubmissionRequest,
  Paginated,
  PaginationParams,
  Submission,
} from '../types'
import api from './api'

export { getApiErrorMessage } from '../lib/apiError'

export const DEFAULT_PAGE_SIZE = 20

/** Shown for a 429 from `POST /submissions` when the backend sends no `detail`. */
export const SUBMISSION_RATE_LIMIT_MESSAGE =
  'Slow down! You can submit at most 5 repos per hour. Try again later.'

/** Matches the backend rule: `https://github.com/{owner}/{repo}` with an optional trailing slash. */
export const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/

export const isValidGithubUrl = (url: string): boolean => GITHUB_URL_PATTERN.test(url.trim())

export const createSubmission = async (payload: CreateSubmissionRequest): Promise<Submission> => {
  const { data } = await api.post<Submission>('/submissions', payload)
  return data
}

export const listSubmissions = async (
  params: PaginationParams = {},
): Promise<Paginated<Submission>> => {
  const { data } = await api.get<Paginated<Submission>>('/submissions', {
    params: { limit: params.limit ?? DEFAULT_PAGE_SIZE, offset: params.offset ?? 0 },
  })
  return data
}

export const getSubmission = async (id: number): Promise<Submission> => {
  const { data } = await api.get<Submission>(`/submissions/${id}`)
  return data
}

export const deleteSubmission = async (id: number): Promise<void> => {
  await api.delete(`/submissions/${id}`)
}

export const retrySubmission = async (id: number): Promise<Submission> => {
  const { data } = await api.post<Submission>(`/submissions/${id}/retry`)
  return data
}
