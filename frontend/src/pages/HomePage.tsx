import { HStack, Text, VStack } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'

import { MeshBackground } from '../components/layout/MeshBackground'
import { PageWrapper } from '../components/layout/PageWrapper'
import { AnimatedList } from '../components/ui/AnimatedList'
import { GlassCard } from '../components/ui/GlassCard'
import { GradientButton } from '../components/ui/GradientButton'
import { TextReveal } from '../components/ui/TextReveal'
import { useAuth } from '../hooks/useAuth'

interface Highlight {
  title: string
  body: string
}

const HIGHLIGHTS: Highlight[] = [
  { title: 'Paste a repo', body: 'Drop a public GitHub link. We fetch the code for you.' },
  { title: 'Get roasted', body: 'A score out of 10 and a Tanglish roast in seconds.' },
  { title: 'Climb the board', body: 'Best scores rise to the community leaderboard.' },
]

export const HomePage = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  return (
    <>
      <MeshBackground />
      <PageWrapper centered>
        <VStack align="flex-start" gap={8} maxW="3xl">
          <TextReveal text="Your assignment is about to get roasted." gradient />
          <Text fontSize={{ base: 'lg', md: 'xl' }} color="fg.muted">
            Honest, instant, and a little bit savage feedback on your GitHub assignments.
            Submit a repo, get a score, laugh, then fix it.
          </Text>
          <HStack gap={4} flexWrap="wrap">
            <GradientButton size="lg" onClick={() => navigate(isAuthenticated ? '/submit' : '/register')}>
              Roast my repo
            </GradientButton>
            <GradientButton variant="outline" size="lg" onClick={() => navigate('/leaderboard')}>
              See the leaderboard
            </GradientButton>
          </HStack>
          <AnimatedList w="full" gap={4}>
            {HIGHLIGHTS.map((item) => (
              <GlassCard key={item.title}>
                <Text fontWeight="bold" fontSize="lg">
                  {item.title}
                </Text>
                <Text color="fg.muted">{item.body}</Text>
              </GlassCard>
            ))}
          </AnimatedList>
        </VStack>
      </PageWrapper>
    </>
  )
}
