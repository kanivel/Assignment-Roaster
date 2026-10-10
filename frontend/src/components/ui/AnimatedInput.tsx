import { Field, type InputProps } from '@chakra-ui/react'
import { forwardRef } from 'react'

import { MotionInput, type MotionSafeProps, smoothTransition } from '../../lib/motion'

export interface AnimatedInputProps extends MotionSafeProps<InputProps> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
}

export const AnimatedInput = forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ label, error, helperText, required = false, id, ...rest }, ref) => {
    const isInvalid = Boolean(error)

    return (
      <Field.Root invalid={isInvalid} required={required}>
        {label ? (
          <Field.Label color="fg.muted" fontSize="sm" fontWeight="medium" htmlFor={id}>
            {label}
            {required ? <Field.RequiredIndicator /> : null}
          </Field.Label>
        ) : null}
        <MotionInput
          ref={ref}
          id={id}
          size="lg"
          rounded="xl"
          bg="bg.glass"
          borderWidth="2px"
          borderColor={isInvalid ? 'red.400' : 'border.glass'}
          color="fg.default"
          _placeholder={{ color: 'fg.subtle' }}
          _hover={{ borderColor: isInvalid ? 'red.400' : 'brand.400' }}
          _focusVisible={{
            borderColor: isInvalid ? 'red.400' : 'brand.400',
            boxShadow: 'glow',
            outline: 'none',
          }}
          whileFocus={{ scale: 1.01 }}
          transition={smoothTransition}
          {...rest}
        />
        {helperText && !error ? (
          <Field.HelperText color="fg.subtle">{helperText}</Field.HelperText>
        ) : null}
        {error ? <Field.ErrorText>{error}</Field.ErrorText> : null}
      </Field.Root>
    )
  },
)

AnimatedInput.displayName = 'AnimatedInput'
