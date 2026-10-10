import { HStack, Link as ChakraLink, Separator, Stack, Text } from '@chakra-ui/react'
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { GoogleLoginButton } from '../components/auth/GoogleLoginButton'
import { RegisterForm } from '../components/auth/RegisterForm'
import { resolveRedirect } from '../components/auth/resolveRedirect'
import { useAuth } from '../hooks/useAuth'
import { AuthPageShell } from './AuthPageShell'

export const RegisterPage = () => {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const redirectTo = resolveRedirect(location.state)

  if (!isLoading && user !== null) {
    return <Navigate to={redirectTo} replace />
  }

  return (
    <AuthPageShell
      title="Create account"
      subtitle="Join the Social Eagle community and submit your first assignment."
      footer={
        <>
          Already have an account?{' '}
          <ChakraLink asChild color="brand.fg" fontWeight="semibold" _hover={{ textDecoration: 'underline' }}>
            <RouterLink to="/login" state={location.state}>
              Login
            </RouterLink>
          </ChakraLink>
        </>
      }
    >
      <Stack gap={5}>
        <RegisterForm onSuccess={() => navigate(redirectTo, { replace: true })} />
        <HStack gap={3}>
          <Separator flex="1" borderColor="border.glass" />
          <Text fontSize="xs" color="fg.subtle" textTransform="uppercase" letterSpacing="wider">
            or
          </Text>
          <Separator flex="1" borderColor="border.glass" />
        </HStack>
        <GoogleLoginButton label="Sign up with Google" />
      </Stack>
    </AuthPageShell>
  )
}
