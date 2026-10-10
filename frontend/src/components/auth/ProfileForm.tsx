import { Stack } from '@chakra-ui/react'
import { type FormEvent, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../services/auth'
import type { UpdateProfileRequest, User } from '../../types/auth'
import { AnimatedInput } from '../ui/AnimatedInput'
import { GradientButton } from '../ui/GradientButton'
import { FormAlert } from './FormAlert'
import { validateFullName, validateOptionalUrl } from './validation'

export interface ProfileFormProps {
  user: User
}

interface ProfileFormErrors {
  fullName?: string
  avatarUrl?: string
}

export const ProfileForm = ({ user }: ProfileFormProps) => {
  const { updateProfile } = useAuth()
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? '')
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDirty = fullName.trim() !== (user.full_name ?? '') || avatarUrl.trim() !== (user.avatar_url ?? '')

  const validate = (): boolean => {
    const next: ProfileFormErrors = {
      fullName: validateFullName(fullName),
      avatarUrl: validateOptionalUrl(avatarUrl),
    }
    setErrors(next)
    return next.fullName === undefined && next.avatarUrl === undefined
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setApiError(null)
    setSaved(false)
    if (!validate()) return

    const payload: UpdateProfileRequest = {
      full_name: fullName.trim(),
      avatar_url: avatarUrl.trim() === '' ? null : avatarUrl.trim(),
    }

    setIsSubmitting(true)
    try {
      await updateProfile(payload)
      setSaved(true)
    } catch (error) {
      setApiError(getApiErrorMessage(error, 'Could not save your profile. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Profile form">
      <Stack gap={5}>
        {apiError ? <FormAlert status="error" message={apiError} /> : null}
        {saved ? <FormAlert status="success" message="Profile saved. Looking sharp." /> : null}

        <AnimatedInput
          id="profile-full-name"
          name="full_name"
          type="text"
          label="Full name"
          placeholder="Your name"
          autoComplete="name"
          value={fullName}
          error={errors.fullName}
          onChange={(event) => {
            setFullName(event.target.value)
            setSaved(false)
          }}
          required
        />

        <AnimatedInput
          id="profile-avatar-url"
          name="avatar_url"
          type="url"
          label="Avatar URL"
          placeholder="https://example.com/me.png"
          autoComplete="photo"
          value={avatarUrl}
          error={errors.avatarUrl}
          helperText="Leave empty to use your initials."
          onChange={(event) => {
            setAvatarUrl(event.target.value)
            setSaved(false)
          }}
        />

        <GradientButton
          type="submit"
          alignSelf="flex-start"
          loading={isSubmitting}
          loadingText="Saving..."
          disabled={!isDirty}
        >
          Save changes
        </GradientButton>
      </Stack>
    </form>
  )
}
