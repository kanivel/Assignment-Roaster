import axios from 'axios'

import type { ApiErrorResponse } from '../types/auth'

export const DEFAULT_ERROR_MESSAGE = 'Something went wrong.'
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Take a breather and try again in a minute.'
export const NETWORK_ERROR_MESSAGE = 'Cannot reach the server. Check your connection and try again.'

export interface ApiErrorMessageOptions {
  /** Message for an HTTP 404 without a `detail` body. Defaults to `fallback`. */
  notFoundMessage?: string
  /** Message for an HTTP 429 without a `detail` body. Defaults to `RATE_LIMIT_MESSAGE`. */
  rateLimitMessage?: string
}

const isApiErrorResponse = (value: unknown): value is ApiErrorResponse =>
  typeof value === 'object' &&
  value !== null &&
  'detail' in value &&
  typeof (value as { detail: unknown }).detail === 'string'

/**
 * Turn any thrown value into a user-facing message. Prefers the backend's `detail`,
 * maps 404 / 429 / network failures to friendly copy, and otherwise uses `fallback`.
 */
export const getApiErrorMessage = (
  error: unknown,
  fallback: string = DEFAULT_ERROR_MESSAGE,
  options: ApiErrorMessageOptions = {},
): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const body: unknown = error.response?.data
    if (isApiErrorResponse(body) && body.detail.trim() !== '') {
      return body.detail
    }
    if (status === 429) {
      return options.rateLimitMessage ?? RATE_LIMIT_MESSAGE
    }
    if (status === 404) {
      return options.notFoundMessage ?? fallback
    }
    if (!error.response) {
      return NETWORK_ERROR_MESSAGE
    }
    return fallback
  }
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return fallback
}
