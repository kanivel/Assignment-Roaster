import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

import { clearTokens, getAccessToken, getRefreshToken, storeTokens } from '../lib/tokens'
import type { AuthTokens } from '../types'

export const API_BASE_URL = `${import.meta.env.VITE_API_URL}/api/v1`

const REFRESH_PATH = '/auth/refresh'
const LOGIN_ROUTE = '/login'

/** Request config extended with a one-shot retry marker used by the refresh flow. */
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

const redirectToLogin = (): void => {
  clearTokens()
  if (typeof window !== 'undefined' && window.location.pathname !== LOGIN_ROUTE) {
    window.location.assign(LOGIN_ROUTE)
  }
}

/**
 * Exchange the stored refresh token for a new token pair.
 * Uses a bare axios call so this request never re-enters the interceptors.
 */
const refreshTokens = async (refreshToken: string): Promise<AuthTokens> => {
  const { data } = await axios.post<AuthTokens>(`${API_BASE_URL}${REFRESH_PATH}`, {
    refresh_token: refreshToken,
  })
  return data
}

/** Share a single in-flight refresh between concurrent 401 responses. */
let pendingRefresh: Promise<AuthTokens> | null = null

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined
    const status = error.response?.status

    const isRefreshCall = originalRequest?.url?.endsWith(REFRESH_PATH) ?? false

    if (status !== 401 || !originalRequest || originalRequest._retry || isRefreshCall) {
      return Promise.reject(error)
    }

    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      redirectToLogin()
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      pendingRefresh ??= refreshTokens(refreshToken).finally(() => {
        pendingRefresh = null
      })
      const tokens = await pendingRefresh
      storeTokens(tokens)
      originalRequest.headers.set('Authorization', `Bearer ${tokens.access_token}`)
      return api(originalRequest)
    } catch (refreshError) {
      redirectToLogin()
      return Promise.reject(refreshError instanceof Error ? refreshError : error)
    }
  },
)

export default api
