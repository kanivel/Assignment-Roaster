import { Table, Text } from '@chakra-ui/react'

import { useAuth } from '../../hooks/useAuth'
import type { LeaderboardEntry } from '../../types/leaderboard'
import { GlassCard } from '../ui/GlassCard'
import { RankRow } from './RankRow'

export interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
}

export const LeaderboardTable = ({ entries }: LeaderboardTableProps) => {
  const { user } = useAuth()
  const currentUserId = user?.id ?? null

  if (entries.length === 0) {
    return (
      <GlassCard hoverable={false} textAlign="center" py={12} data-testid="leaderboard-empty">
        <Text fontSize="2xl" fontWeight="bold" fontFamily="heading">
          The board is empty
        </Text>
        <Text mt={2} color="fg.muted">
          Nobody has survived a roast yet. Submit a repo and claim the top spot.
        </Text>
      </GlassCard>
    )
  }

  return (
    <GlassCard hoverable={false} p={0} overflow="hidden">
      <Table.ScrollArea>
        <Table.Root size="md" variant="line" interactive aria-label="Leaderboard">
          <Table.Header>
            <Table.Row bg="bg.surface">
              <Table.ColumnHeader color="fg.subtle" w="5rem">
                Rank
              </Table.ColumnHeader>
              <Table.ColumnHeader color="fg.subtle">Roastee</Table.ColumnHeader>
              <Table.ColumnHeader color="fg.subtle">Best</Table.ColumnHeader>
              <Table.ColumnHeader color="fg.subtle" display={{ base: 'none', sm: 'table-cell' }}>
                Average
              </Table.ColumnHeader>
              <Table.ColumnHeader
                color="fg.subtle"
                textAlign="end"
                display={{ base: 'none', md: 'table-cell' }}
              >
                Roasts
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {entries.map((entry) => (
              <RankRow
                key={entry.user_id}
                entry={entry}
                isCurrentUser={currentUserId !== null && entry.user_id === currentUserId}
              />
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </GlassCard>
  )
}
