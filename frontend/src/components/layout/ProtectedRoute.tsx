import { Center, Spinner, Text, VStack } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'

export interface ProtectedRouteProps {
  children: ReactNode
  /** Require `user.is_admin`; non-admins are sent to the dashboard. */
  adminOnly?: boolean
}

/**
 * Guards a route behind authentication. `isLoading` is true only while a stored
 * token is being exchanged for the user via `/auth/me` on mount.
 */
export const ProtectedRoute = ({ children, adminOnly = false }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <Center minH="60vh">
        <VStack gap={3}>
          <Spinner size="lg" color="brand.400" borderWidth="3px" />
          <Text color="fg.muted">Preheating the oven...</Text>
        </VStack>
      </Center>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (adminOnly && !user?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
