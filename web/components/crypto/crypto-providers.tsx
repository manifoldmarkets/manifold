'use client'
import { DaimoSDKProvider } from '@daimo/sdk/web'
import '@daimo/sdk/web/theme.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { http, createConfig, WagmiProvider } from 'wagmi'
import { base, mainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

const centerModalStyles = `
  /* Override Daimo's desktop bottom-sheet positioning to center the modal */
  @media (min-width: 640px) {
    .daimo-modal-backdrop + .daimo-fixed.daimo-inset-x-0.daimo-bottom-0.daimo-z-50.daimo-flex.daimo-justify-center.daimo-pointer-events-none {
      inset: 0 !important;
      align-items: center !important;
    }
  }
  /* @tailwindcss/forms adds padding to input[type="text"] which collapses
     Daimo's dynamic-width amount input (width: Nch) to 0px content area */
  input.daimo-bg-transparent {
    padding: 0;
  }
`

// Context to track if crypto providers are ready
const CryptoReadyContext = createContext(false)

export function useCryptoReady() {
  return useContext(CryptoReadyContext)
}

// Wagmi config for wallet connections (used by prize page)
function createWagmiConfig() {
  return createConfig({
    chains: [base, mainnet],
    connectors: [
      injected(),
      walletConnect({
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
      }),
    ],
    transports: {
      [base.id]: http(),
      [mainnet.id]: http(),
    },
  })
}

// CryptoProviders - wagmi setup for pages that need wallet connection (e.g. prize)
export function CryptoProviders({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  const [wagmiConfig] = useState(() => {
    if (typeof window === 'undefined') return null
    return createWagmiConfig()
  })

  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => {
    setMounted(true)
  }, [])

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
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </CryptoReadyContext.Provider>
  )
}

// DaimoProviders - Daimo SDK for payment modals (used by checkout page)
export function DaimoProviders({ children }: { children: ReactNode }) {
  return (
    <DaimoSDKProvider>
      <style dangerouslySetInnerHTML={{ __html: centerModalStyles }} />
      {children}
    </DaimoSDKProvider>
  )
}
