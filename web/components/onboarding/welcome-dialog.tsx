import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { BinaryContract } from 'common/contract'
import type { User } from 'common/user'
import { getWelcomeSteps } from 'common/welcome-flow'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import {
  hasPendingBet,
  isInSignedOutBetTest,
  markWelcomeFinished,
} from 'web/lib/util/signed-out-bet'
import { WelcomeIntro } from './welcome-intro'

const loadFirstBet = () => import('./welcome-first-bet')
const WelcomeFirstBet = dynamic(loadFirstBet, {
  ssr: false,
  loading: () => <p role="status">Loading markets…</p>,
})
type Outcome = 'bet' | 'skipped' | 'no-markets' | 'no-first-bet-step'

export default function WelcomeDialog({
  user,
  pathname,
  onContractPage,
}: {
  user: User
  pathname: string
  onContractPage: boolean
}) {
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<'intro' | 'first-bet'>('intro')
  const [pendingBet] = useState(hasPendingBet)
  const [inSignedOutBetTest] = useState(() =>
    isInSignedOutBetTest(user.createdTime)
  )
  const firstBetStep = getWelcomeSteps({
    onContractPage,
    hasPendingBet: pendingBet,
    inSignedOutBetTest,
  }).includes('first-bet')
  const followedTopics = useRef(new Set<string>())
  const [marketsByTopic, setMarketsByTopic] = useState<
    Partial<Record<string, BinaryContract[]>>
  >({})
  const [saving, setSaving] = useState(false)
  const [retryOutcome, setRetryOutcome] = useState<Outcome>()
  const finishing = useRef(false)
  const landed = useRef(false)

  useEffect(() => {
    if (!landed.current) {
      landed.current = true
      track('welcome screen: landed', {
        flow: 'v2',
        page: pathname,
        firstBetStep,
      })
    }
    if (firstBetStep) void loadFirstBet().catch(console.error)
  }, [firstBetStep, pathname])

  const finish = useCallback(
    async (outcome: Outcome) => {
      if (finishing.current) return
      finishing.current = true
      setSaving(true)
      try {
        await api('me/update', { shouldShowWelcome: false })
        track('welcome screen: complete', { flow: 'v2', outcome })
        setOpen(false)
        markWelcomeFinished(user.id)
      } catch (error) {
        console.error('Could not finish onboarding', error)
        setRetryOutcome(outcome)
        finishing.current = false
        setSaving(false)
      }
    },
    [user.id]
  )

  const onNext = async () => {
    if (!firstBetStep) return finish('no-first-bet-step')
    try {
      await loadFirstBet()
    } catch (error) {
      console.error('Could not open the first prediction step', error)
      return finish('no-markets')
    }
    track('welcome screen: first bet')
    setStep('first-bet')
  }
  const saveMarkets = useCallback(
    (topic: string, markets: BinaryContract[]) =>
      setMarketsByTopic((previous) => ({ ...previous, [topic]: markets })),
    []
  )

  return (
    <Modal
      open={open}
      adaptToKeyboard
      closeButtonPosition="inside"
      ariaLabel={
        step === 'intro' ? 'Welcome to Manifold!' : 'Make your first prediction'
      }
    >
      <fieldset
        disabled={saving && !retryOutcome}
        className="bg-canvas-0 text-ink-1000 flex max-h-[calc(var(--modal-viewport-height,100dvh)-var(--modal-top-spacing))] min-w-0 flex-col gap-4 rounded-md p-4 sm:p-6"
      >
        {retryOutcome ? (
          <>
            <p role="alert">
              Your signup steps couldn't be saved. Try again to finish.
            </p>
            <Button
              className="self-end"
              loading={saving}
              onClick={() => finish(retryOutcome)}
            >
              Try again
            </Button>
          </>
        ) : (
          <>
            <div
              className={step === 'intro' ? 'flex min-h-0 flex-col' : 'hidden'}
            >
              <WelcomeIntro
                user={user}
                onNext={onNext}
                nextLabel={firstBetStep ? 'Next' : 'Done'}
              />
            </div>
            {step === 'first-bet' && (
              <>
                <WelcomeFirstBet
                  user={user}
                  marketsByTopic={marketsByTopic}
                  saveMarkets={saveMarkets}
                  followedTopics={followedTopics.current}
                  finish={finish}
                />
                <div className="border-ink-200 flex shrink-0 justify-end border-t pt-3">
                  <Button
                    color="gray-outline"
                    disabled={saving}
                    onClick={() => finish('skipped')}
                  >
                    Skip for now
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </fieldset>
    </Modal>
  )
}
