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
  const [bet, setBet] = useState<PendingBet>()
  // Only a visitor who comes back from sign-in with a bet in hand needs the
  // trade ticket, so it is fetched then and stays out of every page's bundle.
  const [Dialog, setDialog] = useState<typeof ResumedBetDialog>()
  const userId = user?.id
  const waiting = shouldWaitForWelcome({
    shouldShowWelcome: user?.shouldShowWelcome,
    ...getWelcomeState(userId),
  })

  useEffect(() => {
    if (!userId || waiting) return
    const pending = takePendingBet()
    if (!pending) return
    setBet(pending)
    import('./resumed-bet-dialog').then(
      (m) => setDialog(() => m.ResumedBetDialog),
      // A ticket that fails to load is not worth an error: the market is
      // still one tap away.
      () => setBet(undefined)
    )
  }, [userId, waiting, version])

  if (!bet || !userId || !Dialog) return null
  return <Dialog bet={bet} onDone={() => setBet(undefined)} />
}
