import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import { Page } from 'web/components/layout/page'
import { postMessageToNative } from 'web/components/native-message-listener'
import { SwipeCard } from 'web/components/swipe/swipe-card'
import { STARTING_BET_AMOUNT } from 'web/components/swipe/swipe-helpers'
import { SiteLink } from 'web/components/widgets/site-link'
import { useFeed } from 'web/hooks/use-feed'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { logView } from 'web/lib/firebase/views'
import { track } from 'web/lib/service/analytics'
import { placeBet } from 'web/lib/firebase/api'
import { formatMoney } from 'common/util/format'
import { useEvent } from 'web/hooks/use-event'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { BinaryContract } from 'common/contract'

export default function Scroll() {
  useTracking('view scroll page')
  useRedirectIfSignedOut()

  const user = useUser()
  const { contracts, loadMore } = useFeed(user, 'swipe')

  const [amount, setAmount] = useState(STARTING_BET_AMOUNT)
  const [betDirection, setBetDirection] = useState<'YES' | 'NO' | undefined>()
  const [betStatus, setBetStatus] = useState<
    'loading' | 'success' | string | undefined
  >(undefined)

  useEffect(() => {
    postMessageToNative('onPageVisit', { page: 'scroll' })
    return () => {
      postMessageToNative('onPageVisit', { page: undefined })
    }
  }, [])

  const onBet = useEvent(
    (contract: BinaryContract) => (outcome: 'YES' | 'NO') => {
      if (!contract) return

      setBetStatus('loading')

      const contractId = contract.id
      const promise = placeBet({ amount, outcome, contractId })
      promise
        .then(() => {
          setBetStatus('success')
        })
        .catch(() => {
          setBetStatus(undefined)
          setBetDirection(undefined)
        })

      const shortQ = contract.question.slice(0, 18)
      const message = `Bet ${formatMoney(amount)} ${outcome} on "${shortQ}"...`

      toast.promise(
        promise,
        {
          loading: message,
          success: message,
          error: (err) => `Error placing bet: ${err.message}`,
        },
        { position: 'top-center' }
      )

      if (user) logView({ amount, outcome, contractId, userId: user.id })
      track('scroll bet', {
        slug: contract.slug,
        contractId,
        amount,
        outcome,
      })
    }
  )

  if (user === undefined || contracts === undefined) {
    return (
      <Page>
        <LoadingIndicator className="mt-6" />
      </Page>
    )
  }
  // Show log in prompt if user not logged in.
  if (user === null) {
    return (
      <Page>
        <div className="flex h-screen w-screen items-center justify-center">
          <Button onClick={firebaseLogin} color="gradient" size="2xl">
            Log in to use Manifold
          </Button>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <Col className="w-full max-w-lg gap-0.5">
        {contracts.map((c) => (
          <SwipeCard
            key={c.id}
            amount={amount}
            setAmount={setAmount}
            contract={c}
            betDirection={betDirection}
            betStatus={betStatus}
            onBet={onBet(c)}
            setIsModalOpen={() => {}}
            cardHeight={700}
            user={user}
            small
          />
        ))}

        <VisibilityObserver
          onVisibilityUpdated={(visible) => visible && loadMore()}
        />

        {!contracts.length && (
          <div className="flex w-full flex-col items-center justify-center">
            We're fresh out of cards!
            <SiteLink
              href="/markets?s=newest&f=open"
              className="text-indigo-700"
            >
              Browse new markets
            </SiteLink>
          </div>
        )}
      </Col>
    </Page>
  )
}
