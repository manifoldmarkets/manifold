import { createContext, useContext, useState } from 'react'

type TokenMode = 'MANA' | 'CASH'

type TokenModeContextType = {
  token: TokenMode
  setToken: (mode: TokenMode) => void
}

const TokenModeContext = createContext<TokenModeContextType | undefined>(
  undefined
)

export function TokenModeProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<TokenMode>('MANA')

  const value = {
    token,
    setToken,
  }

  return (
    <TokenModeContext.Provider value={value}>
      {children}
    </TokenModeContext.Provider>
  )
}

export function useTokenMode() {
  const context = useContext(TokenModeContext)
  if (!context) {
    throw new Error('useTokenMode must be used within an TokenModeProvider')
  }
  return context
}
