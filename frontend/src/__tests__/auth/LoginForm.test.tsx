import { fireEvent, screen, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginForm } from '../../components/auth/LoginForm'
import * as authService from '../../services/auth'
import { renderWithProviders } from '../test-utils'
import { mockTokens, mockUser } from './fixtures'

vi.mock('../../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/auth')>()
  return { ...actual, login: vi.fn(), getMe: vi.fn() }
})

const loginMock = vi.mocked(authService.login)
const getMeMock = vi.mocked(authService.getMe)

const fillAndSubmit = (email: string, password: string): void => {
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } })
  fireEvent.submit(screen.getByRole('form', { name: /login form/i }))
}

describe('LoginForm', () => {
  beforeEach(() => {
    loginMock.mockReset()
    getMeMock.mockReset()
  })

  it('shows validation errors and does not call the API when fields are empty', async () => {
    renderWithProviders(<LoginForm />)
    fireEvent.submit(screen.getByRole('form', { name: /login form/i }))

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument()
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed email', async () => {
    renderWithProviders(<LoginForm />)
    fillAndSubmit('not-an-email', 'password123')

    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('submits credentials, stores tokens and calls onSuccess', async () => {
    loginMock.mockResolvedValue(mockTokens)
    getMeMock.mockResolvedValue(mockUser)
    const onSuccess = vi.fn()

    renderWithProviders(<LoginForm onSuccess={onSuccess} />)
    fillAndSubmit('ada@example.com', 'password123')

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(loginMock).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'password123' })
    expect(getMeMock).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem('access_token')).toBe(mockTokens.access_token)
    expect(window.localStorage.getItem('refresh_token')).toBe(mockTokens.refresh_token)
  })

  it('shows the API error detail when login fails', async () => {
    const headers = new AxiosHeaders()
    loginMock.mockRejectedValue(
      new AxiosError('Request failed', '401', { headers }, null, {
        status: 401,
        statusText: 'Unauthorized',
        headers,
        config: { headers },
        data: { detail: 'Invalid email or password', code: 'invalid_credentials' },
      }),
    )
    const onSuccess = vi.fn()

    renderWithProviders(<LoginForm onSuccess={onSuccess} />)
    fillAndSubmit('ada@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('access_token')).toBeNull()
  })
})
