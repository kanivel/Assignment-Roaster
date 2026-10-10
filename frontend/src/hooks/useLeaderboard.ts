import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'

import { getMyRank, LEADERBOARD_PAGE_SIZE, listLeaderboard } from '../services/leaderboard'
import type { LeaderboardPage, MyRank } from '../types/leaderboard'

export const leaderboardKeys = {
  all: ['leaderboard'] as const,
  lists: () => [...leaderboardKeys.all, 'list'] as const,
  infinite: (limit: number) => [...leaderboardKeys.lists(), 'infinite', limit] as const,
  me: () => [...leaderboardKeys.all, 'me'] as const,
}

/** "Load more" pagination over `offset`, same shape as the submissions list. */
export const useInfiniteLeaderboard = (
  limit = LEADERBOARD_PAGE_SIZE,
): UseInfiniteQueryResult<InfiniteData<LeaderboardPage, number>> =>
  useInfiniteQuery({
    queryKey: leaderboardKeys.infinite(limit),
    queryFn: ({ pageParam }) => listLeaderboard({ limit, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length
      return nextOffset < lastPage.total && lastPage.items.length > 0 ? nextOffset : undefined
    },
  })

/** The current user's rank. Pass `enabled=false` for anonymous visitors (the endpoint needs auth). */
export const useMyRank = (enabled = true): UseQueryResult<MyRank> =>
  useQuery({
    queryKey: leaderboardKeys.me(),
    queryFn: getMyRank,
    enabled,
  })
