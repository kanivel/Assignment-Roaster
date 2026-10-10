import {
  keepPreviousData,
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  deleteAdminReview,
  getAdminStats,
  listAdminSubmissions,
  listAdminUsers,
  updateAdminUser,
} from '../services/admin'
import type {
  AdminStats,
  AdminSubmission,
  AdminSubmissionsParams,
  AdminUser,
  AdminUsersParams,
  UpdateAdminUserRequest,
} from '../types/admin'
import type { Paginated } from '../types/submission'
import { submissionKeys } from './useSubmissions'

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  userList: (params: AdminUsersParams) => [...adminKeys.users(), params] as const,
  submissions: () => [...adminKeys.all, 'submissions'] as const,
  submissionList: (params: AdminSubmissionsParams) =>
    [...adminKeys.submissions(), params] as const,
}

export const useAdminStats = (): UseQueryResult<AdminStats> =>
  useQuery({ queryKey: adminKeys.stats(), queryFn: getAdminStats })

export const useAdminUsers = (
  params: AdminUsersParams = {},
): UseQueryResult<Paginated<AdminUser>> =>
  useQuery({
    queryKey: adminKeys.userList(params),
    queryFn: () => listAdminUsers(params),
    placeholderData: keepPreviousData,
  })

export interface UpdateAdminUserVariables {
  id: number
  payload: UpdateAdminUserRequest
}

export const useUpdateAdminUser = (): UseMutationResult<
  AdminUser,
  unknown,
  UpdateAdminUserVariables
> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: UpdateAdminUserVariables) => updateAdminUser(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.stats() })
    },
  })
}

export const useAdminSubmissions = (
  params: AdminSubmissionsParams = {},
): UseQueryResult<Paginated<AdminSubmission>> =>
  useQuery({
    queryKey: adminKeys.submissionList(params),
    queryFn: () => listAdminSubmissions(params),
    placeholderData: keepPreviousData,
  })

export const useDeleteAdminReview = (): UseMutationResult<void, unknown, number> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reviewId: number) => deleteAdminReview(reviewId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.submissions() })
      void queryClient.invalidateQueries({ queryKey: adminKeys.stats() })
      // The owning submission is reset to failed; drop any cached copies of it.
      void queryClient.invalidateQueries({ queryKey: submissionKeys.all })
    },
  })
}
