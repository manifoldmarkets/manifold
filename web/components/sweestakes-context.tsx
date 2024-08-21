import React, { createContext, useContext, useState } from 'react'

type SweepstakesContextType = {
  isPlay: boolean
  setIsPlay: React.Dispatch<React.SetStateAction<boolean>>
}

const SweepstakesContext = createContext<SweepstakesContextType | undefined>(
  undefined
)

export const SweepstakesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isPlay, setIsPlay] = useState(true)
  return (
    <SweepstakesContext.Provider value={{ isPlay, setIsPlay }}>
      {children}
    </SweepstakesContext.Provider>
  )
}

export const useSweepstakes = () => {
  const context = useContext(SweepstakesContext)
  if (context === undefined) {
    throw new Error('useSweepstakes must be used within a SweepstakesProvider')
  }
  return context
}
