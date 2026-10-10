import { Badge, type BadgeProps } from '@chakra-ui/react'

import type { SubmissionStatus } from '../../types'

export interface StatusBadgeProps extends Omit<BadgeProps, 'colorPalette'> {
  status: SubmissionStatus
}

interface StatusStyle {
  label: string
  colorPalette: 'yellow' | 'blue' | 'green' | 'red'
}

const STATUS_STYLES: Record<SubmissionStatus, StatusStyle> = {
  pending: { label: 'Pending', colorPalette: 'yellow' },
  reviewing: { label: 'Reviewing', colorPalette: 'blue' },
  done: { label: 'Done', colorPalette: 'green' },
  failed: { label: 'Failed', colorPalette: 'red' },
}

export const StatusBadge = ({ status, ...rest }: StatusBadgeProps) => {
  const style = STATUS_STYLES[status]
  return (
    <Badge
      colorPalette={style.colorPalette}
      variant="subtle"
      rounded="pill"
      px={3}
      py={1}
      fontSize="xs"
      fontWeight="semibold"
      textTransform="uppercase"
      letterSpacing="wider"
      data-status={status}
      {...rest}
    >
      {style.label}
    </Badge>
  )
}
