import type { AuthTokens } from '../types'

export const ACCESS_TOKEN_KEY = 'access_token'
export const REFRESH_TOKEN_KEY = 'refresh_token'

const safeGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSet = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage may be unavailable (private mode, blocked site data); ignore.
  }
}

const safeRemove = (key: string): void => {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Storage may be unavailable; ignore.
  }
}

export const getAccessToken = (): string | null => safeGet(ACCESS_TOKEN_KEY)

export const getRefreshToken = (): string | null => safeGet(REFRESH_TOKEN_KEY)

export const storeTokens = (tokens: Pick<AuthTokens, 'access_token' | 'refresh_token'>): void => {
  safeSet(ACCESS_TOKEN_KEY, tokens.access_token)
  safeSet(REFRESH_TOKEN_KEY, tokens.refresh_token)
}

export const clearTokens = (): void => {
  safeRemove(ACCESS_TOKEN_KEY)
  safeRemove(REFRESH_TOKEN_KEY)
}
