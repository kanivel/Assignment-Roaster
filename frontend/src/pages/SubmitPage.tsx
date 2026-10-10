import { Text, VStack } from '@chakra-ui/react'

import { MeshBackground } from '../components/layout/MeshBackground'
import { PageWrapper } from '../components/layout/PageWrapper'
import { SubmitForm } from '../components/submissions/SubmitForm'
import { GlassCard } from '../components/ui/GlassCard'
import { TextReveal } from '../components/ui/TextReveal'

export const SubmitPage = () => (
  <>
    <MeshBackground />
    <PageWrapper maxW="3xl" centered>
      <VStack align="stretch" gap={8}>
        <VStack align="flex-start" gap={3}>
          <TextReveal text="Drop the repo. Face the fire." gradient />
          <Text fontSize={{ base: 'md', md: 'lg' }} color="fg.muted">
            Paste a public GitHub repository URL. We read the code, score it out of 10, and
            serve a Tanglish roast with real, fixable feedback.
          </Text>
        </VStack>
        <GlassCard hoverable={false} delay={0.15}>
          <SubmitForm />
        </GlassCard>
      </VStack>
    </PageWrapper>
  </>
)
