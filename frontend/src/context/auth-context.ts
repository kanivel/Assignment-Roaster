import { createContext } from 'react'

import type { LoginRequest, RegisterRequest, TokenPair, UpdateProfileRequest, User } from '../types/auth'

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  /** True while the session is being restored from a stored token on mount. */
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  register: (payload: RegisterRequest) => Promise<void>
  /** Clears the session immediately; the server-side revoke runs in the background. */
  logout: () => void
  /** Persist a token pair (e.g. from the OAuth callback) and load the current user. */
  setTokens: (tokens: TokenPair) => Promise<void>
  updateProfile: (payload: UpdateProfileRequest) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
