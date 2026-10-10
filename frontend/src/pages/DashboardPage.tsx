import { Center, SimpleGrid, Spinner, Text, VStack } from '@chakra-ui/react'

import { LatestRoastCard } from '../components/dashboard/LatestRoastCard'
import { StatCard } from '../components/dashboard/StatCard'
import { SubmitCTA } from '../components/dashboard/SubmitCTA'
import { PageWrapper } from '../components/layout/PageWrapper'
import { GlassCard } from '../components/ui/GlassCard'
import { GradientButton } from '../components/ui/GradientButton'
import { ScoreBadge } from '../components/ui/ScoreBadge'
import { TextReveal } from '../components/ui/TextReveal'
import { useAuth } from '../hooks/useAuth'
import { useDashboardStats } from '../hooks/useDashboard'
import { getApiErrorMessage } from '../services/submissions'
import type { DashboardStats } from '../types/dashboard'

const formatAverage = (value: number | null): string => (value === null ? '--' : value.toFixed(1))

const pluralize = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

interface StatsGridProps {
  stats: DashboardStats
}

const StatsGrid = ({ stats }: StatsGridProps) => {
  const inFlight = stats.pending_count
  return (
    <SimpleGrid columns={{ base: 2, md: 4 }} gap={{ base: 3, md: 5 }}>
      <StatCard
        label="Total roasts"
        value={String(stats.total_submissions)}
        hint={inFlight > 0 ? `${pluralize(inFlight, 'roast')} in progress` : `${stats.done_count} done`}
        accent
      />
      <StatCard
        label="Average score"
        value={formatAverage(stats.average_score)}
        hint={stats.average_score === null ? 'No finished roasts yet' : 'Across finished roasts'}
        delay={0.05}
      />
      <StatCard
        label="Best score"
        value={
          stats.best_score === null ? (
            '--'
          ) : (
            <ScoreBadge score={stats.best_score} fontSize="xl" px={4} py={2} />
          )
        }
        hint={stats.best_score === null ? 'Nothing to brag about yet' : 'Your personal best'}
        delay={0.1}
      />
      <StatCard
        label="Failed"
        value={String(stats.failed_count)}
        hint={stats.failed_count > 0 ? 'Open a failed roast to retry it' : 'Clean record so far'}
        delay={0.15}
      />
    </SimpleGrid>
  )
}

const DashboardBody = () => {
  const { data, isPending, isError, error, refetch } = useDashboardStats()

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
          {getApiErrorMessage(error, 'Could not load your dashboard.')}
        </Text>
        <GradientButton mt={4} variant="outline" onClick={() => void refetch()}>
          Try again
        </GradientButton>
      </GlassCard>
    )
  }

  if (data.total_submissions === 0) {
    return <SubmitCTA firstTime />
  }

  return (
    <VStack align="stretch" gap={6}>
      <StatsGrid stats={data} />
      <LatestRoastCard submission={data.latest_submission} delay={0.2} />
      <SubmitCTA delay={0.25} />
    </VStack>
  )
}

export const DashboardPage = () => {
  const { user } = useAuth()
  const firstName = user?.full_name?.trim().split(' ')[0]

  return (
    <PageWrapper>
      <VStack align="stretch" gap={8}>
        <VStack align="flex-start" gap={2}>
          <TextReveal text="Dashboard" gradient size={{ base: '2xl', md: '4xl' }} />
          <Text color="fg.muted">
            {firstName ? `Welcome back, ${firstName}. ` : ''}
            Your stats, your latest roast, and the next repo to throw in.
          </Text>
        </VStack>
        <DashboardBody />
      </VStack>
    </PageWrapper>
  )
}
