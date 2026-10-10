import { Badge, DataList, HStack, Link as ChakraLink, SimpleGrid, Text, VStack } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'

import { PageWrapper } from '../components/layout/PageWrapper'
import { GlassCard } from '../components/ui/GlassCard'
import { TextReveal } from '../components/ui/TextReveal'
import { useAuth } from '../hooks/useAuth'
import type { User } from '../types/auth'

const formatMemberSince = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

const providerLabel = (user: User): string =>
  user.oauth_provider === 'google' ? 'Google' : 'Email and password'

interface AccountSectionProps {
  user: User
}

const AccountSection = ({ user }: AccountSectionProps) => (
  <GlassCard hoverable={false} as="section" aria-labelledby="settings-account">
    <VStack align="stretch" gap={5}>
      <HStack justify="space-between" align="flex-start" flexWrap="wrap" gap={3}>
        <VStack align="flex-start" gap={1}>
          <Text id="settings-account" fontFamily="heading" fontWeight="bold" fontSize="xl">
            Account
          </Text>
          <Text fontSize="sm" color="fg.muted">
            Who you are to the roaster.
          </Text>
        </VStack>
        <ChakraLink asChild fontWeight="semibold" color="brand.fg">
          <RouterLink to="/profile">Edit name and avatar →</RouterLink>
        </ChakraLink>
      </HStack>
      <DataList.Root orientation="horizontal" gap={3}>
        <DataList.Item>
          <DataList.ItemLabel color="fg.subtle">Email</DataList.ItemLabel>
          <DataList.ItemValue>{user.email}</DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel color="fg.subtle">Sign-in</DataList.ItemLabel>
          <DataList.ItemValue>
            <HStack gap={2}>
              <Text>{providerLabel(user)}</Text>
              <Badge colorPalette={user.is_verified ? 'green' : 'yellow'} variant="subtle" rounded="pill">
                {user.is_verified ? 'Verified' : 'Unverified'}
              </Badge>
            </HStack>
          </DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel color="fg.subtle">Member since</DataList.ItemLabel>
          <DataList.ItemValue>{formatMemberSince(user.created_at)}</DataList.ItemValue>
        </DataList.Item>
        {user.is_admin ? (
          <DataList.Item>
            <DataList.ItemLabel color="fg.subtle">Role</DataList.ItemLabel>
            <DataList.ItemValue>
              <Badge colorPalette="purple" variant="subtle" rounded="pill">
                Admin
              </Badge>
            </DataList.ItemValue>
          </DataList.Item>
        ) : null}
      </DataList.Root>
    </VStack>
  </GlassCard>
)

const PreferencesSection = () => (
  <GlassCard hoverable={false} delay={0.1} as="section" aria-labelledby="settings-preferences">
    <VStack align="stretch" gap={3}>
      <Text id="settings-preferences" fontFamily="heading" fontWeight="bold" fontSize="xl">
        Preferences
      </Text>
      <Text color="fg.muted">
        Roast intensity, notification emails, and a lighter theme are on the way.
      </Text>
      <Badge alignSelf="flex-start" variant="outline" rounded="pill">
        Coming soon
      </Badge>
    </VStack>
  </GlassCard>
)

export const SettingsPage = () => {
  const { user } = useAuth()

  if (user === null) {
    return (
      <PageWrapper>
        <Text color="fg.muted">Loading your settings...</Text>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <VStack align="stretch" gap={8}>
        <VStack align="flex-start" gap={2}>
          <TextReveal text="Settings" gradient size={{ base: '2xl', md: '4xl' }} />
          <Text color="fg.muted">Account details and preferences.</Text>
        </VStack>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={6} alignItems="start">
          <AccountSection user={user} />
          <PreferencesSection />
        </SimpleGrid>
      </VStack>
    </PageWrapper>
  )
}
