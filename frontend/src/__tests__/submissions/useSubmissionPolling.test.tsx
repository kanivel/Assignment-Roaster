import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dashboardKeys } from '../../hooks/useDashboard'
import { leaderboardKeys } from '../../hooks/useLeaderboard'
import {
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  useSubmissionPolling,
} from '../../hooks/useSubmissionPolling'
import { submissionKeys } from '../../hooks/useSubmissions'
import * as submissionsService from '../../services/submissions'
import { makeSubmission } from './fixtures'

vi.mock('../../services/submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submissions')>()
  return { ...actual, getSubmission: vi.fn() }
})

const getMock = vi.mocked(submissionsService.getSubmission)

interface WrapperProps {
  children: ReactNode
}

const renderPolling = (id: number | undefined) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useSubmissionPolling(id), { wrapper })
  return { ...hook, queryClient, invalidateSpy }
}

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useSubmissionPolling', () => {
  beforeEach(() => {
    getMock.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls every interval while the submission is active', async () => {
    getMock.mockResolvedValue(makeSubmission({ status: 'pending', review: null }))
    const { result } = renderPolling(1)

    await waitFor(() => expect(result.current.data?.status).toBe('pending'))
    expect(result.current.isPollingTimedOut).toBe(false)

    await advance(POLL_INTERVAL_MS * 2 + 50)
    expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('stops polling and reports a timeout after five minutes', async () => {
    getMock.mockResolvedValue(makeSubmission({ status: 'reviewing', review: null }))
    const { result } = renderPolling(1)

    await waitFor(() => expect(result.current.data?.status).toBe('reviewing'))

    await advance(POLL_TIMEOUT_MS + 50)
    await waitFor(() => expect(result.current.isPollingTimedOut).toBe(true))

    const callsAtTimeout = getMock.mock.calls.length
    await advance(POLL_INTERVAL_MS * 3)
    expect(getMock.mock.calls.length).toBe(callsAtTimeout)
    expect(result.current.data?.status).toBe('reviewing')
  })

  it('does not time out a submission that is already settled', async () => {
    getMock.mockResolvedValue(makeSubmission({ status: 'done' }))
    const { result } = renderPolling(1)

    await waitFor(() => expect(result.current.data?.status).toBe('done'))
    await advance(POLL_TIMEOUT_MS + 50)

    expect(result.current.isPollingTimedOut).toBe(false)
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates lists, dashboard and leaderboard when the review settles', async () => {
    getMock
      .mockResolvedValueOnce(makeSubmission({ status: 'pending', review: null }))
      .mockResolvedValue(makeSubmission({ status: 'done' }))
    const { result, invalidateSpy } = renderPolling(1)

    await waitFor(() => expect(result.current.data?.status).toBe('pending'))
    expect(invalidateSpy).not.toHaveBeenCalled()

    await advance(POLL_INTERVAL_MS + 50)
    await waitFor(() => expect(result.current.data?.status).toBe('done'))

    const invalidatedKeys = invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey)
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([submissionKeys.lists(), dashboardKeys.all, leaderboardKeys.all]),
    )
  })

  it('does not invalidate anything when the first load is already settled', async () => {
    getMock.mockResolvedValue(makeSubmission({ status: 'done' }))
    const { result, invalidateSpy } = renderPolling(1)

    await waitFor(() => expect(result.current.data?.status).toBe('done'))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('does nothing without an id', () => {
    const { result } = renderPolling(undefined)
    expect(result.current.isPending).toBe(true)
    expect(getMock).not.toHaveBeenCalled()
  })
})
