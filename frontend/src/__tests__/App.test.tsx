import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import * as authService from '../services/auth'
import { mockUser } from './auth/fixtures'
import { renderWithProviders } from './test-utils'

vi.mock('../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/auth')>()
  return { ...actual, getMe: vi.fn() }
})

const getMeMock = vi.mocked(authService.getMe)

describe('App routing', () => {
  beforeEach(() => {
    getMeMock.mockReset()
  })

  it('renders the home page at /', () => {
    renderWithProviders(<App />, { route: '/' })
    expect(screen.getByRole('link', { name: /assignment roaster/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /roast my repo/i })).toBeInTheDocument()
  })

  it('redirects unauthenticated users from protected routes to /login', () => {
    renderWithProviders(<App />, { route: '/submissions' })
    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument()
  })

  it('restores the session from a stored access token', async () => {
    getMeMock.mockResolvedValue(mockUser)
    window.localStorage.setItem('access_token', 'token')
    window.localStorage.setItem('refresh_token', 'refresh')

    renderWithProviders(<App />, { route: '/dashboard' })

    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    expect(getMeMock).toHaveBeenCalled()
  })

  it('clears the session and redirects to /login when the stored token is rejected', async () => {
    getMeMock.mockRejectedValue(new Error('unauthorized'))
    window.localStorage.setItem('access_token', 'stale')
    window.localStorage.setItem('refresh_token', 'stale')

    renderWithProviders(<App />, { route: '/dashboard' })

    expect(await screen.findByRole('heading', { name: /login/i })).toBeInTheDocument()
    expect(window.localStorage.getItem('access_token')).toBeNull()
  })

  it('lazy-loads the forgot-password route', async () => {
    renderWithProviders(<App />, { route: '/forgot-password' })
    expect(await screen.findByRole('heading', { name: /forgot password/i })).toBeInTheDocument()
  })

  it('lazy-loads the OAuth callback route', async () => {
    renderWithProviders(<App />, { route: '/auth/callback' })
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign-in code/i)
  })

  it('renders the not-found page for unknown routes', () => {
    renderWithProviders(<App />, { route: '/nope' })
    expect(screen.getByRole('heading', { name: /404/i })).toBeInTheDocument()
  })
})
