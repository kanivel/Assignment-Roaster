import type { StackProps } from '@chakra-ui/react'
import { Children, type ReactNode } from 'react'

import { fadeUp, MotionBox, type MotionSafeProps, staggerContainer } from '../../lib/motion'

export interface AnimatedListProps extends Omit<MotionSafeProps<StackProps>, 'children'> {
  children: ReactNode
  /** Space between items (Chakra spacing token). */
  gap?: StackProps['gap']
}

/** Renders children in a vertical stack with a staggered fade-up entrance. */
export const AnimatedList = ({ children, gap = 4, ...rest }: AnimatedListProps) => (
  <MotionBox
    display="flex"
    flexDirection="column"
    gap={gap}
    initial="hidden"
    animate="visible"
    variants={staggerContainer}
    {...rest}
  >
    {Children.map(children, (child, index) => (
      <MotionBox key={index} variants={fadeUp}>
        {child}
      </MotionBox>
    ))}
  </MotionBox>
)
