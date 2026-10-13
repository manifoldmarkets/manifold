import { createContext, useContext } from 'react'

// Shared answer panels also appear on feeds, dashboards, and maps. Only the
// actual market overview opts into the market-page prompt location.
export const AnswerBetTrackingLocationContext = createContext('answer panel')

export const useAnswerBetTrackingLocation = () =>
  useContext(AnswerBetTrackingLocationContext)

export const useIsMarketPageBet = () =>
  useAnswerBetTrackingLocation() === 'contract page answer'
