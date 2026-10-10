import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'

import { getApiErrorMessage, NETWORK_ERROR_MESSAGE, RATE_LIMIT_MESSAGE } from '../lib/apiError'

const axiosError = (status: number | undefined, data?: unknown): AxiosError => {
  const config = { headers: new AxiosHeaders() }
  const response: AxiosResponse | undefined =
    status === undefined
      ? undefined
      : { status, statusText: '', headers: {}, config, data }
  return new AxiosError('request failed', undefined, config, undefined, response)
}

describe('getApiErrorMessage', () => {
  it('prefers the backend detail', () => {
    expect(getApiErrorMessage(axiosError(400, { detail: 'Bad repo', code: 'X' }), 'fb')).toBe(
      'Bad repo',
    )
  })

  it('maps 404 to the fallback unless a notFoundMessage is given', () => {
    expect(getApiErrorMessage(axiosError(404), 'Could not load users.')).toBe('Could not load users.')
    expect(
      getApiErrorMessage(axiosError(404), 'fb', { notFoundMessage: 'Submission not found.' }),
    ).toBe('Submission not found.')
  })

  it('maps 429 to the generic or custom rate-limit copy', () => {
    expect(getApiErrorMessage(axiosError(429), 'fb')).toBe(RATE_LIMIT_MESSAGE)
    expect(getApiErrorMessage(axiosError(429), 'fb', { rateLimitMessage: 'Slow down!' })).toBe(
      'Slow down!',
    )
  })

  it('maps missing responses to the network message', () => {
    expect(getApiErrorMessage(axiosError(undefined), 'fb')).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('uses Error.message for plain errors and the fallback otherwise', () => {
    expect(getApiErrorMessage(new Error('boom'), 'fb')).toBe('boom')
    expect(getApiErrorMessage('???', 'fb')).toBe('fb')
    expect(getApiErrorMessage(undefined)).toBe('Something went wrong.')
  })
})
