import { Stack } from '@chakra-ui/react'
import { type FormEvent, useState } from 'react'

import { AnimatedInput } from '../ui/AnimatedInput'
import { GradientButton } from '../ui/GradientButton'
import { FormAlert } from './FormAlert'
import { validateEmail } from './validation'

/**
 * UI-only in the MVP: no backend endpoint exists yet, so submitting shows a
 * "coming soon" notice instead of calling the API.
 */
export const ForgotPasswordForm = () => {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const emailError = validateEmail(email)
    setError(emailError)
    if (emailError) return
    setSubmitted(true)
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Forgot password form">
      <Stack gap={5}>
        {submitted ? (
          <FormAlert
            status="info"
            title="Coming soon"
            message="Password reset emails are not wired up yet. For now, sign in with Google or reach out to an admin to reset your password."
          />
        ) : null}

        <AnimatedInput
          id="forgot-email"
          name="email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          error={error}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <GradientButton type="submit" w="full" disabled={submitted}>
          Send reset link
        </GradientButton>
      </Stack>
    </form>
  )
}
