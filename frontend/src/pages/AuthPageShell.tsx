import { Text, VStack } from '@chakra-ui/react'
import type { ReactNode } from 'react'

import { MeshBackground } from '../components/layout/MeshBackground'
import { PageWrapper } from '../components/layout/PageWrapper'
import { GlassCard } from '../components/ui/GlassCard'
import { TextReveal } from '../components/ui/TextReveal'

export interface AuthPageShellProps {
  title: string
  subtitle: string
  children: ReactNode
  /** Rendered below the card (e.g. "Don't have an account?" links). */
  footer?: ReactNode
}

/** Shared centred layout for the public auth pages (login, register, forgot password). */
export const AuthPageShell = ({ title, subtitle, children, footer }: AuthPageShellProps) => (
  <>
    <MeshBackground />
    <PageWrapper centered maxW="md">
      <VStack align="stretch" gap={6}>
        <VStack align="flex-start" gap={2}>
          <TextReveal text={title} gradient size={{ base: '3xl', md: '4xl' }} />
          <Text color="fg.muted">{subtitle}</Text>
        </VStack>
        <GlassCard hoverable={false}>{children}</GlassCard>
        {footer ? (
          <Text color="fg.muted" fontSize="sm" textAlign="center">
            {footer}
          </Text>
        ) : null}
      </VStack>
    </PageWrapper>
  </>
)
