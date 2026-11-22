import { createContext, useContext } from 'react'
import type { SportsTicket } from 'common/sports-official-game'

// Only the native tickets opened from a verified sports feed supply a binding.
export const SportsTicketContext = createContext<
  | {
      ticket: SportsTicket
      onInvalid?: () => void
      onRestingOrder?: () => void
    }
  | undefined
>(undefined)
export const useSportsTicket = () => useContext(SportsTicketContext)
