import { useEffect, useState, useSyncExternalStore } from 'react'
import { Contract } from 'common/contract'
import { NextMarketPromptVariant } from 'common/next-market-prompt'

export type LastPageBet = {
  contractId: string
  betId?: string
  amount: number
  outcome?: string
  answerId?: string
  token: Contract['token']
  time: number
}

// The bet panel records the last bet placed on a market page here, and the
// contract page renders the next-market prompt from it. A plain external
// store so both sides re-render without threading props through the panel.
let lastPageBet: LastPageBet | undefined
const listeners = new Set<() => void>()

export const setLastPageBet = (bet: LastPageBet | undefined) => {
  lastPageBet = bet
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useLastPageBet = () =>
  useSyncExternalStore(
    subscribe,
    () => lastPageBet,
    () => undefined
  )

export const NEXT_MARKET_PROMPT_QUERY_PARAM = 'nextMarketPrompt'
const OVERRIDE_STORAGE_KEY = 'next-market-prompt-override'

const parseVariant = (
  value: string | null | undefined
): NextMarketPromptVariant | undefined =>
  value === 'control' || value === 'treatment' ? value : undefined

/**
 * QA override for the A/B assignment. Visiting any page with
 * `?nextMarketPrompt=treatment` (or `control`) pins this browser to that arm;
 * `?nextMarketPrompt=off` clears it. Overridden assignments are tracked as
 * forced, so the analysis excludes them.
 */
export const useNextMarketPromptOverride = () => {
  const [state, setState] = useState<{
    ready: boolean
    override?: NextMarketPromptVariant
  }>({ ready: false })

  useEffect(() => {
    let override: NextMarketPromptVariant | undefined
    try {
      const param = new URLSearchParams(window.location.search).get(
        NEXT_MARKET_PROMPT_QUERY_PARAM
      )
      if (param === 'off') {
        window.localStorage.removeItem(OVERRIDE_STORAGE_KEY)
      } else if (parseVariant(param)) {
        window.localStorage.setItem(OVERRIDE_STORAGE_KEY, param as string)
      }
      override = parseVariant(window.localStorage.getItem(OVERRIDE_STORAGE_KEY))
    } catch {
      override = undefined
    }
    setState({ ready: true, override })
  }, [])

  return state
}
