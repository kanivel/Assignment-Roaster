import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { clearTokens, getAccessToken, getRefreshToken, storeTokens } from '../lib/tokens'
import * as authService from '../services/auth'
import type { LoginRequest, RegisterRequest, TokenPair, UpdateProfileRequest, User } from '../types/auth'
import { AuthContext, type AuthContextValue } from './auth-context'

export interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [hasTokens, setHasTokens] = useState<boolean>(() => getAccessToken() !== null)
  // Loading only while a stored token is being exchanged for the user on mount.
  const [isLoading, setIsLoading] = useState<boolean>(() => getAccessToken() !== null)

  const clearSession = useCallback((): void => {
    clearTokens()
    setHasTokens(false)
    setUser(null)
  }, [])

  // Restore the session from a stored access token.
  useEffect(() => {
    // No stored token: `isLoading` was initialised to false, nothing to restore.
    if (getAccessToken() === null) return

    let cancelled = false
    authService
      .getMe()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => {
        if (!cancelled) clearSession()
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [clearSession])

  /** Store tokens, then load the user. On failure the stored tokens are discarded. */
  const establishSession = useCallback(
    async (tokens: TokenPair): Promise<void> => {
      storeTokens(tokens)
      setHasTokens(true)
      try {
        const me = await authService.getMe()
        setUser(me)
      } catch (error) {
        clearSession()
        throw error
      }
    },
    [clearSession],
  )

  const login = useCallback(
    async (credentials: LoginRequest): Promise<void> => {
      const tokens = await authService.login(credentials)
      await establishSession(tokens)
    },
    [establishSession],
  )

  const register = useCallback(
    async (payload: RegisterRequest): Promise<void> => {
      const tokens = await authService.register(payload)
      await establishSession(tokens)
    },
    [establishSession],
  )

  const setTokens = useCallback(
    async (tokens: TokenPair): Promise<void> => {
      await establishSession(tokens)
    },
    [establishSession],
  )

  const logout = useCallback((): void => {
    const refreshToken = getRefreshToken()
    clearSession()
    if (refreshToken) {
      // Best effort revoke; the local session is already gone.
      authService.logout(refreshToken).catch(() => undefined)
    }
  }, [clearSession])

  const updateProfile = useCallback(async (payload: UpdateProfileRequest): Promise<void> => {
    const me = await authService.updateMe(payload)
    setUser(me)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null || hasTokens,
      isLoading,
      login,
      register,
      logout,
      setTokens,
      updateProfile,
    }),
    [user, hasTokens, isLoading, login, register, logout, setTokens, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
