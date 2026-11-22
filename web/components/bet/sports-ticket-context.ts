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
import { readSportsContract } from 'web/lib/read-sports-contract'

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
  const enabled = isSportsBdlEnabled()
  const watched = enabled && isOfficialUfcWinnerMarket(contract)
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
  if (!enabled || initial.current?.id !== contract.id)
    initial.current = undefined
  if (watched) {
    if (!initial.current)
      initial.current = {
        id: contract.id,
        binding,
        closeTime: contract.closeTime ?? 0,
      }
    else {
      if (initial.current.binding == null && binding)
        initial.current.binding = binding
      initial.current.closeTime = Math.min(
        initial.current.closeTime,
        contract.closeTime ?? 0
      )
    }
  }
  const guarded = !!initial.current
  const [refusal, setRefusal] = useState<{
    id: string
    request: number
    verifiedAt?: number
    curve?: string
  }>()
  const reads = useRef(0)
  useEffect(
    () => () => {
      reads.current++
    },
    [contract.id]
  )
  const curves = (c: MarketContract) =>
    isMultiCpmm(c) && Array.isArray(c.answers)
      ? JSON.stringify(
          [...c.answers]
            .sort((a, b) => a.index - b.index)
            .map((a) => [a.id, a.poolYes, a.poolNo, a.p, a.prob])
        )
      : undefined
  const invalid = () => {
    if (inherited) {
      inherited.onInvalid?.()
      return
    }
    if (!bout) return
    const id = contract.id,
      request = ++reads.current
    setRefusal({ id, request })
    void readSportsContract(id, bout)
      .then((c) => {
        if (request !== reads.current || !c) return
        const updated = toUfcMarketBout(c, c.answers)
        if (updated)
          setRefusal({
            id,
            request,
            verifiedAt: updated.observedAt,
            curve: curves(c),
          })
      })
      .catch(() => {
        /* A failed re-read keeps the ticket unavailable. */
      })
  }
  const blocked =
    guarded &&
    refusal?.id === contract.id &&
    (refusal.verifiedAt == null ||
      !bout ||
      bout.observedAt < refusal.verifiedAt ||
      curves(contract) !== refusal.curve)
  const closeTime = Math.min(
    initial.current?.closeTime ?? Infinity,
    bout ? ufcObservationEnd(bout) : Infinity,
    inherited?.ticket.closeTime ?? Infinity
  )
  const [, tick] = useState(0)
  const now = sportsViewNow()
  useEffect(() => {
    if (!guarded || !Number.isFinite(closeTime) || now >= closeTime) return
    const timer = setTimeout(
      () => tick((n) => n + 1),
      Math.min(2147483647, Math.max(0, closeTime - sportsViewNow()))
    )
    return () => clearTimeout(timer)
  }, [guarded, closeTime, now])
  const canSubmit = () =>
    !inherited?.refreshing &&
    !blocked &&
    (!guarded ||
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
          onInvalid: invalid,
          onRestingOrder: undefined,
        }
      : undefined)
  return {
    sportsTicket,
    canSubmit,
    retryRefusal: blocked ? invalid : undefined,
    unavailable: guarded && !inherited?.refreshing && !canSubmit(),
  }
}
