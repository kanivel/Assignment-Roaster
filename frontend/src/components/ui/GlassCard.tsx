import type { BoxProps } from '@chakra-ui/react'
import type { ReactNode } from 'react'

import { MotionBox, type MotionSafeProps, smoothTransition } from '../../lib/motion'

export interface GlassCardProps extends MotionSafeProps<BoxProps> {
  children: ReactNode
  /** Disable the hover lift (for static containers). */
  hoverable?: boolean
  /** Delay the entrance animation (seconds). */
  delay?: number
}

export const GlassCard = ({
  children,
  hoverable = true,
  delay = 0,
  ...rest
}: GlassCardProps) => (
  <MotionBox
    p={{ base: 5, md: 6 }}
    rounded="card"
    bg="bg.glass"
    borderWidth="1px"
    borderColor="border.glass"
    backdropFilter="blur(18px) saturate(140%)"
    boxShadow="glass"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={hoverable ? { scale: 1.015, y: -4, boxShadow: 'var(--chakra-shadows-glow)' } : undefined}
    transition={{ ...smoothTransition, delay }}
    {...rest}
  >
    {children}
  </MotionBox>
)
