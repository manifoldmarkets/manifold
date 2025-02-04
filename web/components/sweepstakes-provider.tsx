import React, { createContext, useContext } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

type SweepstakesContextType = {
  prefersPlay: boolean | undefined
  setPrefersPlay: (prefersPlay: boolean) => void
}

const SweepstakesProvider = createContext<SweepstakesContextType | undefined>(
  undefined
)

export const Sweepstakes: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [prefersPlay, setPrefersPlay] = usePersistentLocalState<boolean>(
    true,
    'play'
  )

  return (
    <SweepstakesProvider.Provider value={{ prefersPlay, setPrefersPlay }}>
      {children}
    </SweepstakesProvider.Provider>
  )
}

export const useSweepstakes = () => {
  const context = useContext(SweepstakesProvider)
  if (context === undefined) {
    throw new Error('useSweepstakes must be used within a SweepstakesProvider')
  }
  return context
}
