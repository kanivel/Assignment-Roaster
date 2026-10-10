import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SubmissionList } from '../../components/submissions/SubmissionList'
import * as submissionsService from '../../services/submissions'
import type { Paginated, Submission } from '../../types'
import { renderWithProviders } from '../test-utils'
import { makeSubmission } from './fixtures'

vi.mock('../../services/submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submissions')>()
  return { ...actual, listSubmissions: vi.fn() }
})

const listMock = vi.mocked(submissionsService.listSubmissions)

const page = (items: Submission[], total: number, offset = 0, limit = 20): Paginated<Submission> => ({
  items,
  total,
  limit,
  offset,
})

const renderList = (pageSize?: number) =>
  renderWithProviders(
    <Routes>
      <Route path="/" element={<SubmissionList pageSize={pageSize} />} />
      <Route path="/submit" element={<h1>Submit stub</h1>} />
    </Routes>,
    { route: '/' },
  )

describe('SubmissionList', () => {
  beforeEach(() => {
    listMock.mockReset()
  })

  it('shows the empty state with a CTA that navigates to /submit', async () => {
    listMock.mockResolvedValue(page([], 0))

    renderList()

    expect(await screen.findByText(/no roasts yet/i)).toBeInTheDocument()
    expect(screen.getByText(/submit your first repo/i)).toBeInTheDocument()
    expect(listMock).toHaveBeenCalledWith({ limit: 20, offset: 0 })

    fireEvent.click(screen.getByRole('button', { name: /submit a repo/i }))
    expect(await screen.findByRole('heading', { name: /submit stub/i })).toBeInTheDocument()
  })

  it('renders a card per submission with status, score and detail links', async () => {
    listMock.mockResolvedValue(
      page(
        [
          makeSubmission({ id: 7 }),
          makeSubmission({ id: 8, repo_name: 'pending-repo', status: 'pending', review: null }),
        ],
        2,
      ),
    )

    renderList()

    expect(await screen.findByTestId('submission-card-7')).toBeInTheDocument()
    expect(screen.getByTestId('submission-card-8')).toBeInTheDocument()
    expect(screen.getByText(/showing 2 of 2/i)).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'octocat/hello-world' })).toHaveAttribute('href', '/submissions/7')
    expect(screen.getByRole('link', { name: /view roast for octocat\/pending-repo/i })).toHaveAttribute(
      'href',
      '/submissions/8',
    )
    expect(screen.getByLabelText('Score 8 out of 10')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/score \d+ out of 10/i)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  })

  it('loads the next page with the correct offset', async () => {
    listMock
      .mockResolvedValueOnce(page([makeSubmission({ id: 1 }), makeSubmission({ id: 2 })], 3, 0, 2))
      .mockResolvedValueOnce(page([makeSubmission({ id: 3 })], 3, 2, 2))

    renderList(2)

    expect(await screen.findByText(/showing 2 of 3/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /load more/i }))

    expect(await screen.findByTestId('submission-card-3')).toBeInTheDocument()
    expect(screen.getByText(/showing 3 of 3/i)).toBeInTheDocument()
    expect(listMock).toHaveBeenLastCalledWith({ limit: 2, offset: 2 })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument(),
    )
  })

  it('shows the error with a retry that refetches', async () => {
    listMock
      .mockRejectedValueOnce(new Error('Could not load your submissions.'))
      .mockResolvedValueOnce(page([makeSubmission({ id: 5 })], 1))

    renderList()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your submissions/i)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('submission-card-5')).toBeInTheDocument()
    expect(listMock).toHaveBeenCalledTimes(2)
  })
})
