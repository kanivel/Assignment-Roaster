import { HStack, chakra } from '@chakra-ui/react'

import { getGoogleLoginUrl } from '../../services/auth'
import { GradientButton, type GradientButtonProps } from '../ui/GradientButton'

export interface GoogleLoginButtonProps extends Omit<GradientButtonProps, 'children' | 'onClick' | 'variant'> {
  label?: string
}

const GoogleMark = () => (
  <chakra.svg viewBox="0 0 24 24" boxSize={5} aria-hidden="true" focusable="false">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.55 5.55 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.55-5.17 3.55-8.87z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
    />
  </chakra.svg>
)

/** Starts the Google OAuth flow by navigating the browser to the backend's /auth/google. */
export const GoogleLoginButton = ({ label = 'Continue with Google', ...rest }: GoogleLoginButtonProps) => {
  const handleClick = (): void => {
    window.location.assign(getGoogleLoginUrl())
  }

  return (
    <GradientButton variant="outline" w="full" onClick={handleClick} {...rest}>
      <HStack gap={3}>
        <GoogleMark />
        <span>{label}</span>
      </HStack>
    </GradientButton>
  )
}
