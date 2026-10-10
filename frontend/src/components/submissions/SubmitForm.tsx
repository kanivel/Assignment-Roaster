import { chakra, Text, VStack } from '@chakra-ui/react'
import { type ChangeEvent, type FormEvent, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCreateSubmission } from '../../hooks/useSubmissions'
import { MotionBox } from '../../lib/motion'
import {
  getApiErrorMessage,
  isValidGithubUrl,
  SUBMISSION_RATE_LIMIT_MESSAGE,
} from '../../services/submissions'
import { AnimatedInput } from '../ui/AnimatedInput'
import { GradientButton } from '../ui/GradientButton'

export interface SubmitFormProps {
  /** Called after a successful submission, before navigation. */
  onSubmitted?: (submissionId: number) => void
}

const INVALID_URL_MESSAGE =
  'Enter a public GitHub repo URL like https://github.com/owner/repo'

export const SubmitForm = ({ onSubmitted }: SubmitFormProps) => {
  const inputId = useId()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [touched, setTouched] = useState(false)
  const { mutateAsync, isPending, error, reset } = useCreateSubmission()

  const trimmed = url.trim()
  const isValid = isValidGithubUrl(trimmed)
  const showValidationError = touched && trimmed.length > 0 && !isValid
  const apiError = error
    ? getApiErrorMessage(error, 'Could not submit this repo. Try again.', {
        rateLimitMessage: SUBMISSION_RATE_LIMIT_MESSAGE,
      })
    : null

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setUrl(event.target.value)
    setTouched(true)
    if (error) reset()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!isValid || isPending) return
    try {
      const submission = await mutateAsync({ github_url: trimmed.replace(/\/$/, '') })
      onSubmitted?.(submission.id)
      navigate(`/submissions/${submission.id}`)
    } catch {
      // The mutation exposes the error; it is rendered below.
    }
  }

  return (
    <chakra.form onSubmit={(event) => void handleSubmit(event)} w="full" aria-label="Submit a repository">
      <VStack align="stretch" gap={4}>
        <AnimatedInput
          id={inputId}
          name="github_url"
          label="GitHub repository URL"
          placeholder="https://github.com/owner/repo"
          type="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          error={showValidationError ? INVALID_URL_MESSAGE : undefined}
          helperText="Public repos only. We grab the default branch and roast it."
          required
        />
        {apiError ? (
          <MotionBox
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            px={4}
            py={3}
            rounded="xl"
            bg="rgba(255, 77, 77, 0.12)"
            borderWidth="1px"
            borderColor="red.400"
          >
            <Text color="red.200" fontSize="sm">
              {apiError}
            </Text>
          </MotionBox>
        ) : null}
        <GradientButton
          type="submit"
          size="lg"
          alignSelf="flex-start"
          disabled={!isValid || isPending}
          loading={isPending}
          loadingText="Queueing roast..."
        >
          Roast it
        </GradientButton>
      </VStack>
    </chakra.form>
  )
}
