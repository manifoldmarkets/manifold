'use client'
import { DaimoPayProvider, getDefaultConfig } from '@daimo/pay'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { WagmiProvider, createConfig } from 'wagmi'

// Context to track if crypto providers are ready
const CryptoReadyContext = createContext(false)

export function useCryptoReady() {
  return useContext(CryptoReadyContext)
}

export function CryptoProviders({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  // Create wagmi config with Daimo Pay defaults - only on client
  const [wagmiConfig] = useState(() => {
    if (typeof window === 'undefined') return null
    return createConfig(getDefaultConfig({ appName: 'Manifold Markets' }))
  })

  // Create react-query client
  const [queryClient] = useState(() => new QueryClient())

  // Only render providers after mounting on client
  useEffect(() => {
    setMounted(true)
  }, [])

  // During SSR or before mount, render without providers but mark as not ready
  if (!mounted || !wagmiConfig) {
    return (
      <CryptoReadyContext.Provider value={false}>
        {children}
      </CryptoReadyContext.Provider>
    )
  }

  return (
    <CryptoReadyContext.Provider value={true}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DaimoPayProvider>{children}</DaimoPayProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </CryptoReadyContext.Provider>
  )
}
