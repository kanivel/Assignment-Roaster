import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RegisterForm } from '../../components/auth/RegisterForm'
import * as authService from '../../services/auth'
import { renderWithProviders } from '../test-utils'
import { mockTokens, mockUser } from './fixtures'

vi.mock('../../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/auth')>()
  return { ...actual, register: vi.fn(), getMe: vi.fn() }
})

const registerMock = vi.mocked(authService.register)
const getMeMock = vi.mocked(authService.getMe)

interface RegisterInput {
  fullName: string
  email: string
  password: string
  confirm: string
}

const fillAndSubmit = ({ fullName, email, password, confirm }: RegisterInput): void => {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: fullName } })
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirm } })
  fireEvent.submit(screen.getByRole('form', { name: /register form/i }))
}

describe('RegisterForm', () => {
  beforeEach(() => {
    registerMock.mockReset()
    getMeMock.mockReset()
  })

  it('requires a password of at least 8 characters', async () => {
    renderWithProviders(<RegisterForm />)
    fillAndSubmit({ fullName: 'Ada', email: 'ada@example.com', password: 'short', confirm: 'short' })

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('requires the confirmation to match', async () => {
    renderWithProviders(<RegisterForm />)
    fillAndSubmit({
      fullName: 'Ada',
      email: 'ada@example.com',
      password: 'password123',
      confirm: 'password124',
    })

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('registers, stores tokens and calls onSuccess', async () => {
    registerMock.mockResolvedValue(mockTokens)
    getMeMock.mockResolvedValue(mockUser)
    const onSuccess = vi.fn()

    renderWithProviders(<RegisterForm onSuccess={onSuccess} />)
    fillAndSubmit({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      confirm: 'password123',
    })

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(registerMock).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'password123',
      full_name: 'Ada Lovelace',
    })
    expect(window.localStorage.getItem('access_token')).toBe(mockTokens.access_token)
  })
})
