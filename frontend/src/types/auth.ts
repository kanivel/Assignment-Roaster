export interface User {
  id: number
  email: string
  full_name: string | null
  avatar_url: string | null
  is_active: boolean
  is_verified: boolean
  is_admin: boolean
  oauth_provider: 'google' | null
  created_at: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
}

/** The pair of tokens the app persists; `token_type` is always `bearer`. */
export type TokenPair = Pick<AuthTokens, 'access_token' | 'refresh_token'>

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  full_name: string
}

export interface RefreshRequest {
  refresh_token: string
}

export interface LogoutRequest {
  refresh_token: string
}

/** Body of `POST /auth/google/exchange`: the single-use code from the OAuth callback URL. */
export interface GoogleCodeExchangeRequest {
  code: string
}

export interface UpdateProfileRequest {
  full_name?: string
  avatar_url?: string | null
}

/** Error body returned by the backend: `{ detail, code }`. */
export interface ApiErrorResponse {
  detail: string
  code?: string
}
