import { PendingBet, shouldWaitForWelcome } from 'common/signed-out-bet'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { useUser } from 'web/hooks/use-user'
import {
  getSignedOutBetVersion,
  getWelcomeState,
  subscribeSignedOutBet,
  takePendingBet,
} from 'web/lib/util/signed-out-bet'
import type { ResumedBetDialog } from './resumed-bet-dialog'

// A signed-out visitor pressed a bet button on a list row or a card, which
// could only send them to sign in. Once they are signed in, and past the
// welcome steps where a page runs them, open the ticket they asked for.
export function ResumePendingBet() {
  const user = useUser()
  const version = useSyncExternalStore(
    subscribeSignedOutBet,
    getSignedOutBetVersion,
    () => 0
  )
  // A taken bet belongs to the account that was signed in when it was taken.
  const [held, setHeld] = useState<{ bet: PendingBet; userId: string }>()
  // Only a visitor who comes back from sign-in with a bet in hand needs the
  // trade ticket, so it is fetched then and stays out of every page's bundle.
  const [Dialog, setDialog] = useState<typeof ResumedBetDialog>()
  // False for the first render. By the second, every component on the page
  // has run its mount effects, so a welcome flow further down has reported in
  // before a bet can be taken.
  const [settled, setSettled] = useState(false)
  useEffect(() => setSettled(true), [])

  const userId = user?.id
  const waiting = shouldWaitForWelcome({
    shouldShowWelcome: user?.shouldShowWelcome,
    ...getWelcomeState(userId),
  })

  useEffect(() => {
    if (!settled || !userId || waiting) return
    const bet = takePendingBet()
    if (!bet) return
    setHeld({ bet, userId })
    import('./resumed-bet-dialog').then(
      (m) => setDialog(() => m.ResumedBetDialog),
      // A ticket that fails to load is not worth an error: the market is
      // still one tap away.
      () => setHeld((current) => (current?.bet === bet ? undefined : current))
    )
  }, [settled, userId, waiting, version])

  // Another account signing in on this tab must not inherit the ticket.
  useEffect(() => {
    if (held && held.userId !== userId) setHeld(undefined)
  }, [held, userId])

  // `waiting` is checked again here in case a welcome flow reports in after
  // the bet was taken: the ticket then stays hidden until the steps are done.
  if (!held || held.userId !== userId || !Dialog || waiting) return null
  return <Dialog bet={held.bet} onDone={() => setHeld(undefined)} />
}
