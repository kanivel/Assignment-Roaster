import { HStack, Link as ChakraLink, Separator, Stack, Text } from '@chakra-ui/react'
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { GoogleLoginButton } from '../components/auth/GoogleLoginButton'
import { LoginForm } from '../components/auth/LoginForm'
import { resolveRedirect } from '../components/auth/resolveRedirect'
import { useAuth } from '../hooks/useAuth'
import { AuthPageShell } from './AuthPageShell'

export const LoginPage = () => {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const redirectTo = resolveRedirect(location.state)

  if (!isLoading && user !== null) {
    return <Navigate to={redirectTo} replace />
  }

  return (
    <AuthPageShell
      title="Login to roast"
      subtitle="Sign in with email and password or Google to get your code grilled."
      footer={
        <>
          New here?{' '}
          <ChakraLink asChild color="brand.fg" fontWeight="semibold" _hover={{ textDecoration: 'underline' }}>
            <RouterLink to="/register" state={location.state}>
              Create an account
            </RouterLink>
          </ChakraLink>
        </>
      }
    >
      <Stack gap={5}>
        <LoginForm onSuccess={() => navigate(redirectTo, { replace: true })} />
        <HStack gap={3}>
          <Separator flex="1" borderColor="border.glass" />
          <Text fontSize="xs" color="fg.subtle" textTransform="uppercase" letterSpacing="wider">
            or
          </Text>
          <Separator flex="1" borderColor="border.glass" />
        </HStack>
        <GoogleLoginButton />
      </Stack>
    </AuthPageShell>
  )
}
