import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserTable } from '../../components/admin/UserTable'
import type { AuthContextValue } from '../../context/auth-context'
import * as adminService from '../../services/admin'
import { mockUser } from '../auth/fixtures'
import { renderWithProviders } from '../test-utils'
import { makeAdminUser } from './fixtures'

const adminSelf = { ...mockUser, is_admin: true }

const authValue: AuthContextValue = {
  user: adminSelf,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  setTokens: vi.fn(),
  updateProfile: vi.fn(),
}

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authValue,
}))

vi.mock('../../services/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/admin')>()
  return { ...actual, listAdminUsers: vi.fn(), updateAdminUser: vi.fn() }
})

const mockedList = vi.mocked(adminService.listAdminUsers)
const mockedUpdate = vi.mocked(adminService.updateAdminUser)

const self = makeAdminUser({ ...adminSelf })
const other = makeAdminUser({
  id: 2,
  email: 'grace@example.com',
  full_name: 'Grace Hopper',
  is_admin: false,
  is_active: true,
})

const getSwitch = (rowId: number, label: RegExp): HTMLInputElement =>
  within(screen.getByTestId(`user-row-${rowId}`)).getByRole('checkbox', { name: label }) as HTMLInputElement

const make400 = (detail: string): AxiosError => {
  const config = { headers: {} } as InternalAxiosRequestConfig
  const response = {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config,
    data: { detail },
  } as AxiosResponse
  return new AxiosError(detail, 'ERR_BAD_REQUEST', config, undefined, response)
}

describe('UserTable', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedUpdate.mockReset()
    mockedList.mockResolvedValue({ items: [self, other], total: 2, limit: 20, offset: 0 })
  })

  it('disables both toggles on the current user row and enables them for others', async () => {
    renderWithProviders(<UserTable />)

    await screen.findByTestId(`user-row-${self.id}`)

    expect(getSwitch(self.id, /active for ada@example.com/i)).toBeDisabled()
    expect(getSwitch(self.id, /admin for ada@example.com/i)).toBeDisabled()
    expect(within(screen.getByTestId(`user-row-${self.id}`)).getByText('(you)')).toBeInTheDocument()

    expect(getSwitch(other.id, /active for grace@example.com/i)).toBeEnabled()
    expect(getSwitch(other.id, /admin for grace@example.com/i)).toBeEnabled()
  })

  it('calls the update mutation when another user is toggled', async () => {
    mockedUpdate.mockResolvedValue({ ...other, is_admin: true })
    renderWithProviders(<UserTable />)

    await screen.findByTestId(`user-row-${other.id}`)
    fireEvent.click(getSwitch(other.id, /admin for grace@example.com/i))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith(other.id, { is_admin: true }))
  })

  it('shows the backend detail when the update is rejected', async () => {
    mockedUpdate.mockRejectedValue(make400('Admins cannot change their own flags'))
    renderWithProviders(<UserTable />)

    await screen.findByTestId(`user-row-${other.id}`)
    fireEvent.click(getSwitch(other.id, /active for grace@example.com/i))

    expect(await screen.findByRole('alert')).toHaveTextContent('Admins cannot change their own flags')
  })
})
