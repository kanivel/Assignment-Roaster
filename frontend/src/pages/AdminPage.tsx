import { Center, SimpleGrid, Spinner, Text, VStack } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'

import { AdminStatCards } from '../components/admin/AdminStatCards'
import { PageWrapper } from '../components/layout/PageWrapper'
import { GlassCard } from '../components/ui/GlassCard'
import { GradientButton } from '../components/ui/GradientButton'
import { TextReveal } from '../components/ui/TextReveal'
import { useAdminStats } from '../hooks/useAdmin'
import { getApiErrorMessage } from '../services/submissions'

interface AdminLink {
  title: string
  body: string
  to: string
}

const ADMIN_LINKS: AdminLink[] = [
  { title: 'Users', body: 'Search accounts, deactivate, or grant admin.', to: '/admin/users' },
  { title: 'Submissions', body: 'Every roast, filter by status, remove reviews.', to: '/admin/submissions' },
]

const AdminStatsBody = () => {
  const { data, isPending, isError, error, refetch } = useAdminStats()

  if (isPending) {
    return (
      <Center py={16}>
        <Spinner size="xl" color="brand.fg" borderWidth="3px" />
      </Center>
    )
  }

  if (isError) {
    return (
      <GlassCard hoverable={false} role="alert">
        <Text fontWeight="semibold" color="red.300">
          {getApiErrorMessage(error, 'Could not load admin stats.')}
        </Text>
        <GradientButton mt={4} variant="outline" onClick={() => void refetch()}>
          Try again
        </GradientButton>
      </GlassCard>
    )
  }

  return <AdminStatCards stats={data} />
}

export const AdminPage = () => {
  const navigate = useNavigate()

  return (
    <PageWrapper>
      <VStack align="stretch" gap={8}>
        <VStack align="flex-start" gap={2}>
          <TextReveal text="Admin" gradient size={{ base: '2xl', md: '4xl' }} />
          <Text color="fg.muted">Users, submissions, and review moderation.</Text>
        </VStack>
        <AdminStatsBody />
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={5}>
          {ADMIN_LINKS.map((link, index) => (
            <GlassCard key={link.to} delay={0.25 + index * 0.05}>
              <VStack align="flex-start" gap={3}>
                <Text fontFamily="heading" fontWeight="bold" fontSize="xl">
                  {link.title}
                </Text>
                <Text color="fg.muted">{link.body}</Text>
                <GradientButton variant="outline" size="sm" onClick={() => navigate(link.to)}>
                  Manage {link.title.toLowerCase()}
                </GradientButton>
              </VStack>
            </GlassCard>
          ))}
        </SimpleGrid>
      </VStack>
    </PageWrapper>
  )
}
