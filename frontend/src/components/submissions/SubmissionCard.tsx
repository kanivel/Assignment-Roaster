import { Badge, Flex, HStack, Link as ChakraLink, Text } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'

import type { Submission } from '../../types'
import { GlassCard } from '../ui/GlassCard'
import { ScoreBadge } from '../ui/ScoreBadge'
import { StatusBadge } from '../ui/StatusBadge'
import { formatRelativeTime } from './relativeTime'

export interface SubmissionCardProps {
  submission: Submission
}

export const SubmissionCard = ({ submission }: SubmissionCardProps) => {
  const detailPath = `/submissions/${submission.id}`
  const repoLabel = `${submission.repo_owner}/${submission.repo_name}`

  return (
    <GlassCard data-testid={`submission-card-${submission.id}`}>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        align={{ base: 'flex-start', sm: 'center' }}
        justify="space-between"
        gap={4}
      >
        <Flex direction="column" gap={1} minW={0}>
          <ChakraLink
            asChild
            fontFamily="heading"
            fontWeight="bold"
            fontSize="lg"
            color="fg.default"
            _hover={{ color: 'brand.fg', textDecoration: 'none' }}
          >
            <RouterLink to={detailPath}>{repoLabel}</RouterLink>
          </ChakraLink>
          <HStack gap={2} flexWrap="wrap">
            <Badge variant="outline" rounded="pill" fontFamily="mono" fontSize="2xs">
              {submission.default_branch}
            </Badge>
            <Text fontSize="sm" color="fg.subtle">
              Submitted {formatRelativeTime(submission.created_at)}
            </Text>
          </HStack>
        </Flex>
        <HStack gap={3}>
          <StatusBadge status={submission.status} />
          {submission.review ? <ScoreBadge score={submission.review.score} /> : null}
          <ChakraLink asChild fontSize="sm" fontWeight="semibold" color="brand.fg">
            <RouterLink to={detailPath} aria-label={`View roast for ${repoLabel}`}>
              View roast →
            </RouterLink>
          </ChakraLink>
        </HStack>
      </Flex>
    </GlassCard>
  )
}
