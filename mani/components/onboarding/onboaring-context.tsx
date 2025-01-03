import { ThemedText } from 'components/themed-text'
import React, { createContext, useContext, useRef, useState } from 'react'

export const SLIDER_HEADER_REF = 'slider-header'
export const FIRST_FEED_CARD_REF = 'first-feed-card'

export type OnboaringStep = {
  ref: React.RefObject<any>
  content: React.ReactNode
}

type TutorialContextType = {
  registerRef: (id: string, ref: React.RefObject<any>) => void
  getRef: (id: string) => React.RefObject<any> | null
  currentStep: number
  setCurrentStep: (step: number) => void
  steps: OnboaringStep[]
}

const TutorialContext = createContext<TutorialContextType | null>(null)

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState(0)
  const refsMap = useRef(new Map<string, React.RefObject<any>>())

  const steps = [
    {
      ref: refsMap.current.get(SLIDER_HEADER_REF),
      content: <ThemedText>Mana</ThemedText>,
    },
    {
      ref: refsMap.current.get(SLIDER_HEADER_REF),
      content: <ThemedText>Sweepscash</ThemedText>,
    },
    {
      ref: refsMap.current.get(FIRST_FEED_CARD_REF),
      content: <ThemedText>Prediction Markets</ThemedText>,
    },
  ]

  const registerRef = (id: string, ref: React.RefObject<any>) => {
    refsMap.current.set(id, ref)
  }

  const getRef = (id: string) => {
    return refsMap.current.get(id) || null
  }

  return (
    <TutorialContext.Provider
      value={{ registerRef, getRef, currentStep, setCurrentStep, steps }}
    >
      {children}
    </TutorialContext.Provider>
  )
}

export const useTutorial = () => {
  const context = useContext(TutorialContext)
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider')
  }
  return context
}
