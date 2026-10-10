import { Box, Container, Flex, HStack, Link as ChakraLink, Text } from '@chakra-ui/react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'
import { MotionBox, MotionFlex } from '../../lib/motion'
import { GradientButton } from '../ui/GradientButton'

interface NavItem {
  label: string
  to: string
  protected: boolean
  /** Only shown to users with `is_admin`. */
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', protected: true },
  { label: 'Submit', to: '/submit', protected: true },
  { label: 'My Submissions', to: '/submissions', protected: true },
  { label: 'Leaderboard', to: '/leaderboard', protected: false },
  { label: 'Admin', to: '/admin', protected: true, adminOnly: true },
]

export const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()

  const visibleItems = NAV_ITEMS.filter(
    (item) => (!item.protected || isAuthenticated) && (!item.adminOnly || user?.is_admin === true),
  )

  const handleLogout = (): void => {
    logout()
    navigate('/login')
  }

  return (
    <MotionBox
      as="header"
      position="sticky"
      top={0}
      zIndex={10}
      bg="rgba(11, 7, 16, 0.65)"
      backdropFilter="blur(16px) saturate(140%)"
      borderBottomWidth="1px"
      borderColor="border.glass"
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Container maxW="6xl" px={{ base: 4, md: 8 }}>
        <Flex h="4.5rem" align="center" justify="space-between" gap={4}>
          <ChakraLink asChild _hover={{ textDecoration: 'none' }}>
            <NavLink to="/">
              <HStack gap={2}>
                <MotionBox
                  fontSize="2xl"
                  whileHover={{ rotate: [0, -12, 12, 0] }}
                  transition={{ duration: 0.5 }}
                  aria-hidden="true"
                >
                  🔥
                </MotionBox>
                <Text
                  fontFamily="heading"
                  fontWeight="extrabold"
                  fontSize="lg"
                  letterSpacing="tight"
                  bgImage="gradients.roast"
                  bgClip="text"
                  color="transparent"
                >
                  Assignment Roaster
                </Text>
              </HStack>
            </NavLink>
          </ChakraLink>

          <HStack as="nav" gap={{ base: 2, md: 4 }} display={{ base: 'none', md: 'flex' }}>
            {visibleItems.map((item) => (
              <ChakraLink
                asChild
                key={item.to}
                px={3}
                py={2}
                rounded="pill"
                fontWeight="medium"
                color="fg.muted"
                _hover={{ color: 'fg.default', bg: 'bg.glass', textDecoration: 'none' }}
                _currentPage={{ color: 'fg.default', bg: 'brand.subtle' }}
              >
                <NavLink to={item.to}>{item.label}</NavLink>
              </ChakraLink>
            ))}
          </HStack>

          <MotionFlex align="center" gap={3} whileHover={{ scale: 1.01 }}>
            {isAuthenticated ? (
              <>
                <Text
                  fontSize="sm"
                  color="fg.muted"
                  display={{ base: 'none', sm: 'block' }}
                  maxW="12rem"
                  truncate
                >
                  {user?.full_name ?? user?.email ?? 'Roastee'}
                </Text>
                <GradientButton variant="outline" size="sm" onClick={handleLogout}>
                  Logout
                </GradientButton>
              </>
            ) : (
              <GradientButton size="sm" onClick={() => navigate('/login')}>
                Login
              </GradientButton>
            )}
          </MotionFlex>
        </Flex>
      </Container>
      <Box h="1px" bgImage="gradients.roast" opacity={0.5} />
    </MotionBox>
  )
}
