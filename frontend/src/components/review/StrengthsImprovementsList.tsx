import { Box, Heading, SimpleGrid, Text } from '@chakra-ui/react'

import { fadeUp, MotionBox, staggerContainer } from '../../lib/motion'
import { GlassCard } from '../ui/GlassCard'

export interface StrengthsImprovementsListProps {
  strengths: string[]
  improvements: string[]
}

interface ColumnProps {
  title: string
  emoji: string
  items: string[]
  accent: string
  emptyText: string
}

const Column = ({ title, emoji, items, accent, emptyText }: ColumnProps) => (
  <GlassCard hoverable={false} as="section" aria-labelledby={`${title}-heading`} h="full">
    <Heading as="h3" id={`${title}-heading`} size="md" fontFamily="heading" color={accent} mb={3}>
      <Text as="span" mr={2} aria-hidden="true">
        {emoji}
      </Text>
      {title}
    </Heading>
    {items.length === 0 ? (
      <Text color="fg.subtle" fontSize="sm">
        {emptyText}
      </Text>
    ) : (
      <MotionBox
        as="ul"
        listStyleType="none"
        display="flex"
        flexDirection="column"
        gap={2}
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        {items.map((item, index) => (
          <MotionBox
            as="li"
            key={`${index}-${item.slice(0, 24)}`}
            variants={fadeUp}
            display="flex"
            gap={3}
            alignItems="flex-start"
          >
            <Box
              mt="0.55em"
              w={2}
              h={2}
              rounded="full"
              bg={accent}
              flexShrink={0}
              aria-hidden="true"
            />
            <Text color="fg.default">{item}</Text>
          </MotionBox>
        ))}
      </MotionBox>
    )}
  </GlassCard>
)

export const StrengthsImprovementsList = ({
  strengths,
  improvements,
}: StrengthsImprovementsListProps) => (
  <SimpleGrid columns={{ base: 1, md: 2 }} gap={{ base: 4, md: 6 }}>
    <Column
      title="Strengths"
      emoji="💪"
      items={strengths}
      accent="green.300"
      emptyText="Nothing stood out. Ouch."
    />
    <Column
      title="Improvements"
      emoji="🔧"
      items={improvements}
      accent="orange.300"
      emptyText="Nothing to fix. Suspicious."
    />
  </SimpleGrid>
)
