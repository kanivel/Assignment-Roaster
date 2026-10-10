import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LeaderboardTable } from '../../components/leaderboard/LeaderboardTable'
import type { AuthContextValue } from '../../context/auth-context'
import { mockUser } from '../auth/fixtures'
import { renderWithProviders } from '../test-utils'
import { makeEntry } from './fixtures'

const authState: { value: AuthContextValue } = {
  value: {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    setTokens: vi.fn(),
    updateProfile: vi.fn(),
  },
}

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState.value,
}))

const entries = [
  makeEntry({ rank: 1, user_id: 10, full_name: 'Grace Hopper', best_score: 10, average_score: 9.5 }),
  makeEntry({ rank: 2, user_id: 1, full_name: 'Ada Lovelace', best_score: 9, average_score: 8.25 }),
  makeEntry({ rank: 3, user_id: 11, full_name: 'Linus Torvalds', best_score: 8, average_score: 7 }),
  makeEntry({ rank: 4, user_id: 12, full_name: null, best_score: 6, average_score: 5.5 }),
]

describe('LeaderboardTable', () => {
  it('renders every rank with name, best score and average', () => {
    authState.value = { ...authState.value, user: null, isAuthenticated: false }
    renderWithProviders(<LeaderboardTable entries={entries} />)

    expect(screen.getByRole('table', { name: /leaderboard/i })).toBeInTheDocument()
    expect(screen.getAllByTestId(/^rank-row-/)).toHaveLength(4)

    const first = screen.getByTestId('rank-row-10')
    expect(within(first).getByLabelText(/gold medal/i)).toBeInTheDocument()
    expect(within(first).getByText('Grace Hopper')).toBeInTheDocument()
    expect(within(first).getByLabelText('Score 10 out of 10')).toBeInTheDocument()
    expect(within(first).getByText('9.5')).toBeInTheDocument()

    const fourth = screen.getByTestId('rank-row-12')
    expect(within(fourth).getByText('#4')).toBeInTheDocument()
    expect(within(fourth).getByText('Anonymous roastee')).toBeInTheDocument()

    expect(screen.queryByText('You')).not.toBeInTheDocument()
    expect(document.querySelector('[data-current-user="true"]')).toBeNull()
  })

  it('highlights only the signed-in user row', () => {
    authState.value = { ...authState.value, user: mockUser, isAuthenticated: true }
    renderWithProviders(<LeaderboardTable entries={entries} />)

    const mine = screen.getByTestId(`rank-row-${mockUser.id}`)
    expect(mine).toHaveAttribute('data-current-user', 'true')
    expect(within(mine).getByText('You')).toBeInTheDocument()

    expect(screen.getByTestId('rank-row-10')).not.toHaveAttribute('data-current-user')
    expect(screen.getAllByText('You')).toHaveLength(1)
  })

  it('shows an empty state when there are no entries', () => {
    renderWithProviders(<LeaderboardTable entries={[]} />)
    expect(screen.getByTestId('leaderboard-empty')).toHaveTextContent(/board is empty/i)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
