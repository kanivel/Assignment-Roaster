import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POLL_INTERVAL_MS } from '../../hooks/useSubmissionPolling'
import { SubmissionDetailPage } from '../../pages/SubmissionDetailPage'
import * as submissionsService from '../../services/submissions'
import { renderWithProviders } from '../test-utils'
import { makeSubmission } from './fixtures'

vi.mock('../../services/submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submissions')>()
  return {
    ...actual,
    getSubmission: vi.fn(),
    deleteSubmission: vi.fn(),
    retrySubmission: vi.fn(),
  }
})

const getMock = vi.mocked(submissionsService.getSubmission)
const deleteMock = vi.mocked(submissionsService.deleteSubmission)
const retryMock = vi.mocked(submissionsService.retrySubmission)

const renderDetail = (route = '/submissions/1') =>
  renderWithProviders(
    <Routes>
      <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
      <Route path="/submissions" element={<h1>My submissions stub</h1>} />
    </Routes>,
    { route },
  )

describe('SubmissionDetailPage', () => {
  beforeEach(() => {
    getMock.mockReset()
    deleteMock.mockReset()
    retryMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the roasting-in-progress state while the review is pending', async () => {
    getMock.mockResolvedValue(makeSubmission({ status: 'pending', review: null }))

    renderDetail()

    expect(await screen.findByText(/roasting in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/queued/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /octocat\/\s*hello-world/i })).toBeInTheDocument()
    expect(screen.queryByTestId('roast-text')).not.toBeInTheDocument()
    expect(getMock).toHaveBeenCalledWith(1)
  })

  it('shows "reading your code" while reviewing', async () => {
    getMock.mockResolvedValue(makeSubmission({ status: 'reviewing', review: null }))

    renderDetail()

    expect(await screen.findByText(/roasting in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/reading your code/i)).toBeInTheDocument()
  })

  it('polls while pending and renders the roast once the review is done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getMock
      .mockResolvedValueOnce(makeSubmission({ status: 'pending', review: null }))
      .mockResolvedValue(makeSubmission({ status: 'done' }))

    renderDetail()

    expect(await screen.findByText(/roasting in progress/i)).toBeInTheDocument()
    expect(getMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 100)
    })

    expect(await screen.findByTestId('roast-text')).toHaveTextContent('README-la onnume illa.')
    expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/roasting in progress/i)).not.toBeInTheDocument()
  })

  it('renders the roast, score and repo header when done', async () => {
    getMock.mockResolvedValue(makeSubmission())

    renderDetail()

    expect(await screen.findByTestId('roast-text')).toHaveTextContent('README-la onnume illa.')
    expect(screen.getByLabelText('Score 8 out of 10')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Solid work, da.' })).toBeInTheDocument()
    expect(screen.getByText('Clean structure')).toBeInTheDocument()
    expect(screen.getByText('Add tests')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open on github/i })).toHaveAttribute(
      'href',
      'https://github.com/octocat/hello-world',
    )
    expect(screen.getByRole('link', { name: /my submissions/i })).toHaveAttribute('href', '/submissions')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('asks for confirmation, deletes and navigates back to the list', async () => {
    getMock.mockResolvedValue(makeSubmission())
    deleteMock.mockResolvedValue(undefined)

    renderDetail()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/sure\?/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByRole('heading', { name: /my submissions stub/i })).toBeInTheDocument()
    expect(deleteMock).toHaveBeenCalledWith(1)
  })

  it('cancel keeps the submission and hides the confirmation', async () => {
    getMock.mockResolvedValue(makeSubmission())

    renderDetail()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByText(/sure\?/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('shows an error and stays on the page when deletion fails', async () => {
    getMock.mockResolvedValue(makeSubmission())
    deleteMock.mockRejectedValue(new Error('Could not delete this submission.'))

    renderDetail()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not delete/i)
    expect(screen.getByTestId('roast-text')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /my submissions stub/i })).not.toBeInTheDocument()
  })

  it('shows the failure reason and re-enqueues on retry', async () => {
    getMock.mockResolvedValue(
      makeSubmission({ status: 'failed', review: null, error_message: 'Review declined by safety filter' }),
    )
    retryMock.mockResolvedValue(makeSubmission({ status: 'pending', review: null, error_message: null }))

    renderDetail()

    expect(await screen.findByRole('alert')).toHaveTextContent(/review declined by safety filter/i)
    fireEvent.click(screen.getByRole('button', { name: /retry roast/i }))

    await waitFor(() => expect(retryMock).toHaveBeenCalledWith(1))
    expect(await screen.findByText(/roasting in progress/i)).toBeInTheDocument()
  })

  it('shows a not-found card for a malformed id without calling the API', () => {
    renderDetail('/submissions/not-a-number')

    expect(screen.getByRole('alert')).toHaveTextContent(/submission not found/i)
    expect(screen.getByText(/does not look like a submission/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to my submissions/i })).toHaveAttribute('href', '/submissions')
    expect(getMock).not.toHaveBeenCalled()
  })

  it('shows the API error when the submission cannot be loaded', async () => {
    getMock.mockRejectedValue(new Error('Submission not found.'))

    renderDetail('/submissions/99')

    expect(await screen.findByRole('alert')).toHaveTextContent(/submission not found/i)
    expect(getMock).toHaveBeenCalledWith(99)
  })
})
