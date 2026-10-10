import { Text, VStack } from '@chakra-ui/react'
import type { ReactNode } from 'react'

import { GlassCard } from '../ui/GlassCard'

export interface StatCardProps {
  label: string
  /** Pre-formatted value, or a node such as a ScoreBadge. */
  value: ReactNode
  /** Small line under the value. */
  hint?: string
  /** Paint the value with the roast gradient. */
  accent?: boolean
  delay?: number
}

export const StatCard = ({ label, value, hint, accent = false, delay = 0 }: StatCardProps) => (
  <GlassCard delay={delay} data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, '-')}`}>
    <VStack align="flex-start" gap={2}>
      <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="fg.subtle">
        {label}
      </Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text
          fontFamily="heading"
          fontWeight="extrabold"
          fontSize={{ base: '3xl', md: '4xl' }}
          lineHeight="1"
          bgImage={accent ? 'gradients.roast' : undefined}
          bgClip={accent ? 'text' : undefined}
          color={accent ? 'transparent' : 'fg.default'}
        >
          {value}
        </Text>
      ) : (
        value
      )}
      {hint ? (
        <Text fontSize="sm" color="fg.muted">
          {hint}
        </Text>
      ) : null}
    </VStack>
  </GlassCard>
)
