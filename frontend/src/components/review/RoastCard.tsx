import { Button, Flex, Heading, Text } from '@chakra-ui/react'
import { useEffect, useState } from 'react'

import { MotionBox, smoothTransition } from '../../lib/motion'
import { GlassCard } from '../ui/GlassCard'

export interface RoastCardProps {
  /** One-line verdict shown as the headline. */
  summary: string
  /** The Tanglish roast. Rendered as plain text; line breaks are preserved. */
  roastText: string
}

const COPIED_RESET_MS = 2000

export const RoastCard = ({ summary, roastText }: RoastCardProps) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(roastText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <GlassCard hoverable={false} as="section" aria-label="Roast">
      <Flex justify="space-between" align="flex-start" gap={4} mb={4}>
        <MotionBox
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={smoothTransition}
        >
          <Text
            fontSize="xs"
            fontWeight="semibold"
            textTransform="uppercase"
            letterSpacing="wider"
            color="brand.fg"
          >
            The verdict
          </Text>
          <Heading as="h2" size={{ base: 'lg', md: 'xl' }} fontFamily="heading" mt={1}>
            {summary}
          </Heading>
        </MotionBox>
        <Button
          size="sm"
          variant="outline"
          rounded="pill"
          flexShrink={0}
          onClick={() => void handleCopy()}
          aria-live="polite"
        >
          {copied ? 'Copied!' : 'Copy roast'}
        </Button>
      </Flex>
      <MotionBox
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...smoothTransition, delay: 0.15 }}
      >
        <Text
          whiteSpace="pre-wrap"
          wordBreak="break-word"
          fontSize={{ base: 'md', md: 'lg' }}
          lineHeight="tall"
          color="fg.default"
          data-testid="roast-text"
        >
          {roastText}
        </Text>
      </MotionBox>
    </GlassCard>
  )
}
