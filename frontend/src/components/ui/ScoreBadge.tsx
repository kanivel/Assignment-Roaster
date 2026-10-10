import { Badge, type BadgeProps } from '@chakra-ui/react'

import { clampScore, getScoreTier, MAX_SCORE, type ScoreTier } from '../../lib/score'

export interface ScoreBadgeProps extends Omit<BadgeProps, 'colorPalette'> {
  /** Score from 0 to 10 (inclusive). Values outside the range are clamped. */
  score: number
  /** Show the "/10" suffix. */
  showMax?: boolean
}

const TIER_PALETTE: Record<ScoreTier, 'red' | 'orange' | 'green'> = {
  low: 'red',
  mid: 'orange',
  high: 'green',
}

export const ScoreBadge = ({ score, showMax = true, ...rest }: ScoreBadgeProps) => {
  const safeScore = clampScore(score)
  const tier = getScoreTier(safeScore)

  return (
    <Badge
      colorPalette={TIER_PALETTE[tier]}
      variant="solid"
      rounded="pill"
      px={3}
      py={1}
      fontSize="sm"
      fontWeight="bold"
      fontFamily="mono"
      data-tier={tier}
      aria-label={`Score ${safeScore} out of ${MAX_SCORE}`}
      {...rest}
    >
      {safeScore}
      {showMax ? `/${MAX_SCORE}` : null}
    </Badge>
  )
}
