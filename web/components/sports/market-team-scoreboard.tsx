import dynamic from 'next/dynamic'
import { getMainBinaryMCAnswer, isMultiCpmm } from 'common/contract'
import { canBetOnScheduledGame } from 'common/sports-game-feed'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useEffect, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import type { MultiContract, Sports } from 'common/contract'
import {
  applySportsLive,
  decodeSportsScoreTick,
  newerSportsScoreTick,
  type SportsScoreTick,
} from 'common/sports-schedule-live'
import { MINUTE_MS } from 'common/util/time'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { api } from 'web/lib/api/api'
import {
  marketScoreSnapshot,
  newerMarketScore,
  recoverMarketScore,
  type MarketScoreSnapshot,
} from './market-score-recovery'
import { TeamScoreboard } from './team-scoreboard'

const MarketBetDialog = dynamic(
  () =>
    import('web/components/bet/bet-dialog').then((mod) => mod.MultiBetDialog),
  { ssr: false }
)

export function MarketTeamScoreboard({
  contract,
}: {
  contract: MultiContract & Sports
}) {
  const user = useUser()
  const [selectedAnswer, setSelectedAnswer] = useState<string>()
  const { id } = contract
  const current = marketScoreSnapshot(id, contract, Date.now())
  const isVisible = useIsPageVisible()
  const [read, setRead] = useState<MarketScoreSnapshot>()
  const [score, setScore] = useState<SportsScoreTick>()
  const game = recoverMarketScore(current, read)
  const canRead = isVisible && !!game && !game.isResolved

  useEffect(() => {
    if (!canRead) return
    let pending: AbortController | undefined
    const refresh = async () => {
      if (document.hidden || navigator.onLine === false || pending) return
      const request = new AbortController()
      pending = request
      const timeout = window.setTimeout(() => request.abort(), 15_000)
      try {
        const rows = await api(
          'markets-by-ids',
          { ids: [id] },
          { cache: 'no-store', signal: request.signal }
        )
        if (request.signal.aborted || document.hidden) return
        const snapshot = marketScoreSnapshot(
          id,
          rows.find((row) => row.id === id),
          Date.now()
        )
        setRead((previous) =>
          previous ? newerMarketScore(previous, snapshot) : snapshot
        )
      } catch {
        // Keep the last observation; the next visible refresh can recover it.
      } finally {
        window.clearTimeout(timeout)
        pending = undefined
      }
    }
    const online = () => {
      void refresh()
    }
    window.addEventListener('online', online)
    // A socket can reconnect without a browser online event. Its channel does
    // not replay missed ticks, including a final that will never be broadcast again.
    const timer = window.setInterval(online, 2 * MINUTE_MS)
    return () => {
      window.removeEventListener('online', online)
      window.clearInterval(timer)
      pending?.abort()
    }
  }, [canRead, id])
  useApiSubscription({
    enabled: canRead,
    topics: [`contract/${id}/sports-live`],
    onBroadcast: ({ data }) => {
      const tick = decodeSportsScoreTick(data)
      if (tick) setScore((previous) => newerSportsScoreTick(previous, tick))
    },
  })
  if (!game) return null
  const view = applySportsLive(game, { liveScore: score })
  const mainAnswer = getMainBinaryMCAnswer(contract)
  const tradable = !!mainAnswer && canBetOnScheduledGame(view, Date.now())
  const select = (id: string) => {
    if (
      !canBetOnScheduledGame(view, Date.now()) ||
      !contract.answers.some((answer) => answer.id === id)
    )
      return
    if (!user) {
      firebaseLogin()
      return
    }
    setSelectedAnswer(id)
  }
  const selected = contract.answers.find(
    (answer) => answer.id === selectedAnswer
  )
  return (
    <>
      <TeamScoreboard game={view} onBet={tradable ? select : undefined} />
      {tradable && isMultiCpmm(contract) && selected && (
        <MarketBetDialog
          contract={contract}
          open
          setOpen={(open) => {
            if (!open) setSelectedAnswer(undefined)
          }}
          initialOutcome={selected.id === mainAnswer.id ? 'YES' : 'NO'}
          trackingLocation="sports market scoreboard"
        />
      )}
    </>
  )
}
