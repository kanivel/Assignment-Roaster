import { Flex, Text, VStack } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'

import { GlassCard } from '../ui/GlassCard'
import { GradientButton } from '../ui/GradientButton'

export interface SubmitCTAProps {
  /** Bigger, friendlier copy for users with no submissions yet. */
  firstTime?: boolean
  delay?: number
}

export const SubmitCTA = ({ firstTime = false, delay = 0 }: SubmitCTAProps) => {
  const navigate = useNavigate()

  return (
    <GlassCard
      hoverable={false}
      delay={delay}
      bgImage="gradients.roastSoft"
      data-testid="submit-cta"
      py={firstTime ? 12 : undefined}
      textAlign={firstTime ? 'center' : undefined}
    >
      <Flex
        direction={firstTime ? 'column' : { base: 'column', sm: 'row' }}
        align={firstTime ? 'center' : { base: 'flex-start', sm: 'center' }}
        justify="space-between"
        gap={4}
      >
        <VStack align={firstTime ? 'center' : 'flex-start'} gap={1}>
          <Text fontFamily="heading" fontWeight="bold" fontSize={firstTime ? '2xl' : 'lg'}>
            {firstTime ? 'No roasts yet' : 'Ready for another round?'}
          </Text>
          <Text color="fg.muted">
            {firstTime
              ? 'Submit your first repo and find out what the roaster thinks.'
              : 'Paste a public GitHub repo and get a fresh verdict in seconds.'}
          </Text>
        </VStack>
        <GradientButton size="lg" onClick={() => navigate('/submit')}>
          {firstTime ? 'Submit a repo' : 'Roast another repo'}
        </GradientButton>
      </Flex>
    </GlassCard>
  )
}
