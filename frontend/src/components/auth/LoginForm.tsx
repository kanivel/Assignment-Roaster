import { Link as ChakraLink, Stack } from '@chakra-ui/react'
import { type FormEvent, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../services/auth'
import { AnimatedInput } from '../ui/AnimatedInput'
import { GradientButton } from '../ui/GradientButton'
import { FormAlert } from './FormAlert'
import { validateEmail } from './validation'

export interface LoginFormProps {
  /** Called after a successful login (e.g. to navigate away). */
  onSuccess?: () => void
}

interface LoginFormErrors {
  email?: string
  password?: string
}

export const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = (): boolean => {
    const next: LoginFormErrors = {
      email: validateEmail(email),
      password: password === '' ? 'Password is required.' : undefined,
    }
    setErrors(next)
    return next.email === undefined && next.password === undefined
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setApiError(null)
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await login({ email: email.trim(), password })
      onSuccess?.()
    } catch (error) {
      setApiError(getApiErrorMessage(error, 'Login failed. Check your email and password.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Login form">
      <Stack gap={5}>
        {apiError ? <FormAlert status="error" message={apiError} /> : null}

        <AnimatedInput
          id="login-email"
          name="email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <AnimatedInput
          id="login-password"
          name="password"
          type="password"
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <ChakraLink
          asChild
          alignSelf="flex-end"
          fontSize="sm"
          color="brand.fg"
          _hover={{ textDecoration: 'underline' }}
        >
          <RouterLink to="/forgot-password">Forgot password?</RouterLink>
        </ChakraLink>

        <GradientButton type="submit" w="full" loading={isSubmitting} loadingText="Signing in...">
          Login
        </GradientButton>
      </Stack>
    </form>
  )
}
