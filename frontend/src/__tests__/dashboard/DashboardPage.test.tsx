import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardPage } from '../../pages/DashboardPage'
import * as dashboardService from '../../services/dashboard'
import type { DashboardStats } from '../../types/dashboard'
import { makeSubmission } from '../submissions/fixtures'
import { renderWithProviders } from '../test-utils'

vi.mock('../../services/dashboard', () => ({
  getDashboardStats: vi.fn(),
}))

const mockedStats = vi.mocked(dashboardService.getDashboardStats)

const makeStats = (overrides: Partial<DashboardStats> = {}): DashboardStats => ({
  total_submissions: 5,
  done_count: 3,
  failed_count: 1,
  pending_count: 1,
  average_score: 7.25,
  best_score: 9,
  latest_submission: makeSubmission({ id: 7 }),
  ...overrides,
})

describe('DashboardPage', () => {
  beforeEach(() => {
    mockedStats.mockReset()
  })

  it('renders the four stat cards and the latest roast', async () => {
    mockedStats.mockResolvedValue(makeStats())
    renderWithProviders(<DashboardPage />)

    const total = await screen.findByTestId('stat-card-total-roasts')
    expect(within(total).getByText('5')).toBeInTheDocument()
    expect(within(total).getByText(/1 roast in progress/i)).toBeInTheDocument()

    expect(within(screen.getByTestId('stat-card-average-score')).getByText('7.3')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('stat-card-best-score')).getByLabelText('Score 9 out of 10'),
    ).toBeInTheDocument()
    expect(within(screen.getByTestId('stat-card-failed')).getByText('1')).toBeInTheDocument()

    const latest = screen.getByTestId('latest-roast-card')
    expect(within(latest).getByText('Solid work, da.')).toBeInTheDocument()
    expect(within(latest).getByLabelText('Score 8 out of 10')).toBeInTheDocument()
    expect(within(latest).getByRole('link', { name: /view roast for octocat\/hello-world/i })).toHaveAttribute(
      'href',
      '/submissions/7',
    )
    expect(screen.getByRole('button', { name: /roast another repo/i })).toBeInTheDocument()
  })

  it('shows the status instead of a score when the latest roast is not done', async () => {
    mockedStats.mockResolvedValue(
      makeStats({
        best_score: null,
        average_score: null,
        latest_submission: makeSubmission({ id: 8, status: 'reviewing', review: null }),
      }),
    )
    renderWithProviders(<DashboardPage />)

    const latest = await screen.findByTestId('latest-roast-card')
    expect(within(latest).getByText(/roasting in progress/i)).toBeInTheDocument()
    expect(within(latest).queryByLabelText(/score .* out of 10/i)).not.toBeInTheDocument()
    expect(within(screen.getByTestId('stat-card-best-score')).getByText('--')).toBeInTheDocument()
  })

  it('shows the first-time CTA for users with no submissions', async () => {
    mockedStats.mockResolvedValue(
      makeStats({
        total_submissions: 0,
        done_count: 0,
        failed_count: 0,
        pending_count: 0,
        average_score: null,
        best_score: null,
        latest_submission: null,
      }),
    )
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText(/no roasts yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit a repo/i })).toBeInTheDocument()
    expect(screen.queryByTestId('stat-card-total-roasts')).not.toBeInTheDocument()
  })

  it('shows an error with a retry button when stats fail to load', async () => {
    mockedStats.mockRejectedValue(new Error('Server exploded'))
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded')
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
