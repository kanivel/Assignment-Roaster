import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { POLLING_TIMEOUT_HINT, ReviewPanel } from '../../components/review/ReviewPanel'
import { renderWithProviders } from '../test-utils'
import { makeReview, makeSubmission } from './fixtures'

describe('ReviewPanel', () => {
  it('renders the score, summary, roast text and lists when done', () => {
    renderWithProviders(<ReviewPanel submission={makeSubmission()} />)

    expect(screen.getByLabelText('Score 8 out of 10')).toHaveTextContent('8/10')
    expect(screen.getByRole('heading', { name: 'Solid work, da.' })).toBeInTheDocument()
    expect(screen.getByTestId('roast-text')).toHaveTextContent('README-la onnume illa.')
    expect(screen.getByText('Clean structure')).toBeInTheDocument()
    expect(screen.getByText('Add tests')).toBeInTheDocument()
    expect(screen.getByText(/roasted by claude-test/i)).toBeInTheDocument()
  })

  it('renders roast text as plain text (no HTML injection)', () => {
    const review = makeReview({ roast_text: '<b>bold</b> roast' })
    renderWithProviders(<ReviewPanel submission={makeSubmission({ review })} />)
    expect(screen.getByTestId('roast-text')).toHaveTextContent('<b>bold</b> roast')
    expect(screen.getByTestId('roast-text').querySelector('b')).toBeNull()
  })

  it('shows the error message and a retry button when failed', () => {
    const onRetry = vi.fn()
    renderWithProviders(
      <ReviewPanel
        submission={makeSubmission({
          status: 'failed',
          review: null,
          error_message: 'Repository not found or is private',
        })}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Repository not found or is private')
    fireEvent.click(screen.getByRole('button', { name: /retry roast/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the roasting-in-progress state while pending or reviewing', () => {
    renderWithProviders(
      <ReviewPanel submission={makeSubmission({ status: 'reviewing', review: null })} />,
    )
    expect(screen.getByText(/roasting in progress/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('shows a slow-review hint once polling has timed out', () => {
    renderWithProviders(
      <ReviewPanel
        submission={makeSubmission({ status: 'reviewing', review: null })}
        isPollingTimedOut
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(POLLING_TIMEOUT_HINT)
  })

  it('does not show the slow-review hint while polling is still within its window', () => {
    renderWithProviders(
      <ReviewPanel submission={makeSubmission({ status: 'reviewing', review: null })} />,
    )
    expect(screen.queryByText(POLLING_TIMEOUT_HINT)).not.toBeInTheDocument()
  })
})
