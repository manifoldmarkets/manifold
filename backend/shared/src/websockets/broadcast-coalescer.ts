import { Bet } from 'common/bet'
import { metrics } from 'shared/utils'
import { broadcastMulti } from './server'

// Coalesces high-frequency `{ bets }` broadcasts (the new-bet feeds) into short
// per-topic windows. On a hot market this turns N per-bet fan-outs into ~1 per
// window per topic — the single-write-core event loop does far fewer
// JSON.stringify + ws.send passes. Safe because clients already apply a new-bet
// payload as a batch (a list of bets), so merging lists changes nothing
// semantically; it only delays delivery by at most the window.
//
// Gated by COALESCE_BET_BROADCASTS for staged rollout.
export const COALESCE_BET_BROADCASTS =
  process.env.COALESCE_BET_BROADCASTS === 'true'

const WINDOW_MS = Number(process.env.BET_BROADCAST_WINDOW_MS ?? 80)

const pending = new Map<string, Bet[]>() // topic -> accumulated bets
let timer: NodeJS.Timeout | undefined

export function coalesceBetsToTopics(topics: string[], bets: Bet[]) {
  if (bets.length === 0) return
  for (const topic of topics) {
    const acc = pending.get(topic)
    if (acc) acc.push(...bets)
    else pending.set(topic, bets.slice())
  }
  if (!timer) timer = setTimeout(flushBetBroadcasts, WINDOW_MS)
}

export function flushBetBroadcasts() {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  if (pending.size === 0) return
  const batches = [...pending.entries()]
  pending.clear()
  for (const [topic, bets] of batches) {
    broadcastMulti([topic], { bets })
    metrics.inc('ws/bet_broadcasts_coalesced')
  }
}
