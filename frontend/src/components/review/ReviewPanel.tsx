import { Flex, HStack, Spinner, Text, VStack } from '@chakra-ui/react'
import { AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'

import { MotionBox, MotionText, springTransition } from '../../lib/motion'
import type { Submission } from '../../types'
import { GlassCard } from '../ui/GlassCard'
import { GradientButton } from '../ui/GradientButton'
import { ScoreBadge } from '../ui/ScoreBadge'
import { RoastCard } from './RoastCard'
import { StrengthsImprovementsList } from './StrengthsImprovementsList'
import { WAITING_LINES } from './waitingLines'

export interface ReviewPanelProps {
  submission: Submission
  /** Re-enqueue a failed submission. Shown only when status is `failed`. */
  onRetry?: () => void
  isRetrying?: boolean
  /** Error from a failed retry attempt, if any. */
  retryError?: string | null
  /** True once the page has stopped polling because the review ran too long. */
  isPollingTimedOut?: boolean
}

export const POLLING_TIMEOUT_HINT =
  'This is taking longer than usual. Try refreshing or retry later.'

const LINE_ROTATE_MS = 2800

interface RoastingInProgressProps {
  status: Submission['status']
  isPollingTimedOut: boolean
}

const RoastingInProgress = ({ status, isPollingTimedOut }: RoastingInProgressProps) => {
  const [lineIndex, setLineIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(
      () => setLineIndex((index) => (index + 1) % WAITING_LINES.length),
      LINE_ROTATE_MS,
    )
    return () => window.clearInterval(timer)
  }, [])

  const line = WAITING_LINES[lineIndex] ?? WAITING_LINES[0]

  return (
    <GlassCard hoverable={false} as="section" aria-live="polite" aria-busy="true" py={{ base: 10, md: 14 }}>
      <VStack gap={6} textAlign="center">
        <MotionBox
          fontSize="5xl"
          animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          🔥
        </MotionBox>
        <HStack gap={3}>
          <Spinner size="sm" color="brand.fg" />
          <Text fontFamily="heading" fontWeight="bold" fontSize={{ base: 'xl', md: '2xl' }}>
            Roasting in progress...
          </Text>
        </HStack>
        <Text fontSize="sm" color="fg.subtle" textTransform="uppercase" letterSpacing="wider">
          {status === 'pending' ? 'Queued' : 'Reading your code'}
        </Text>
        <AnimatePresence mode="wait" initial={false}>
          <MotionText
            key={lineIndex}
            color="fg.muted"
            fontSize="md"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {line}
          </MotionText>
        </AnimatePresence>
        {isPollingTimedOut ? (
          <Text fontSize="sm" color="orange.300" role="status">
            {POLLING_TIMEOUT_HINT}
          </Text>
        ) : null}
      </VStack>
    </GlassCard>
  )
}

interface FailedProps {
  message: string | null
  onRetry?: () => void
  isRetrying: boolean
  retryError: string | null
}

const ReviewFailed = ({ message, onRetry, isRetrying, retryError }: FailedProps) => (
  <GlassCard hoverable={false} as="section" role="alert" borderColor="red.400">
    <VStack align="flex-start" gap={4}>
      <Text fontFamily="heading" fontWeight="bold" fontSize="xl" color="red.300">
        Roast failed
      </Text>
      <Text color="fg.muted">
        {message ?? 'Something went wrong while reviewing this repo.'}
      </Text>
      {retryError ? (
        <Text color="red.200" fontSize="sm">
          {retryError}
        </Text>
      ) : null}
      {onRetry ? (
        <GradientButton onClick={onRetry} loading={isRetrying} loadingText="Re-queueing...">
          Retry roast
        </GradientButton>
      ) : null}
    </VStack>
  </GlassCard>
)

export const ReviewPanel = ({
  submission,
  onRetry,
  isRetrying = false,
  retryError = null,
  isPollingTimedOut = false,
}: ReviewPanelProps) => {
  const { status, review } = submission

  if (status === 'pending' || status === 'reviewing') {
    return <RoastingInProgress status={status} isPollingTimedOut={isPollingTimedOut} />
  }

  if (status === 'failed' || review === null) {
    return (
      <ReviewFailed
        message={
          status === 'failed'
            ? submission.error_message
            : 'The review finished but no roast was saved. Try again.'
        }
        onRetry={onRetry}
        isRetrying={isRetrying}
        retryError={retryError}
      />
    )
  }

  return (
    <VStack align="stretch" gap={{ base: 4, md: 6 }}>
      <Flex justify="center">
        <MotionBox
          initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={springTransition}
        >
          <ScoreBadge
            score={review.score}
            fontSize={{ base: '3xl', md: '4xl' }}
            px={6}
            py={3}
            data-testid="review-score"
          />
        </MotionBox>
      </Flex>
      <RoastCard summary={review.summary} roastText={review.roast_text} />
      <StrengthsImprovementsList strengths={review.strengths} improvements={review.improvements} />
      <Text fontSize="xs" color="fg.subtle" textAlign="center" fontFamily="mono">
        Roasted by {review.model_used} · {review.input_tokens.toLocaleString()} in /{' '}
        {review.output_tokens.toLocaleString()} out tokens
      </Text>
    </VStack>
  )
}
