import { Stack } from '@chakra-ui/react'
import { type FormEvent, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../services/auth'
import { AnimatedInput } from '../ui/AnimatedInput'
import { GradientButton } from '../ui/GradientButton'
import { FormAlert } from './FormAlert'
import {
  MIN_PASSWORD_LENGTH,
  validateConfirmPassword,
  validateEmail,
  validateFullName,
  validatePassword,
} from './validation'

export interface RegisterFormProps {
  /** Called after the account is created and the session established. */
  onSuccess?: () => void
}

interface RegisterFormErrors {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export const RegisterForm = ({ onSuccess }: RegisterFormProps) => {
  const { register } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<RegisterFormErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = (): boolean => {
    const next: RegisterFormErrors = {
      fullName: validateFullName(fullName),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    }
    setErrors(next)
    return Object.values(next).every((value) => value === undefined)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setApiError(null)
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await register({ email: email.trim(), password, full_name: fullName.trim() })
      onSuccess?.()
    } catch (error) {
      setApiError(getApiErrorMessage(error, 'Could not create your account. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Register form">
      <Stack gap={5}>
        {apiError ? <FormAlert status="error" message={apiError} /> : null}

        <AnimatedInput
          id="register-full-name"
          name="full_name"
          type="text"
          label="Full name"
          placeholder="Ada Lovelace"
          autoComplete="name"
          value={fullName}
          error={errors.fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
        />

        <AnimatedInput
          id="register-email"
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
          id="register-password"
          name="password"
          type="password"
          label="Password"
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          value={password}
          error={errors.password}
          helperText={`Use ${MIN_PASSWORD_LENGTH}+ characters. Mix letters and numbers for a tougher crust.`}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <AnimatedInput
          id="register-confirm-password"
          name="confirm_password"
          type="password"
          label="Confirm password"
          placeholder="Repeat your password"
          autoComplete="new-password"
          value={confirmPassword}
          error={errors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />

        <GradientButton type="submit" w="full" loading={isSubmitting} loadingText="Creating account...">
          Create account
        </GradientButton>
      </Stack>
    </form>
  )
}
