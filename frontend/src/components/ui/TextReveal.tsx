import type { HeadingProps } from '@chakra-ui/react'

import { MotionHeading, type MotionSafeProps } from '../../lib/motion'

export interface TextRevealProps extends Omit<MotionSafeProps<HeadingProps>, 'children'> {
  text: string
  /** Paint the text with the roast gradient. */
  gradient?: boolean
  delay?: number
}

/** Headline that reveals word-by-word with a staggered rise. */
export const TextReveal = ({ text, gradient = false, delay = 0, ...rest }: TextRevealProps) => {
  const words = text.split(' ')

  return (
    <MotionHeading
      as="h1"
      size={{ base: '3xl', md: '5xl' }}
      fontWeight="extrabold"
      letterSpacing="tight"
      lineHeight="shorter"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: delay } },
      }}
      bgImage={gradient ? 'gradients.roast' : undefined}
      bgClip={gradient ? 'text' : undefined}
      color={gradient ? 'transparent' : undefined}
      {...rest}
    >
      {words.map((word, index) => (
        <MotionHeading
          as="span"
          key={`${word}-${index}`}
          display="inline-block"
          mr="0.25em"
          variants={{
            hidden: { opacity: 0, y: '0.6em' },
            visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
          }}
        >
          {word}
        </MotionHeading>
      ))}
    </MotionHeading>
  )
}
