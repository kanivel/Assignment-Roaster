import type { ButtonProps } from '@chakra-ui/react'
import type { ReactNode } from 'react'

import { MotionButton, type MotionSafeProps, springTransition } from '../../lib/motion'

export interface GradientButtonProps extends Omit<MotionSafeProps<ButtonProps>, 'variant'> {
  children: ReactNode
  /** `solid` paints the roast gradient; `outline` shows a gradient border on a dark fill. */
  variant?: 'solid' | 'outline'
}

export const GradientButton = ({
  children,
  variant = 'solid',
  disabled,
  loading,
  ...rest
}: GradientButtonProps) => {
  const isInactive = Boolean(disabled) || Boolean(loading)
  const isSolid = variant === 'solid'

  return (
    <MotionButton
      type="button"
      px={6}
      py={3}
      h="auto"
      minH={11}
      rounded="pill"
      fontWeight="semibold"
      color="white"
      bgImage={isSolid ? 'gradients.roast' : 'none'}
      bg={isSolid ? undefined : 'bg.elevated'}
      borderWidth={isSolid ? '0' : '1px'}
      borderColor="transparent"
      backgroundClip={isSolid ? undefined : 'padding-box'}
      position="relative"
      overflow="hidden"
      _before={
        isSolid
          ? undefined
          : {
              content: '""',
              position: 'absolute',
              inset: '-1px',
              zIndex: -1,
              rounded: 'pill',
              bgImage: 'gradients.roast',
            }
      }
      _hover={{ boxShadow: 'glow' }}
      _disabled={{ opacity: 0.6, cursor: 'not-allowed', boxShadow: 'none' }}
      whileHover={isInactive ? undefined : { scale: 1.03, y: -2 }}
      whileTap={isInactive ? undefined : { scale: 0.97 }}
      transition={springTransition}
      disabled={disabled}
      loading={loading}
      {...rest}
    >
      {children}
    </MotionButton>
  )
}
