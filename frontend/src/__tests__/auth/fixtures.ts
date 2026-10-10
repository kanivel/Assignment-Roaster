import type { AuthTokens, User } from '../../types/auth'

export const mockUser: User = {
  id: 1,
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  avatar_url: null,
  is_active: true,
  is_verified: true,
  is_admin: false,
  oauth_provider: null,
  created_at: '2026-01-01T00:00:00Z',
}

export const mockTokens: AuthTokens = {
  access_token: 'access-123',
  refresh_token: 'refresh-456',
  token_type: 'bearer',
}
