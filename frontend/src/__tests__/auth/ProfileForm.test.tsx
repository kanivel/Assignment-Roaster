import { fireEvent, screen, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileForm } from '../../components/auth/ProfileForm'
import * as authService from '../../services/auth'
import { renderWithProviders } from '../test-utils'
import { mockUser } from './fixtures'

vi.mock('../../services/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/auth')>()
  return { ...actual, updateMe: vi.fn(), getMe: vi.fn() }
})

const updateMeMock = vi.mocked(authService.updateMe)

const nameInput = (): HTMLInputElement => screen.getByLabelText(/full name/i) as HTMLInputElement
const avatarInput = (): HTMLInputElement => screen.getByLabelText(/avatar url/i) as HTMLInputElement
const saveButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
const submit = (): void => {
  fireEvent.submit(screen.getByRole('form', { name: /profile form/i }))
}

describe('ProfileForm', () => {
  beforeEach(() => {
    updateMeMock.mockReset()
  })

  it('pre-fills the fields and disables save until something changes', () => {
    renderWithProviders(<ProfileForm user={mockUser} />)

    expect(nameInput().value).toBe('Ada Lovelace')
    expect(avatarInput().value).toBe('')
    expect(saveButton()).toBeDisabled()

    fireEvent.change(nameInput(), { target: { value: 'Ada L.' } })
    expect(saveButton()).toBeEnabled()

    fireEvent.change(nameInput(), { target: { value: 'Ada Lovelace' } })
    expect(saveButton()).toBeDisabled()
  })

  it('requires a name and rejects a non-http avatar URL', async () => {
    renderWithProviders(<ProfileForm user={mockUser} />)

    fireEvent.change(nameInput(), { target: { value: ' ' } })
    fireEvent.change(avatarInput(), { target: { value: 'ftp://example.com/me.png' } })
    submit()

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(screen.getByText(/must start with http/i)).toBeInTheDocument()
    expect(updateMeMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed avatar URL', async () => {
    renderWithProviders(<ProfileForm user={mockUser} />)

    fireEvent.change(avatarInput(), { target: { value: 'not a url' } })
    submit()

    expect(await screen.findByText(/enter a valid url/i)).toBeInTheDocument()
    expect(updateMeMock).not.toHaveBeenCalled()
  })

  it('saves trimmed values, sends null for an empty avatar and shows confirmation', async () => {
    updateMeMock.mockResolvedValue({ ...mockUser, full_name: 'Grace Hopper' })
    renderWithProviders(<ProfileForm user={mockUser} />)

    fireEvent.change(nameInput(), { target: { value: '  Grace Hopper  ' } })
    submit()

    await waitFor(() =>
      expect(updateMeMock).toHaveBeenCalledWith({ full_name: 'Grace Hopper', avatar_url: null }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/profile saved/i)
  })

  it('sends the avatar URL when provided', async () => {
    updateMeMock.mockResolvedValue({ ...mockUser, avatar_url: 'https://img.example.com/me.png' })
    renderWithProviders(<ProfileForm user={mockUser} />)

    fireEvent.change(avatarInput(), { target: { value: 'https://img.example.com/me.png' } })
    submit()

    await waitFor(() =>
      expect(updateMeMock).toHaveBeenCalledWith({
        full_name: 'Ada Lovelace',
        avatar_url: 'https://img.example.com/me.png',
      }),
    )
  })

  it('shows the backend error detail when saving fails', async () => {
    const headers = new AxiosHeaders()
    updateMeMock.mockRejectedValue(
      new AxiosError('Request failed', '422', { headers }, null, {
        status: 422,
        statusText: 'Unprocessable',
        headers,
        config: { headers },
        data: { detail: 'Name is too long', code: 'VALIDATION' },
      }),
    )
    renderWithProviders(<ProfileForm user={mockUser} />)

    fireEvent.change(nameInput(), { target: { value: 'Ada L.' } })
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is too long/i)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
