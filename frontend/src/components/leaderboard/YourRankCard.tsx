import { HStack, SimpleGrid, Skeleton, Text, VStack } from '@chakra-ui/react'
import type { ReactNode } from 'react'

import { useMyRank } from '../../hooks/useLeaderboard'
import { GlassCard } from '../ui/GlassCard'
import { ScoreBadge } from '../ui/ScoreBadge'
import { formatAverage } from './format'

interface StatProps {
  label: string
  children: ReactNode
}

const Stat = ({ label, children }: StatProps) => (
  <VStack align="flex-start" gap={1}>
    <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="fg.subtle">
      {label}
    </Text>
    {children}
  </VStack>
)

/** The signed-in user's standing. Render only when authenticated (the endpoint requires a session). */
export const YourRankCard = () => {
  const { data, isPending, isError } = useMyRank()

  if (isError) return null

  const hasRank = data?.rank !== null && data?.rank !== undefined

  return (
    <GlassCard hoverable={false} data-testid="your-rank-card" aria-label="Your rank">
      <HStack justify="space-between" align="flex-start" flexWrap="wrap" gap={4}>
        <VStack align="flex-start" gap={1}>
          <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="brand.fg">
            Your rank
          </Text>
          {isPending ? (
            <Skeleton h="2.5rem" w="6rem" rounded="md" />
          ) : (
            <Text fontFamily="heading" fontWeight="extrabold" fontSize="4xl" lineHeight="1">
              {hasRank ? `#${data.rank}` : 'Unranked'}
            </Text>
          )}
          {!isPending && !hasRank ? (
            <Text fontSize="sm" color="fg.muted">
              Finish a roast to appear on the board.
            </Text>
          ) : null}
        </VStack>
        {isPending ? null : (
          <SimpleGrid columns={3} gap={6}>
            <Stat label="Best">
              {data.best_score === null ? (
                <Text color="fg.muted">--</Text>
              ) : (
                <ScoreBadge score={data.best_score} />
              )}
            </Stat>
            <Stat label="Average">
              <Text fontFamily="mono" fontWeight="semibold">
                {data.average_score === null ? '--' : formatAverage(data.average_score)}
              </Text>
            </Stat>
            <Stat label="Roasts">
              <Text fontFamily="mono" fontWeight="semibold">
                {data.submissions_count}
              </Text>
            </Stat>
          </SimpleGrid>
        )}
      </HStack>
    </GlassCard>
  )
}
