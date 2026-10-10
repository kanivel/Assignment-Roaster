import {
  type UseMutationResult,
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import {
  createSubmission,
  DEFAULT_PAGE_SIZE,
  deleteSubmission,
  listSubmissions,
  retrySubmission,
} from '../services/submissions'
import type { CreateSubmissionRequest, Paginated, PaginationParams, Submission } from '../types'
import { dashboardKeys } from './useDashboard'
import { leaderboardKeys } from './useLeaderboard'

export const submissionKeys = {
  all: ['submissions'] as const,
  lists: () => [...submissionKeys.all, 'list'] as const,
  list: (params: PaginationParams) => [...submissionKeys.lists(), params] as const,
  infinite: (limit: number) => [...submissionKeys.lists(), 'infinite', limit] as const,
  details: () => [...submissionKeys.all, 'detail'] as const,
  detail: (id: number) => [...submissionKeys.details(), id] as const,
}

/** Cursor-less "Load more" pagination over `offset`. */
export const useInfiniteSubmissions = (
  limit = DEFAULT_PAGE_SIZE,
): UseInfiniteQueryResult<InfiniteData<Paginated<Submission>, number>> =>
  useInfiniteQuery({
    queryKey: submissionKeys.infinite(limit),
    queryFn: ({ pageParam }) => listSubmissions({ limit, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length
      return nextOffset < lastPage.total && lastPage.items.length > 0 ? nextOffset : undefined
    },
  })

export const useCreateSubmission = (): UseMutationResult<
  Submission,
  unknown,
  CreateSubmissionRequest
> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateSubmissionRequest) => createSubmission(payload),
    onSuccess: (submission) => {
      queryClient.setQueryData(submissionKeys.detail(submission.id), submission)
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}

export const useDeleteSubmission = (): UseMutationResult<void, unknown, number> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteSubmission(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: submissionKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      void queryClient.invalidateQueries({ queryKey: leaderboardKeys.all })
    },
  })
}

export const useRetrySubmission = (): UseMutationResult<Submission, unknown, number> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => retrySubmission(id),
    onSuccess: (submission) => {
      queryClient.setQueryData(submissionKeys.detail(submission.id), submission)
      void queryClient.invalidateQueries({ queryKey: submissionKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}
