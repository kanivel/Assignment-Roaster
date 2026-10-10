interface LocationState {
  from?: { pathname?: string }
}

export const DEFAULT_AUTH_REDIRECT = '/dashboard'

/** Where to send the user after login: `state.from` (set by ProtectedRoute) or the dashboard. */
export const resolveRedirect = (state: unknown): string => {
  const from = (state as LocationState | null)?.from?.pathname
  return typeof from === 'string' && from !== '' ? from : DEFAULT_AUTH_REDIRECT
}
