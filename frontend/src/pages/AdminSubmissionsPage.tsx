import { Link as ChakraLink, Text, VStack } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'

import { SubmissionTable } from '../components/admin/SubmissionTable'
import { PageWrapper } from '../components/layout/PageWrapper'
import { TextReveal } from '../components/ui/TextReveal'

export const AdminSubmissionsPage = () => (
  <PageWrapper>
    <VStack align="stretch" gap={8}>
      <VStack align="flex-start" gap={2}>
        <ChakraLink asChild fontSize="sm" color="brand.fg">
          <RouterLink to="/admin">← Admin</RouterLink>
        </ChakraLink>
        <TextReveal text="Submissions" gradient size={{ base: '2xl', md: '4xl' }} />
        <Text color="fg.muted">
          Every roast on the platform. Removing a review resets its submission to failed.
        </Text>
      </VStack>
      <SubmissionTable />
    </VStack>
  </PageWrapper>
)
