const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PASSWORD_LENGTH = 8

export const validateEmail = (email: string): string | undefined => {
  const trimmed = email.trim()
  if (trimmed === '') return 'Email is required.'
  if (!EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address.'
  return undefined
}

export const validatePassword = (password: string): string | undefined => {
  if (password === '') return 'Password is required.'
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return undefined
}

export const validateConfirmPassword = (
  password: string,
  confirm: string,
): string | undefined => {
  if (confirm === '') return 'Please confirm your password.'
  if (confirm !== password) return 'Passwords do not match.'
  return undefined
}

export const validateFullName = (fullName: string): string | undefined => {
  if (fullName.trim() === '') return 'Name is required.'
  if (fullName.trim().length < 2) return 'Name must be at least 2 characters.'
  return undefined
}

export const validateOptionalUrl = (value: string): string | undefined => {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'Avatar URL must start with http:// or https://.'
    }
    return undefined
  } catch {
    return 'Enter a valid URL.'
  }
}
