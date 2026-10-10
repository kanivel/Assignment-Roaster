import { Text, VStack } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'

import { MeshBackground } from '../components/layout/MeshBackground'
import { PageWrapper } from '../components/layout/PageWrapper'
import { GradientButton } from '../components/ui/GradientButton'
import { TextReveal } from '../components/ui/TextReveal'

export const NotFoundPage = () => {
  const navigate = useNavigate()
  return (
    <>
      <MeshBackground />
      <PageWrapper centered>
        <VStack align="flex-start" gap={6}>
          <TextReveal text="404. This page got burnt to a crisp." gradient />
          <Text color="fg.muted" fontSize="lg">
            The page you are looking for does not exist, or it was roasted out of existence.
          </Text>
          <GradientButton onClick={() => navigate('/')}>Back to safety</GradientButton>
        </VStack>
      </PageWrapper>
    </>
  )
}
