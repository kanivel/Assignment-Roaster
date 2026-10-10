import { Flex, Text, VStack } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'

import { PageWrapper } from '../components/layout/PageWrapper'
import { SubmissionList } from '../components/submissions/SubmissionList'
import { GradientButton } from '../components/ui/GradientButton'
import { TextReveal } from '../components/ui/TextReveal'

export const SubmissionsPage = () => {
  const navigate = useNavigate()

  return (
    <PageWrapper>
      <VStack align="stretch" gap={8}>
        <Flex
          direction={{ base: 'column', sm: 'row' }}
          align={{ base: 'flex-start', sm: 'flex-end' }}
          justify="space-between"
          gap={4}
        >
          <VStack align="flex-start" gap={2}>
            <TextReveal text="My submissions" gradient size={{ base: '2xl', md: '4xl' }} />
            <Text color="fg.muted">Every repo you have thrown into the fire, newest first.</Text>
          </VStack>
          <GradientButton onClick={() => navigate('/submit')}>New roast</GradientButton>
        </Flex>
        <SubmissionList />
      </VStack>
    </PageWrapper>
  )
}
