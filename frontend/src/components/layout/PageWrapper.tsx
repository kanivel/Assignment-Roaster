import { Container, type ContainerProps } from '@chakra-ui/react'
import type { ReactNode } from 'react'

import { MotionBox, smoothTransition } from '../../lib/motion'

export interface PageWrapperProps {
  children: ReactNode
  /** Max content width. Defaults to Chakra `6xl`. */
  maxW?: ContainerProps['maxW']
  /** Vertically centre content (for auth / hero pages). */
  centered?: boolean
}

/** Fades each page in on mount and out on route change. Wrap every page in this. */
export const PageWrapper = ({ children, maxW = '6xl', centered = false }: PageWrapperProps) => (
  <MotionBox
    as="main"
    minH="calc(100vh - 4.5rem)"
    display="flex"
    flexDirection="column"
    initial={{ opacity: 0, x: -16 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 16 }}
    transition={smoothTransition}
  >
    <Container
      maxW={maxW}
      px={{ base: 4, md: 8 }}
      py={{ base: 8, md: 12 }}
      flex="1"
      display="flex"
      flexDirection="column"
      justifyContent={centered ? 'center' : 'flex-start'}
    >
      {children}
    </Container>
  </MotionBox>
)
