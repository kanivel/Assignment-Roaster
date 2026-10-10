import { Center, Spinner, Text, VStack } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'

import { useInfiniteSubmissions } from '../../hooks/useSubmissions'
import { getApiErrorMessage } from '../../services/submissions'
import { AnimatedList } from '../ui/AnimatedList'
import { GlassCard } from '../ui/GlassCard'
import { GradientButton } from '../ui/GradientButton'
import { SubmissionCard } from './SubmissionCard'

export interface SubmissionListProps {
  pageSize?: number
}

export const SubmissionList = ({ pageSize = 20 }: SubmissionListProps) => {
  const navigate = useNavigate()
  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteSubmissions(pageSize)

  if (isPending) {
    return (
      <Center py={16}>
        <Spinner size="xl" color="brand.fg" borderWidth="3px" />
      </Center>
    )
  }

  if (isError) {
    return (
      <GlassCard hoverable={false} role="alert">
        <Text fontWeight="semibold" color="red.300">
          {getApiErrorMessage(error, 'Could not load your submissions.')}
        </Text>
        <GradientButton mt={4} variant="outline" onClick={() => void refetch()}>
          Try again
        </GradientButton>
      </GlassCard>
    )
  }

  const items = data.pages.flatMap((page) => page.items)
  const total = data.pages[0]?.total ?? items.length

  if (items.length === 0) {
    return (
      <GlassCard hoverable={false} textAlign="center" py={12}>
        <Text fontSize="2xl" fontWeight="bold" fontFamily="heading">
          No roasts yet
        </Text>
        <Text mt={2} color="fg.muted">
          Submit your first repo and find out what the roaster thinks.
        </Text>
        <GradientButton mt={6} size="lg" onClick={() => navigate('/submit')}>
          Submit a repo
        </GradientButton>
      </GlassCard>
    )
  }

  return (
    <VStack align="stretch" gap={6}>
      <Text fontSize="sm" color="fg.subtle">
        Showing {items.length} of {total}
      </Text>
      <AnimatedList gap={4}>
        {items.map((submission) => (
          <SubmissionCard key={submission.id} submission={submission} />
        ))}
      </AnimatedList>
      {hasNextPage ? (
        <Center>
          <GradientButton
            variant="outline"
            onClick={() => void fetchNextPage()}
            loading={isFetchingNextPage}
            loadingText="Loading..."
          >
            Load more
          </GradientButton>
        </Center>
      ) : null}
    </VStack>
  )
}
