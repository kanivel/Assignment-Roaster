import { Button, HStack, Text } from '@chakra-ui/react'

export interface TablePagerProps {
  offset: number
  limit: number
  total: number
  isFetching?: boolean
  onChange: (offset: number) => void
}

/** Prev / Next controls for offset-paginated admin tables. */
export const TablePager = ({ offset, limit, total, isFetching = false, onChange }: TablePagerProps) => {
  if (total <= limit) return null
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + limit, total)

  return (
    <HStack justify="space-between" flexWrap="wrap" gap={3}>
      <Text fontSize="sm" color="fg.subtle">
        {from}-{to} of {total}
      </Text>
      <HStack gap={2}>
        <Button
          size="sm"
          variant="outline"
          rounded="pill"
          disabled={offset === 0 || isFetching}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          rounded="pill"
          disabled={to >= total || isFetching}
          onClick={() => onChange(offset + limit)}
        >
          Next
        </Button>
      </HStack>
    </HStack>
  )
}
