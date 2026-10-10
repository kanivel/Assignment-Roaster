import { ChakraProvider } from '@chakra-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { AuthProvider } from '../context/AuthContext'
import { system } from '../theme'

interface ProvidersProps {
  children: ReactNode
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
}

export const renderWithProviders = (
  ui: ReactElement,
  { route = '/', ...options }: RenderWithProvidersOptions = {},
): RenderResult => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const Providers = ({ children }: ProvidersProps) => (
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>
  )

  return render(ui, { wrapper: Providers, ...options })
}
