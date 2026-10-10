import { Center, Link as ChakraLink, Spinner, Text, VStack } from '@chakra-ui/react'
import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'

import { FormAlert } from '../components/auth/FormAlert'
import { MeshBackground } from '../components/layout/MeshBackground'
import { PageWrapper } from '../components/layout/PageWrapper'
import { GlassCard } from '../components/ui/GlassCard'
import { useAuth } from '../hooks/useAuth'
import { exchangeGoogleCode, getApiErrorMessage } from '../services/auth'

export const MISSING_CODE_MESSAGE =
  'Google did not send us back a valid sign-in code. Please try signing in again.'

const EXCHANGE_FAILED_MESSAGE =
  'We could not complete your Google sign-in. The link may have expired; please try again.'

interface CallbackParams {
  code: string | null
  oauthError: string | null
}

/** Validation of the query string is pure, so derive it during render rather than in an effect. */
const getParamError = ({ code, oauthError }: CallbackParams): string | null => {
  if (oauthError) return `Google sign-in failed: ${oauthError}`
  if (!code) return MISSING_CODE_MESSAGE
  return null
}

/** Drop the query string from the address bar / history so the code is not kept around. */
const stripQueryString = (): void => {
  if (typeof window === 'undefined' || window.location.search === '') return
  window.history.replaceState(window.history.state, '', window.location.pathname)
}

/**
 * Landing page for the Google OAuth redirect. The backend sends a short-lived,
 * single-use `code` (never tokens) in the query string; this page exchanges it
 * for a token pair via `POST /auth/google/exchange`, stores the tokens, loads
 * the user and forwards to the dashboard.
 */
export const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setTokens } = useAuth()
  const [sessionError, setSessionError] = useState<string | null>(null)
  const handled = useRef(false)

  // Capture the params once: the query string is stripped right after mount.
  const [params] = useState<CallbackParams>(() => ({
    code: searchParams.get('code'),
    oauthError: searchParams.get('error'),
  }))
  const paramError = getParamError(params)
  const { code } = params

  useEffect(() => {
    stripQueryString()
  }, [])

  useEffect(() => {
    if (paramError !== null || !code || handled.current) return
    handled.current = true

    exchangeGoogleCode(code)
      .then((tokens) => setTokens(tokens))
      .then(() => navigate('/dashboard', { replace: true }))
      .catch((caught: unknown) => {
        setSessionError(getApiErrorMessage(caught, EXCHANGE_FAILED_MESSAGE))
      })
  }, [paramError, code, setTokens, navigate])

  const error = paramError ?? sessionError

  return (
    <>
      <MeshBackground />
      <PageWrapper centered maxW="md">
        <GlassCard hoverable={false}>
          {error ? (
            <VStack align="stretch" gap={4}>
              <FormAlert status="error" title="Sign-in failed" message={error} />
              <ChakraLink asChild color="brand.fg" fontWeight="semibold" alignSelf="center">
                <RouterLink to="/login">Back to login</RouterLink>
              </ChakraLink>
            </VStack>
          ) : (
            <Center py={6}>
              <VStack gap={3}>
                <Spinner size="lg" color="brand.400" borderWidth="3px" />
                <Text color="fg.muted">Finishing your Google sign-in...</Text>
              </VStack>
            </Center>
          )}
        </GlassCard>
      </PageWrapper>
    </>
  )
}
