'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { createContext, ReactNode, useContext } from 'react'
import { arbitrum } from 'viem/chains'

type PrivyWalletConfig = {
  configured: boolean
  missingEnv: string[]
}

const PrivyWalletConfigContext = createContext<PrivyWalletConfig>({
  configured: false,
  missingEnv: ['NEXT_PUBLIC_PRIVY_APP_ID'],
})

export function usePrivyWalletConfig() {
  return useContext(PrivyWalletConfigContext)
}

export function PrivyWalletProviders({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const missingEnv = appId ? [] : ['NEXT_PUBLIC_PRIVY_APP_ID']
  const config = {
    configured: missingEnv.length === 0,
    missingEnv,
  }

  if (!appId) {
    return (
      <PrivyWalletConfigContext.Provider value={config}>
        {children}
      </PrivyWalletConfigContext.Provider>
    )
  }

  return (
    <PrivyWalletConfigContext.Provider value={config}>
      <PrivyProvider
        appId={appId}
        config={{
          defaultChain: arbitrum,
          supportedChains: [arbitrum],
          loginMethods: ['email', 'wallet'],
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'users-without-wallets',
            },
          },
        }}
      >
        {children}
      </PrivyProvider>
    </PrivyWalletConfigContext.Provider>
  )
}
