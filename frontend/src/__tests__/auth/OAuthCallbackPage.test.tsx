import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MISSING_CODE_MESSAGE, OAuthCallbackPage } from '../../pages/OAuthCallbackPage'
import * as authService from '../../services/auth'
import { renderWithProviders } from '../test-utils'
import { mockTokens, mockUser } from './fixtures'

vi.mock('../../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/auth')>()
  return { ...actual, getMe: vi.fn(), exchangeGoogleCode: vi.fn() }
})

const getMeMock = vi.mocked(authService.getMe)
const exchangeMock = vi.mocked(authService.exchangeGoogleCode)

const renderCallback = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route path="/dashboard" element={<h1>Dashboard stub</h1>} />
    </Routes>,
    { route },
  )

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    getMeMock.mockReset()
    exchangeMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exchanges the code for tokens, loads the user and redirects to /dashboard', async () => {
    exchangeMock.mockResolvedValue(mockTokens)
    getMeMock.mockResolvedValue(mockUser)

    renderCallback('/auth/callback?code=one-time-code')

    expect(await screen.findByRole('heading', { name: /dashboard stub/i })).toBeInTheDocument()
    expect(exchangeMock).toHaveBeenCalledWith('one-time-code')
    expect(window.localStorage.getItem('access_token')).toBe(mockTokens.access_token)
    expect(window.localStorage.getItem('refresh_token')).toBe(mockTokens.refresh_token)
    expect(getMeMock).toHaveBeenCalled()
  })

  it('strips the query string from the browser history on mount', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    window.history.pushState(null, '', '/auth/callback?code=one-time-code')
    exchangeMock.mockResolvedValue(mockTokens)
    getMeMock.mockResolvedValue(mockUser)

    renderCallback('/auth/callback?code=one-time-code')

    await waitFor(() => expect(replaceState).toHaveBeenCalled())
    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe('/auth/callback')
  })

  it('shows an error and a link back to login when the code is missing', async () => {
    renderCallback('/auth/callback')

    expect(await screen.findByRole('alert')).toHaveTextContent(MISSING_CODE_MESSAGE)
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/login')
    expect(exchangeMock).not.toHaveBeenCalled()
    expect(getMeMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('access_token')).toBeNull()
  })

  it('shows the provider error when Google reports one', async () => {
    renderCallback('/auth/callback?error=access_denied')

    expect(await screen.findByRole('alert')).toHaveTextContent(/google sign-in failed: access_denied/i)
    expect(exchangeMock).not.toHaveBeenCalled()
  })

  it('shows the backend error when the code is invalid, expired or already used', async () => {
    exchangeMock.mockRejectedValue(new Error('Login code is invalid or has expired'))

    renderCallback('/auth/callback?code=stale')

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i)
    expect(getMeMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('access_token')).toBeNull()
  })

  it('clears tokens and shows an error when loading the user fails', async () => {
    exchangeMock.mockResolvedValue(mockTokens)
    getMeMock.mockRejectedValue(new Error('boom'))

    renderCallback('/auth/callback?code=one-time-code')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem('access_token')).toBeNull())
  })
})
