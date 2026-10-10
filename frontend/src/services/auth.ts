import axios from 'axios'

import type {
  AuthTokens,
  GoogleCodeExchangeRequest,
  LoginRequest,
  LogoutRequest,
  RegisterRequest,
  UpdateProfileRequest,
  User,
} from '../types/auth'
import api, { API_BASE_URL } from './api'

export { getApiErrorMessage } from '../lib/apiError'

export const register = async (payload: RegisterRequest): Promise<AuthTokens> => {
  const { data } = await api.post<AuthTokens>('/auth/register', payload)
  return data
}

export const login = async (payload: LoginRequest): Promise<AuthTokens> => {
  const { data } = await api.post<AuthTokens>('/auth/login', payload)
  return data
}

export const logout = async (refreshToken: string): Promise<void> => {
  const body: LogoutRequest = { refresh_token: refreshToken }
  await api.post<void>('/auth/logout', body)
}

export const getMe = async (): Promise<User> => {
  const { data } = await api.get<User>('/auth/me')
  return data
}

export const updateMe = async (payload: UpdateProfileRequest): Promise<User> => {
  const { data } = await api.put<User>('/auth/me', payload)
  return data
}

/** Absolute URL that starts the Google OAuth flow (a full browser navigation, not XHR). */
export const getGoogleLoginUrl = (): string => `${API_BASE_URL}/auth/google`

/**
 * Exchange the single-use login code from the Google callback for a token pair.
 * Uses a bare axios call: the request is unauthenticated, and the shared instance's
 * 401 interceptor would otherwise treat an invalid/expired code as a dead session
 * and bounce the browser to /login before the error could be shown.
 */
export const exchangeGoogleCode = async (code: string): Promise<AuthTokens> => {
  const body: GoogleCodeExchangeRequest = { code }
  const { data } = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/google/exchange`, body)
  return data
}
