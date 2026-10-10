import { Link as ChakraLink } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'

import { ForgotPasswordForm } from '../components/auth/ForgotPasswordForm'
import { AuthPageShell } from './AuthPageShell'

export const ForgotPasswordPage = () => (
  <AuthPageShell
    title="Forgot password"
    subtitle="Enter your email and we will send you a reset link."
    footer={
      <>
        Remembered it?{' '}
        <ChakraLink asChild color="brand.fg" fontWeight="semibold" _hover={{ textDecoration: 'underline' }}>
          <RouterLink to="/login">Back to login</RouterLink>
        </ChakraLink>
      </>
    }
  >
    <ForgotPasswordForm />
  </AuthPageShell>
)
