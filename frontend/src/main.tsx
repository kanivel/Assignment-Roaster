import { ChakraProvider } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { AuthProvider } from './context/AuthContext'
import { queryClient } from './lib/queryClient'
import { system } from './theme'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <ChakraProvider value={system}>
      {/* Honour the OS "reduce motion" preference for every framer-motion animation. */}
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </MotionConfig>
    </ChakraProvider>
  </StrictMode>,
)
