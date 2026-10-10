import {
  Button,
  Center,
  HStack,
  Link as ChakraLink,
  NativeSelect,
  Spinner,
  Table,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { useAdminSubmissions, useDeleteAdminReview } from '../../hooks/useAdmin'
import { ADMIN_PAGE_SIZE } from '../../services/admin'
import { getApiErrorMessage } from '../../services/submissions'
import type { AdminSubmission } from '../../types/admin'
import { SUBMISSION_STATUSES, type SubmissionStatus } from '../../types/submission'
import { FormAlert } from '../auth/FormAlert'
import { formatRelativeTime } from '../submissions/relativeTime'
import { GlassCard } from '../ui/GlassCard'
import { GradientButton } from '../ui/GradientButton'
import { ScoreBadge } from '../ui/ScoreBadge'
import { StatusBadge } from '../ui/StatusBadge'
import { TablePager } from './TablePager'

export interface SubmissionTableProps {
  pageSize?: number
}

const isSubmissionStatus = (value: string): value is SubmissionStatus =>
  (SUBMISSION_STATUSES as readonly string[]).includes(value)

interface RemoveReviewCellProps {
  submission: AdminSubmission
  isConfirming: boolean
  isDeleting: boolean
  onStart: () => void
  onCancel: () => void
  onConfirm: (reviewId: number) => void
}

const RemoveReviewCell = ({
  submission,
  isConfirming,
  isDeleting,
  onStart,
  onCancel,
  onConfirm,
}: RemoveReviewCellProps) => {
  const review = submission.status === 'done' ? submission.review : null
  if (review === null) {
    return (
      <Text fontSize="sm" color="fg.subtle">
        --
      </Text>
    )
  }

  if (isConfirming) {
    return (
      <HStack gap={2} flexWrap="wrap">
        <Text fontSize="sm" color="fg.muted">
          Remove this review?
        </Text>
        <Button
          size="xs"
          colorPalette="red"
          rounded="pill"
          loading={isDeleting}
          onClick={() => onConfirm(review.id)}
        >
          Yes, remove
        </Button>
        <Button size="xs" variant="ghost" rounded="pill" disabled={isDeleting} onClick={onCancel}>
          Cancel
        </Button>
      </HStack>
    )
  }

  return (
    <Button
      size="xs"
      variant="outline"
      colorPalette="red"
      rounded="pill"
      onClick={onStart}
      aria-label={`Remove review for ${submission.repo_owner}/${submission.repo_name}`}
    >
      Remove review
    </Button>
  )
}

export const SubmissionTable = ({ pageSize = ADMIN_PAGE_SIZE }: SubmissionTableProps) => {
  const [status, setStatus] = useState<SubmissionStatus | undefined>(undefined)
  const [offset, setOffset] = useState(0)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data, isPending, isError, error, isFetching, refetch } = useAdminSubmissions({
    status,
    limit: pageSize,
    offset,
  })
  const deleteReview = useDeleteAdminReview()

  const handleStatusChange = (value: string): void => {
    setStatus(isSubmissionStatus(value) ? value : undefined)
    setOffset(0)
  }

  const handleConfirm = (reviewId: number): void => {
    setErrorMessage(null)
    deleteReview.mutate(reviewId, {
      onSuccess: () => setConfirmingId(null),
      onError: (mutationError) =>
        setErrorMessage(getApiErrorMessage(mutationError, 'Could not remove that review.')),
    })
  }

  return (
    <VStack align="stretch" gap={4}>
      <HStack gap={3} align="center" flexWrap="wrap">
        <Text asChild fontSize="sm" color="fg.muted">
          <label htmlFor="admin-status-filter">Status</label>
        </Text>
        <NativeSelect.Root size="sm" w="12rem" rounded="xl">
          <NativeSelect.Field
            id="admin-status-filter"
            value={status ?? ''}
            onChange={(event) => handleStatusChange(event.target.value)}
            bg="bg.glass"
            borderColor="border.glass"
          >
            <option value="">All statuses</option>
            {SUBMISSION_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </HStack>

      {errorMessage ? <FormAlert status="error" message={errorMessage} /> : null}

      {isPending ? (
        <Center py={16}>
          <Spinner size="xl" color="brand.fg" borderWidth="3px" />
        </Center>
      ) : isError ? (
        <GlassCard hoverable={false} role="alert">
          <Text fontWeight="semibold" color="red.300">
            {getApiErrorMessage(error, 'Could not load submissions.')}
          </Text>
          <GradientButton mt={4} variant="outline" onClick={() => void refetch()}>
            Try again
          </GradientButton>
        </GlassCard>
      ) : data.items.length === 0 ? (
        <GlassCard hoverable={false} textAlign="center" py={10}>
          <Text fontWeight="bold" fontSize="lg">
            No submissions
          </Text>
          <Text mt={1} color="fg.muted">
            Nothing matches this filter.
          </Text>
        </GlassCard>
      ) : (
        <>
          <GlassCard hoverable={false} p={0} overflow="hidden" opacity={isFetching ? 0.7 : 1}>
            <Table.ScrollArea>
              <Table.Root size="md" variant="line" aria-label="Submissions">
                <Table.Header>
                  <Table.Row bg="bg.surface">
                    <Table.ColumnHeader color="fg.subtle">Repository</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.subtle">Owner</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.subtle">Status</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.subtle">Score</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.subtle">Review</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.items.map((submission) => {
                    const repoLabel = `${submission.repo_owner}/${submission.repo_name}`
                    return (
                      <Table.Row key={submission.id} data-testid={`admin-submission-${submission.id}`}>
                        <Table.Cell>
                          <VStack align="flex-start" gap={0}>
                            <ChakraLink
                              asChild
                              fontWeight="semibold"
                              color="fg.default"
                              _hover={{ color: 'brand.fg', textDecoration: 'none' }}
                            >
                              <RouterLink to={`/submissions/${submission.id}`}>{repoLabel}</RouterLink>
                            </ChakraLink>
                            <Text fontSize="xs" color="fg.subtle">
                              {formatRelativeTime(submission.created_at)}
                            </Text>
                          </VStack>
                        </Table.Cell>
                        <Table.Cell color="fg.muted" fontSize="sm">
                          {submission.user_email}
                        </Table.Cell>
                        <Table.Cell>
                          <StatusBadge status={submission.status} />
                        </Table.Cell>
                        <Table.Cell>
                          {submission.review ? (
                            <ScoreBadge score={submission.review.score} />
                          ) : (
                            <Text fontSize="sm" color="fg.subtle">
                              --
                            </Text>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <RemoveReviewCell
                            submission={submission}
                            isConfirming={confirmingId === submission.id}
                            isDeleting={deleteReview.isPending && confirmingId === submission.id}
                            onStart={() => setConfirmingId(submission.id)}
                            onCancel={() => setConfirmingId(null)}
                            onConfirm={handleConfirm}
                          />
                        </Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table.Root>
            </Table.ScrollArea>
          </GlassCard>
          <TablePager
            offset={data.offset}
            limit={data.limit}
            total={data.total}
            isFetching={isFetching}
            onChange={setOffset}
          />
        </>
      )}
    </VStack>
  )
}
