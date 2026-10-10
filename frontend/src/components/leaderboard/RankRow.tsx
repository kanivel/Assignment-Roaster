import { Avatar, Badge, HStack, Table, Text } from '@chakra-ui/react'

import type { LeaderboardEntry } from '../../types/leaderboard'
import { ScoreBadge } from '../ui/ScoreBadge'
import { ANONYMOUS_NAME, formatAverage } from './format'

export interface RankRowProps {
  entry: LeaderboardEntry
  /** Highlight this row as the signed-in user's own entry. */
  isCurrentUser?: boolean
}

interface MedalStyle {
  emoji: string
  label: string
  bg: string
  color: string
}

const MEDALS: Record<number, MedalStyle> = {
  1: { emoji: '🥇', label: 'Gold', bg: 'rgba(255, 196, 0, 0.14)', color: 'yellow.300' },
  2: { emoji: '🥈', label: 'Silver', bg: 'rgba(205, 210, 220, 0.12)', color: 'gray.200' },
  3: { emoji: '🥉', label: 'Bronze', bg: 'rgba(205, 127, 50, 0.14)', color: 'orange.300' },
}

export const RankRow = ({ entry, isCurrentUser = false }: RankRowProps) => {
  const medal = MEDALS[entry.rank]
  const displayName = entry.full_name?.trim() ? entry.full_name : ANONYMOUS_NAME

  return (
    <Table.Row
      data-testid={`rank-row-${entry.user_id}`}
      data-current-user={isCurrentUser ? 'true' : undefined}
      data-medal={medal ? entry.rank : undefined}
      bg={isCurrentUser ? 'brand.subtle' : medal?.bg}
      borderLeftWidth={isCurrentUser ? '3px' : undefined}
      borderLeftColor={isCurrentUser ? 'brand.400' : undefined}
      _hover={{ bg: isCurrentUser ? 'brand.subtle' : 'bg.glass' }}
      transition="background 0.2s ease"
    >
      <Table.Cell fontFamily="mono" fontWeight="bold" color={medal?.color ?? 'fg.muted'}>
        {medal ? (
          <HStack gap={1}>
            <span role="img" aria-label={`${medal.label} medal`}>
              {medal.emoji}
            </span>
            <span>{entry.rank}</span>
          </HStack>
        ) : (
          `#${entry.rank}`
        )}
      </Table.Cell>
      <Table.Cell>
        <HStack gap={3} minW={0}>
          <Avatar.Root size="sm" colorPalette="brand">
            {entry.avatar_url ? <Avatar.Image src={entry.avatar_url} alt="" /> : null}
            <Avatar.Fallback name={displayName} />
          </Avatar.Root>
          <HStack gap={2} minW={0} flexWrap="wrap">
            <Text fontWeight={isCurrentUser ? 'bold' : 'medium'} truncate maxW="14rem">
              {displayName}
            </Text>
            {isCurrentUser ? (
              <Badge colorPalette="brand" variant="solid" rounded="pill" fontSize="2xs">
                You
              </Badge>
            ) : null}
          </HStack>
        </HStack>
      </Table.Cell>
      <Table.Cell>
        <ScoreBadge score={entry.best_score} />
      </Table.Cell>
      <Table.Cell fontFamily="mono" color="fg.muted" display={{ base: 'none', sm: 'table-cell' }}>
        {formatAverage(entry.average_score)}
      </Table.Cell>
      <Table.Cell
        fontFamily="mono"
        color="fg.muted"
        textAlign="end"
        display={{ base: 'none', md: 'table-cell' }}
      >
        {entry.submissions_count}
      </Table.Cell>
    </Table.Row>
  )
}
