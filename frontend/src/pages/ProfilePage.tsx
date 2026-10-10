import { Avatar, Badge, HStack, SimpleGrid, Stack, Text, VStack } from '@chakra-ui/react'

import { ProfileForm } from '../components/auth/ProfileForm'
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

interface ProfileSummaryProps {
  user: User
}

const ProfileSummary = ({ user }: ProfileSummaryProps) => (
  <GlassCard hoverable={false}>
    <VStack align="center" gap={4}>
      <Avatar.Root size="2xl" colorPalette="brand">
        {user.avatar_url ? <Avatar.Image src={user.avatar_url} alt="" /> : null}
        <Avatar.Fallback name={user.full_name ?? user.email} />
      </Avatar.Root>
      <VStack gap={1}>
        <Text fontWeight="bold" fontSize="lg" textAlign="center">
          {user.full_name ?? 'Anonymous roastee'}
        </Text>
        <Text color="fg.muted" fontSize="sm" textAlign="center">
          {user.email}
        </Text>
      </VStack>
      <HStack gap={2} flexWrap="wrap" justify="center">
        {user.is_admin ? (
          <Badge colorPalette="purple" variant="subtle" rounded="pill">
            Admin
          </Badge>
        ) : null}
        {user.oauth_provider === 'google' ? (
          <Badge colorPalette="blue" variant="subtle" rounded="pill">
            Google account
          </Badge>
        ) : null}
        <Badge colorPalette={user.is_verified ? 'green' : 'yellow'} variant="subtle" rounded="pill">
          {user.is_verified ? 'Verified' : 'Unverified'}
        </Badge>
      </HStack>
      <Text color="fg.subtle" fontSize="xs">
        Member since {formatMemberSince(user.created_at)}
      </Text>
    </VStack>
  </GlassCard>
)

export const ProfilePage = () => {
  const { user } = useAuth()

  // ProtectedRoute guarantees a session; the user may still be null for a tick while loading.
  if (user === null) {
    return (
      <PageWrapper>
        <Text color="fg.muted">Loading your profile...</Text>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <Stack gap={6}>
        <VStack align="flex-start" gap={2}>
          <TextReveal text="Profile" gradient size={{ base: '2xl', md: '4xl' }} />
          <Text color="fg.muted">Update your name and avatar.</Text>
        </VStack>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={6} alignItems="start">
          <ProfileSummary user={user} />
          <GlassCard hoverable={false} gridColumn={{ md: 'span 2' }} delay={0.1}>
            <ProfileForm key={`${user.full_name ?? ''}|${user.avatar_url ?? ''}`} user={user} />
          </GlassCard>
        </SimpleGrid>
      </Stack>
    </PageWrapper>
  )
}
