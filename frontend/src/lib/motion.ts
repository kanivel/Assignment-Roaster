import { Box, Button, Flex, Heading, Input, Text } from '@chakra-ui/react'
import { motion, type Transition, type Variants } from 'framer-motion'

/** Chakra components wrapped with Framer Motion. Accept style props plus motion props. */
export const MotionBox = motion.create(Box)
export const MotionFlex = motion.create(Flex)
export const MotionButton = motion.create(Button)
export const MotionInput = motion.create(Input)
export const MotionText = motion.create(Text)
export const MotionHeading = motion.create(Heading)

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 26,
}

export const smoothTransition: Transition = {
  duration: 0.3,
  ease: 'easeOut',
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: smoothTransition },
}

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

/**
 * Keys on Chakra/DOM props whose types clash with Framer Motion's own handlers
 * (`onAnimationStart`, `onDrag*`) or the `transition` style prop. Strip them before
 * spreading Chakra props into a `motion.create(...)` component.
 */
export type MotionConflictKeys =
  | 'transition'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragExit'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDrop'

export type MotionSafeProps<P> = Omit<P, MotionConflictKeys>
