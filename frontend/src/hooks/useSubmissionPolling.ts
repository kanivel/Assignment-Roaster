import { type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { getSubmission } from '../services/submissions'
import type { Submission, SubmissionStatus } from '../types'
import { dashboardKeys } from './useDashboard'
import { leaderboardKeys } from './useLeaderboard'
import { submissionKeys } from './useSubmissions'

export const POLL_INTERVAL_MS = 3000

/** Stop polling after this long; a review that has not finished by then is probably stuck. */
export const POLL_TIMEOUT_MS = 5 * 60 * 1000

const ACTIVE_STATUSES: readonly SubmissionStatus[] = ['pending', 'reviewing']

export const isSubmissionActive = (status: SubmissionStatus | undefined): boolean =>
  status !== undefined && ACTIVE_STATUSES.includes(status)

/** `useQuery` result plus whether the 5-minute polling window has elapsed. */
export type SubmissionPollingResult = UseQueryResult<Submission> & {
  isPollingTimedOut: boolean
}

/**
 * Loads one submission and refetches it every 3s while the review is still
 * pending/reviewing. Polling stops once the status reaches `done` / `failed`
 * or after `POLL_TIMEOUT_MS`, whichever comes first. When the review finishes,
 * the lists, dashboard and leaderboard caches are invalidated so they reflect it.
 */
export const useSubmissionPolling = (id: number | undefined): SubmissionPollingResult => {
  const queryClient = useQueryClient()
  const [isPollingTimedOut, setIsPollingTimedOut] = useState(false)
  const previousStatus = useRef<SubmissionStatus | undefined>(undefined)

  const query = useQuery({
    queryKey: submissionKeys.detail(id ?? -1),
    queryFn: () => getSubmission(id as number),
    enabled: id !== undefined && Number.isFinite(id),
    refetchInterval: (current) =>
      isSubmissionActive(current.state.data?.status) && !isPollingTimedOut
        ? POLL_INTERVAL_MS
        : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })

  const status = query.data?.status
  const isActive = isSubmissionActive(status)

  // Reset the timeout flag when polling stops, so a retry that re-enters
  // `pending` gets a fresh window. Adjusted during render (not in an effect).
  const [wasActive, setWasActive] = useState(isActive)
  if (wasActive !== isActive) {
    setWasActive(isActive)
    if (!isActive && isPollingTimedOut) setIsPollingTimedOut(false)
  }

  // Start the timeout clock when polling starts; cleared when it stops.
  useEffect(() => {
    if (!isActive) return
    const timer = window.setTimeout(() => setIsPollingTimedOut(true), POLL_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [isActive, id])

  // When a polled submission settles, dependent aggregates are stale.
  useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = status
    if (status === undefined || previous === undefined) return
    if (isSubmissionActive(previous) && !isSubmissionActive(status)) {
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      void queryClient.invalidateQueries({ queryKey: leaderboardKeys.all })
    }
  }, [status, queryClient])

  return { ...query, isPollingTimedOut }
}
