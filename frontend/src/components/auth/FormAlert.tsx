import { Alert } from '@chakra-ui/react'

export interface FormAlertProps {
  status: 'error' | 'success' | 'info'
  title?: string
  message: string
}

/** Inline, accessible notice used above auth forms for API errors and confirmations. */
export const FormAlert = ({ status, title, message }: FormAlertProps) => (
  <Alert.Root status={status} rounded="xl" variant="subtle" role={status === 'error' ? 'alert' : 'status'}>
    <Alert.Indicator />
    <Alert.Content>
      {title ? <Alert.Title>{title}</Alert.Title> : null}
      <Alert.Description>{message}</Alert.Description>
    </Alert.Content>
  </Alert.Root>
)
