import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import {
  isOfficialUfcWinnerMarket,
  toUfcMarketBout,
  ufcCanBet,
  ufcObservationEnd,
  ufcTicketBinding,
} from 'common/bdl/ufc-card'
import { isMultiCpmm, type MarketContract } from 'common/contract'
import { sportsViewNow } from 'common/sports-view-clock'
import type { SportsTicket } from 'common/sports-official-game'

// A feed ticket carries the opening selection and cutoff into both native order forms.
export const SportsTicketContext = createContext<
  | {
      ticket: SportsTicket
      refreshing?: boolean
      onInvalid?: () => void
      onRestingOrder?: () => void
    }
  | undefined
>(undefined)
export const useSportsTicket = () => useContext(SportsTicketContext)

/** Both the feed dialog and the ordinary market page use the native buy/limit forms. */
export function useSportsOrder(contract: MarketContract, answerId?: string) {
  const inherited = useSportsTicket()
  const watched = isSportsBdlEnabled() && isOfficialUfcWinnerMarket(contract)
  const bout =
    watched && isMultiCpmm(contract) && Array.isArray(contract.answers)
      ? toUfcMarketBout(contract, contract.answers)
      : null
  const binding = bout && ufcTicketBinding(bout)
  const initial = useRef<{
    id: string
    binding: string | null
    closeTime: number
  }>()
  if (!watched) initial.current = undefined
  else if (
    initial.current?.id !== contract.id ||
    (initial.current.binding == null && binding != null)
  )
    initial.current = {
      id: contract.id,
      binding,
      closeTime: contract.closeTime ?? 0,
    }
  else
    initial.current.closeTime = Math.min(
      initial.current.closeTime,
      contract.closeTime ?? 0
    )
  const closeTime = Math.min(
    initial.current?.closeTime ?? Infinity,
    bout ? ufcObservationEnd(bout) : Infinity,
    inherited?.ticket.closeTime ?? Infinity
  )
  const [, tick] = useState(0)
  const now = sportsViewNow()
  useEffect(() => {
    if (!watched || !Number.isFinite(closeTime) || now >= closeTime) return
    const timer = setTimeout(
      () => tick((n) => n + 1),
      Math.min(2147483647, Math.max(0, closeTime - sportsViewNow()))
    )
    return () => clearTimeout(timer)
  }, [watched, closeTime, now])
  const canSubmit = () =>
    !inherited?.refreshing &&
    (!watched ||
      (!!bout &&
        binding === initial.current?.binding &&
        (!inherited || inherited.ticket.binding === binding) &&
        sportsViewNow() < closeTime &&
        ufcCanBet(bout, sportsViewNow()) &&
        bout.answers.some((a) => a.answerId === answerId)))
  const sportsTicket =
    inherited ??
    (binding
      ? {
          ticket: { binding, closeTime },
          onInvalid: undefined,
          onRestingOrder: undefined,
        }
      : undefined)
  return {
    sportsTicket,
    canSubmit,
    unavailable: watched && !inherited?.refreshing && !canSubmit(),
  }
}
