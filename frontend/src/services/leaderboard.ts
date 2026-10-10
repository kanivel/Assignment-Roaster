import type { LeaderboardPage, MyRank } from '../types/leaderboard'
import type { PaginationParams } from '../types/submission'
import api from './api'

export const LEADERBOARD_PAGE_SIZE = 20

export const listLeaderboard = async (params: PaginationParams = {}): Promise<LeaderboardPage> => {
  const { data } = await api.get<LeaderboardPage>('/leaderboard', {
    params: { limit: params.limit ?? LEADERBOARD_PAGE_SIZE, offset: params.offset ?? 0 },
  })
  return data
}

export const getMyRank = async (): Promise<MyRank> => {
  const { data } = await api.get<MyRank>('/leaderboard/me')
  return data
}
