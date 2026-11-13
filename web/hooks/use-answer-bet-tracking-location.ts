import { createContext, useContext } from 'react'

// Shared answer panels also appear on feeds, dashboards, and maps. Only the
// actual market overview tracks its bets as 'contract page answer'.
export const AnswerBetTrackingLocationContext = createContext('answer panel')

export const useAnswerBetTrackingLocation = () =>
  useContext(AnswerBetTrackingLocationContext)
