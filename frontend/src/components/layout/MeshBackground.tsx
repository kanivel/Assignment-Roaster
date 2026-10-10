import { Box } from '@chakra-ui/react'

import { MotionBox } from '../../lib/motion'

interface Blob {
  id: string
  color: string
  top?: string
  bottom?: string
  left?: string
  right?: string
  size: string
  duration: number
}

const BLOBS: Blob[] = [
  { id: 'orange', color: 'flame.orange', top: '-10%', left: '10%', size: '34rem', duration: 14 },
  { id: 'pink', color: 'flame.pink', bottom: '-15%', right: '5%', size: '38rem', duration: 18 },
  { id: 'magenta', color: 'flame.magenta', top: '35%', right: '30%', size: '26rem', duration: 22 },
]

/** Fixed, full-viewport animated gradient mesh. Place once per landing/auth page. */
export const MeshBackground = () => (
  <Box
    position="fixed"
    inset={0}
    zIndex={-1}
    overflow="hidden"
    pointerEvents="none"
    bg="bg.canvas"
    aria-hidden="true"
  >
    <Box position="absolute" inset={0} bgImage="gradients.roastSoft" opacity={0.35} />
    {BLOBS.map((blob) => (
      <MotionBox
        key={blob.id}
        position="absolute"
        top={blob.top}
        bottom={blob.bottom}
        left={blob.left}
        right={blob.right}
        w={blob.size}
        h={blob.size}
        rounded="full"
        bg={blob.color}
        opacity={0.28}
        filter="blur(90px)"
        animate={{ scale: [1, 1.15, 1], x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
      />
    ))}
    <Box
      position="absolute"
      inset={0}
      opacity={0.06}
      bgImage="radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)"
      bgSize="28px 28px"
    />
  </Box>
)
