import { Center, Spinner, Text, VStack } from '@chakra-ui/react'

import { PageWrapper } from '../components/layout/PageWrapper'
import { LeaderboardTable } from '../components/leaderboard/LeaderboardTable'
import { YourRankCard } from '../components/leaderboard/YourRankCard'
import { GlassCard } from '../components/ui/GlassCard'
import { GradientButton } from '../components/ui/GradientButton'
import { TextReveal } from '../components/ui/TextReveal'
import { useAuth } from '../hooks/useAuth'
import { useInfiniteLeaderboard } from '../hooks/useLeaderboard'
import { getApiErrorMessage } from '../services/submissions'

const LeaderboardBody = () => {
  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteLeaderboard()

  if (isPending) {
    return (
      <Center py={16}>
        <Spinner size="xl" color="brand.fg" borderWidth="3px" />
      </Center>
    )
  }

  if (isError) {
    return (
      <GlassCard hoverable={false} role="alert">
        <Text fontWeight="semibold" color="red.300">
          {getApiErrorMessage(error, 'Could not load the leaderboard.')}
        </Text>
        <GradientButton mt={4} variant="outline" onClick={() => void refetch()}>
          Try again
        </GradientButton>
      </GlassCard>
    )
  }

  const entries = data.pages.flatMap((page) => page.items)
  const total = data.pages[0]?.total ?? entries.length

  return (
    <VStack align="stretch" gap={6}>
      {entries.length > 0 ? (
        <Text fontSize="sm" color="fg.subtle">
          Showing {entries.length} of {total} roastees
        </Text>
      ) : null}
      <LeaderboardTable entries={entries} />
      {hasNextPage ? (
        <Center>
          <GradientButton
            variant="outline"
            onClick={() => void fetchNextPage()}
            loading={isFetchingNextPage}
            loadingText="Loading..."
          >
            Load more
          </GradientButton>
        </Center>
      ) : null}
    </VStack>
  )
}

export const LeaderboardPage = () => {
  const { isAuthenticated } = useAuth()

  return (
    <PageWrapper>
      <VStack align="stretch" gap={8}>
        <VStack align="flex-start" gap={2}>
          <TextReveal text="Leaderboard" gradient size={{ base: '2xl', md: '4xl' }} />
          <Text color="fg.muted">
            Top roastees ranked by best score, then average. Only finished roasts count.
          </Text>
        </VStack>
        {isAuthenticated ? <YourRankCard /> : null}
        <LeaderboardBody />
      </VStack>
    </PageWrapper>
  )
}
