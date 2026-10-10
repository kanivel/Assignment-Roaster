import { Center, HStack, Link as ChakraLink, Spinner, Text, VStack } from '@chakra-ui/react'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'

import { PageWrapper } from '../components/layout/PageWrapper'
import { ReviewPanel } from '../components/review/ReviewPanel'
import { RepoHeader } from '../components/submissions/RepoHeader'
import { GlassCard } from '../components/ui/GlassCard'
import { GradientButton } from '../components/ui/GradientButton'
import { useSubmissionPolling } from '../hooks/useSubmissionPolling'
import { useDeleteSubmission, useRetrySubmission } from '../hooks/useSubmissions'
import { getApiErrorMessage } from '../services/submissions'

const parseId = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

export const SubmissionDetailPage = () => {
  const { id: rawId } = useParams<{ id: string }>()
  const id = parseId(rawId)
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const { data: submission, isPending, isError, error, isPollingTimedOut } =
    useSubmissionPolling(id)
  const deleteMutation = useDeleteSubmission()
  const retryMutation = useRetrySubmission()

  const handleDelete = (): void => {
    if (id === undefined) return
    deleteMutation.mutate(id, { onSuccess: () => navigate('/submissions') })
  }

  const handleRetry = (): void => {
    if (id === undefined) return
    retryMutation.mutate(id)
  }

  if (id === undefined || isError) {
    return (
      <PageWrapper maxW="3xl" centered>
        <GlassCard hoverable={false} role="alert" textAlign="center" py={12}>
          <Text fontSize="2xl" fontWeight="bold" fontFamily="heading">
            Submission not found
          </Text>
          <Text mt={2} color="fg.muted">
            {id === undefined
              ? 'That link does not look like a submission.'
              : getApiErrorMessage(error, 'Could not load this submission.', {
                  notFoundMessage: 'Submission not found.',
                })}
          </Text>
          <ChakraLink asChild mt={6} display="inline-block" color="brand.fg" fontWeight="semibold">
            <RouterLink to="/submissions">Back to my submissions</RouterLink>
          </ChakraLink>
        </GlassCard>
      </PageWrapper>
    )
  }

  if (isPending) {
    return (
      <PageWrapper>
        <Center py={24}>
          <Spinner size="xl" color="brand.fg" borderWidth="3px" />
        </Center>
      </PageWrapper>
    )
  }

  const deleteError = deleteMutation.isError
    ? getApiErrorMessage(deleteMutation.error, 'Could not delete this submission.')
    : null
  const retryError = retryMutation.isError
    ? getApiErrorMessage(retryMutation.error, 'Could not retry this submission.')
    : null

  return (
    <PageWrapper maxW="4xl">
      <VStack align="stretch" gap={{ base: 5, md: 8 }}>
        <ChakraLink asChild fontSize="sm" color="fg.muted" w="fit-content" _hover={{ color: 'brand.fg' }}>
          <RouterLink to="/submissions">← My submissions</RouterLink>
        </ChakraLink>

        <RepoHeader submission={submission} />

        <ReviewPanel
          submission={submission}
          onRetry={handleRetry}
          isRetrying={retryMutation.isPending}
          retryError={retryError}
          isPollingTimedOut={isPollingTimedOut}
        />

        <GlassCard hoverable={false}>
          <HStack justify="space-between" flexWrap="wrap" gap={4}>
            <VStack align="flex-start" gap={1}>
              <Text fontWeight="semibold">Delete this submission</Text>
              <Text fontSize="sm" color="fg.subtle">
                Removes the repo and its roast permanently.
              </Text>
              {deleteError ? (
                <Text fontSize="sm" color="red.300" role="alert">
                  {deleteError}
                </Text>
              ) : null}
            </VStack>
            {confirmingDelete ? (
              <HStack gap={3}>
                <Text fontSize="sm" color="fg.muted">
                  Sure?
                </Text>
                <GradientButton
                  size="sm"
                  onClick={handleDelete}
                  loading={deleteMutation.isPending}
                  loadingText="Deleting..."
                  aria-label="Confirm delete"
                >
                  Yes, delete
                </GradientButton>
                <GradientButton
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </GradientButton>
              </HStack>
            ) : (
              <GradientButton variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
                Delete
              </GradientButton>
            )}
          </HStack>
        </GlassCard>
      </VStack>
    </PageWrapper>
  )
}
