import { type UseQueryResult, useQuery } from '@tanstack/react-query'

import { getDashboardStats } from '../services/dashboard'
import type { DashboardStats } from '../types/dashboard'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
}

export const useDashboardStats = (): UseQueryResult<DashboardStats> =>
  useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: getDashboardStats,
  })
