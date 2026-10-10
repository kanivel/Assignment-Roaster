import { Flex, HStack, Link as ChakraLink, Text, VStack } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'

import type { Submission } from '../../types/submission'
import { formatRelativeTime } from '../submissions/relativeTime'
import { GlassCard } from '../ui/GlassCard'
import { ScoreBadge } from '../ui/ScoreBadge'
import { StatusBadge } from '../ui/StatusBadge'

export interface LatestRoastCardProps {
  submission: Submission | null
  delay?: number
}

const STATUS_COPY: Record<Submission['status'], string> = {
  pending: 'Queued. The roaster will get to it shortly.',
  reviewing: 'Roasting in progress. Refresh in a moment.',
  done: '',
  failed: 'This roast failed. Open it to retry.',
}

export const LatestRoastCard = ({ submission, delay = 0 }: LatestRoastCardProps) => {
  if (submission === null) {
    return (
      <GlassCard hoverable={false} delay={delay} data-testid="latest-roast-empty">
        <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="brand.fg">
          Latest roast
        </Text>
        <Text mt={2} color="fg.muted">
          Nothing roasted yet. Your first verdict will show up here.
        </Text>
      </GlassCard>
    )
  }

  const detailPath = `/submissions/${submission.id}`
  const repoLabel = `${submission.repo_owner}/${submission.repo_name}`
  const review = submission.status === 'done' ? submission.review : null

  return (
    <GlassCard hoverable={false} delay={delay} data-testid="latest-roast-card" as="section">
      <Flex justify="space-between" align="flex-start" gap={4} flexWrap="wrap">
        <VStack align="flex-start" gap={1} minW={0}>
          <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="brand.fg">
            Latest roast
          </Text>
          <ChakraLink
            asChild
            fontFamily="heading"
            fontWeight="bold"
            fontSize="xl"
            color="fg.default"
            _hover={{ color: 'brand.fg', textDecoration: 'none' }}
          >
            <RouterLink to={detailPath}>{repoLabel}</RouterLink>
          </ChakraLink>
          <Text fontSize="sm" color="fg.subtle">
            Submitted {formatRelativeTime(submission.created_at)}
          </Text>
        </VStack>
        <HStack gap={3}>
          <StatusBadge status={submission.status} />
          {review ? <ScoreBadge score={review.score} /> : null}
        </HStack>
      </Flex>
      <Text mt={4} fontSize={{ base: 'md', md: 'lg' }} color={review ? 'fg.default' : 'fg.muted'}>
        {review ? review.summary : STATUS_COPY[submission.status]}
      </Text>
      <ChakraLink asChild mt={4} display="inline-block" fontWeight="semibold" color="brand.fg">
        <RouterLink to={detailPath} aria-label={`View roast for ${repoLabel}`}>
          {review ? 'Read the full roast →' : 'Open submission →'}
        </RouterLink>
      </ChakraLink>
    </GlassCard>
  )
}
