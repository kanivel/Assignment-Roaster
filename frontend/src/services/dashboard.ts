import type { DashboardStats } from '../types/dashboard'
import api from './api'

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const { data } = await api.get<DashboardStats>('/dashboard/stats')
  return data
}
