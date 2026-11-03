import { useEffect, useRef, useState } from 'react'

import { Bet } from 'common/bet'
import { run } from 'common/supabase/utils'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { BoardPosition, positionKey } from './election-board-model'

const CHUNK = 100
// Metrics are written with the bet; a moment's grace before re-reading.
const AFTER_BET_MS = 1500

type Row = {
  contract_id: string
  answer_id: string | null
  has_shares: boolean | null
  profit: number | null
  payout: number | null
  last_bet_time: number | null
}

async function fetchBoardPositions(userId: string, ids: string[]) {
  const out = new Map<string, BoardPosition>()
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const { data } = await run(
      db
        .from('user_contract_metrics')
        .select(
          'contract_id, answer_id, has_shares, profit, payout:data->payout, last_bet_time:data->lastBetTime'
        )
        .eq('user_id', userId)
        .in('contract_id', ids.slice(offset, offset + CHUNK))
    )
    for (const row of data as unknown as Row[]) {
      out.set(positionKey(row.contract_id, row.answer_id), {
        hasShares: !!row.has_shares,
        payout: Number(row.payout ?? 0),
        profit: Number(row.profit ?? 0),
        lastBetTime: Number(row.last_bet_time ?? 0),
      })
    }
  }
  return out
}

// The signed-in account's positions on the board's markets: every market it
// has traded, keyed by market (the whole-market summary) and by answer.
// Re-read when the tab regains focus and shortly after the account bets on
// one of these markets anywhere (the global bet stream says so).
export function useBoardPositions(contractIds: string[]) {
  const user = useUser()
  const userId = user?.id
  const idsKey = JSON.stringify([...new Set(contractIds)].sort())
  const [state, setState] = useState<{
    userId: string | undefined
    positions: Map<string, BoardPosition>
  }>({ userId, positions: new Map() })
  const requests = useRef(0)

  const refresh = useEvent(async () => {
    const request = ++requests.current
    if (!userId) {
      setState({ userId, positions: new Map() })
      return
    }
    try {
      const positions = await fetchBoardPositions(userId, JSON.parse(idsKey))
      if (request === requests.current) setState({ userId, positions })
    } catch (e) {
      console.error('Failed to load TV board positions', e)
    }
  })

  useEffect(() => {
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      requests.current++
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, idsKey, refresh])

  const ids = useRef(new Set<string>())
  ids.current = new Set(JSON.parse(idsKey) as string[])
  const pending = useRef<ReturnType<typeof setTimeout>>()
  useApiSubscription({
    topics: ['global/new-bet'],
    enabled: !!userId,
    onBroadcast: (msg) => {
      const bets = (msg.data.bets ?? []) as Bet[]
      const mine = bets.some(
        (b) => b.userId === userId && ids.current.has(b.contractId)
      )
      if (!mine) return
      clearTimeout(pending.current)
      pending.current = setTimeout(() => void refresh(), AFTER_BET_MS)
    },
  })
  useEffect(() => () => clearTimeout(pending.current), [])

  return state.userId === userId ? state.positions : new Map()
}
