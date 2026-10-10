import type {
  AdminStats,
  AdminSubmission,
  AdminSubmissionsParams,
  AdminUser,
  AdminUsersParams,
  UpdateAdminUserRequest,
} from '../types/admin'
import type { Paginated } from '../types/submission'
import api from './api'

export const ADMIN_PAGE_SIZE = 20

export const getAdminStats = async (): Promise<AdminStats> => {
  const { data } = await api.get<AdminStats>('/admin/stats')
  return data
}

export const listAdminUsers = async (
  params: AdminUsersParams = {},
): Promise<Paginated<AdminUser>> => {
  const search = params.search?.trim()
  const { data } = await api.get<Paginated<AdminUser>>('/admin/users', {
    params: {
      limit: params.limit ?? ADMIN_PAGE_SIZE,
      offset: params.offset ?? 0,
      ...(search ? { search } : {}),
    },
  })
  return data
}

export const updateAdminUser = async (
  id: number,
  payload: UpdateAdminUserRequest,
): Promise<AdminUser> => {
  const { data } = await api.put<AdminUser>(`/admin/users/${id}`, payload)
  return data
}

export const listAdminSubmissions = async (
  params: AdminSubmissionsParams = {},
): Promise<Paginated<AdminSubmission>> => {
  const { data } = await api.get<Paginated<AdminSubmission>>('/admin/submissions', {
    params: {
      limit: params.limit ?? ADMIN_PAGE_SIZE,
      offset: params.offset ?? 0,
      ...(params.status ? { status: params.status } : {}),
    },
  })
  return data
}

export const deleteAdminReview = async (reviewId: number): Promise<void> => {
  await api.delete(`/admin/reviews/${reviewId}`)
}
