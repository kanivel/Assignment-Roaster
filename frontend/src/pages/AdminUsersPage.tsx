import { Link as ChakraLink, Text, VStack } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'

import { UserTable } from '../components/admin/UserTable'
import { PageWrapper } from '../components/layout/PageWrapper'
import { TextReveal } from '../components/ui/TextReveal'

export const AdminUsersPage = () => (
  <PageWrapper>
    <VStack align="stretch" gap={8}>
      <VStack align="flex-start" gap={2}>
        <ChakraLink asChild fontSize="sm" color="brand.fg">
          <RouterLink to="/admin">← Admin</RouterLink>
        </ChakraLink>
        <TextReveal text="Users" gradient size={{ base: '2xl', md: '4xl' }} />
        <Text color="fg.muted">
          Deactivate accounts or grant admin. You cannot change your own flags.
        </Text>
      </VStack>
      <UserTable />
    </VStack>
  </PageWrapper>
)
