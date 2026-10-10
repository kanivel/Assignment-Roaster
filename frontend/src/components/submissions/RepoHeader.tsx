import { Badge, Flex, Heading, HStack, Link, Text } from '@chakra-ui/react'

import type { Submission } from '../../types'
import { GlassCard } from '../ui/GlassCard'
import { StatusBadge } from '../ui/StatusBadge'
import { formatRelativeTime } from './relativeTime'

export interface RepoHeaderProps {
  submission: Submission
}

const shortSha = (sha: string): string => sha.slice(0, 7)

export const RepoHeader = ({ submission }: RepoHeaderProps) => {
  const sha = shortSha(submission.commit_sha)

  return (
    <GlassCard hoverable={false} as="header">
      <Flex
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'flex-start', md: 'center' }}
        justify="space-between"
        gap={4}
      >
        <Flex direction="column" gap={2} minW={0}>
          <Heading as="h1" size={{ base: 'xl', md: '2xl' }} fontFamily="heading" lineHeight="shorter">
            <Text as="span" color="fg.muted">
              {submission.repo_owner}/
            </Text>
            {submission.repo_name}
          </Heading>
          <HStack gap={2} flexWrap="wrap">
            <Badge variant="outline" rounded="pill" fontFamily="mono" fontSize="2xs">
              {submission.default_branch}
            </Badge>
            <Badge variant="subtle" rounded="pill" fontFamily="mono" fontSize="2xs" title={submission.commit_sha}>
              {sha}
            </Badge>
            <Text fontSize="sm" color="fg.subtle">
              Submitted {formatRelativeTime(submission.created_at)}
            </Text>
          </HStack>
          <Link
            href={submission.github_url}
            target="_blank"
            rel="noopener noreferrer"
            fontSize="sm"
            color="brand.fg"
            w="fit-content"
          >
            Open on GitHub ↗
          </Link>
        </Flex>
        <StatusBadge status={submission.status} fontSize="sm" />
      </Flex>
    </GlassCard>
  )
}
