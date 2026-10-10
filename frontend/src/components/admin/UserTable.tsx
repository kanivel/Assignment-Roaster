import { Avatar, Center, HStack, Spinner, Switch, Table, Text, VisuallyHidden, VStack } from '@chakra-ui/react'
import { useEffect, useState } from 'react'

import { useAdminUsers, useUpdateAdminUser } from '../../hooks/useAdmin'
import { useAuth } from '../../hooks/useAuth'
import { ADMIN_PAGE_SIZE } from '../../services/admin'
import { getApiErrorMessage } from '../../services/submissions'
import type { AdminUser } from '../../types/admin'
import { FormAlert } from '../auth/FormAlert'
import { AnimatedInput } from '../ui/AnimatedInput'
import { GlassCard } from '../ui/GlassCard'
import { GradientButton } from '../ui/GradientButton'
import { TablePager } from './TablePager'

export interface UserTableProps {
  pageSize?: number
}

const SEARCH_DEBOUNCE_MS = 300

type ToggleField = 'is_active' | 'is_admin'

interface UserRowProps {
  user: AdminUser
  isSelf: boolean
  isSaving: boolean
  onToggle: (user: AdminUser, field: ToggleField, value: boolean) => void
}

const UserRow = ({ user, isSelf, isSaving, onToggle }: UserRowProps) => {
  const name = user.full_name?.trim() ? user.full_name : 'Anonymous roastee'
  const disabled = isSelf || isSaving

  return (
    <Table.Row data-testid={`user-row-${user.id}`} data-self={isSelf ? 'true' : undefined}>
      <Table.Cell>
        <HStack gap={3} minW={0}>
          <Avatar.Root size="sm" colorPalette="brand">
            {user.avatar_url ? <Avatar.Image src={user.avatar_url} alt="" /> : null}
            <Avatar.Fallback name={name} />
          </Avatar.Root>
          <VStack align="flex-start" gap={0} minW={0}>
            <HStack gap={2}>
              <Text fontWeight="medium" truncate maxW="14rem">
                {name}
              </Text>
              {isSelf ? (
                <Text fontSize="xs" color="brand.fg" fontWeight="semibold">
                  (you)
                </Text>
              ) : null}
            </HStack>
            <Text fontSize="sm" color="fg.muted" truncate maxW="16rem">
              {user.email}
            </Text>
          </VStack>
        </HStack>
      </Table.Cell>
      <Table.Cell fontFamily="mono" color="fg.muted" display={{ base: 'none', md: 'table-cell' }}>
        {user.submissions_count}
      </Table.Cell>
      <Table.Cell>
        <Switch.Root
          colorPalette="green"
          checked={user.is_active}
          disabled={disabled}
          onCheckedChange={(details) => onToggle(user, 'is_active', details.checked)}
        >
          <Switch.HiddenInput />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Label>
            <VisuallyHidden>Active for {user.email}</VisuallyHidden>
          </Switch.Label>
        </Switch.Root>
      </Table.Cell>
      <Table.Cell>
        <Switch.Root
          colorPalette="purple"
          checked={user.is_admin}
          disabled={disabled}
          onCheckedChange={(details) => onToggle(user, 'is_admin', details.checked)}
        >
          <Switch.HiddenInput />
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Label>
            <VisuallyHidden>Admin for {user.email}</VisuallyHidden>
          </Switch.Label>
        </Switch.Root>
      </Table.Cell>
    </Table.Row>
  )
}

export const UserTable = ({ pageSize = ADMIN_PAGE_SIZE }: UserTableProps) => {
  const { user: currentUser } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setOffset(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const { data, isPending, isError, error, isFetching, refetch } = useAdminUsers({
    search,
    limit: pageSize,
    offset,
  })
  const updateUser = useUpdateAdminUser()

  const handleToggle = (user: AdminUser, field: ToggleField, value: boolean): void => {
    setErrorMessage(null)
    updateUser.mutate(
      { id: user.id, payload: { [field]: value } },
      {
        onError: (mutationError) =>
          setErrorMessage(getApiErrorMessage(mutationError, 'Could not update that user.')),
      },
    )
  }

  const savingId = updateUser.isPending ? updateUser.variables?.id : undefined

  return (
    <VStack align="stretch" gap={4}>
      <AnimatedInput
        id="admin-user-search"
        label="Search by email"
        placeholder="ada@example.com"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        autoComplete="off"
      />

      {errorMessage ? <FormAlert status="error" message={errorMessage} /> : null}

      {isPending ? (
        <Center py={16}>
          <Spinner size="xl" color="brand.fg" borderWidth="3px" />
        </Center>
      ) : isError ? (
        <GlassCard hoverable={false} role="alert">
          <Text fontWeight="semibold" color="red.300">
            {getApiErrorMessage(error, 'Could not load users.')}
          </Text>
          <GradientButton mt={4} variant="outline" onClick={() => void refetch()}>
            Try again
          </GradientButton>
        </GlassCard>
      ) : data.items.length === 0 ? (
        <GlassCard hoverable={false} textAlign="center" py={10}>
          <Text fontWeight="bold" fontSize="lg">
            No users match
          </Text>
          <Text mt={1} color="fg.muted">
            Try a different email.
          </Text>
        </GlassCard>
      ) : (
        <>
          <GlassCard hoverable={false} p={0} overflow="hidden" opacity={isFetching ? 0.7 : 1}>
            <Table.ScrollArea>
              <Table.Root size="md" variant="line" aria-label="Users">
                <Table.Header>
                  <Table.Row bg="bg.surface">
                    <Table.ColumnHeader color="fg.subtle">User</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.subtle" display={{ base: 'none', md: 'table-cell' }}>
                      Roasts
                    </Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.subtle">Active</Table.ColumnHeader>
                    <Table.ColumnHeader color="fg.subtle">Admin</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.items.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      isSelf={currentUser?.id === user.id}
                      isSaving={savingId === user.id}
                      onToggle={handleToggle}
                    />
                  ))}
                </Table.Body>
              </Table.Root>
            </Table.ScrollArea>
          </GlassCard>
          <TablePager
            offset={data.offset}
            limit={data.limit}
            total={data.total}
            isFetching={isFetching}
            onChange={setOffset}
          />
        </>
      )}
    </VStack>
  )
}
