import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Button } from 'web/components/buttons/button'

import { useEffect } from 'react'
import Link from 'next/link'
import { useUser } from 'web/hooks/use-user'
import { StreakProgressBar } from './streak-progress-bar'
import { updateUser } from 'web/lib/api/api'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { getEffectiveBonusMultiplier } from 'common/supporter-config'
import { getEffectiveTier } from 'common/user'

const START = 1744135118428 // 2025-04-08
export function FirstStreakModalManager() {
  const [open, setOpen] = usePersistentInMemoryState(false, 'seen-streak-modal')
  const user = useUser()

  useEffect(() => {
    if (
      user?.currentBettingStreak === 1 &&
      !user?.seenStreakModal &&
      // Don't interrupt onboarding: if the first bet happens inside the welcome
      // flow, defer this reveal until onboarding finishes (shouldShowWelcome
      // flips to false) so it doesn't stack on the welcome modal or flash the
      // reduced-bonus note before the user reaches the verify step.
      !user?.shouldShowWelcome &&
      user?.createdTime > START
    ) {
      setOpen(true)
      updateUser({
        seenStreakModal: true,
      })
    }
  }, [user?.currentBettingStreak, user?.shouldShowWelcome])

  const streakMultiplier = user
    ? getEffectiveBonusMultiplier(getEffectiveTier(user), 'streak')
    : 1

  return (
    <BettingStreakProgressModal
      open={open}
      setOpen={setOpen}
      currentStreak={user?.currentBettingStreak ?? 0}
      questMultiplier={streakMultiplier}
    />
  )
}
export function BettingStreakProgressModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  currentStreak: number
  questMultiplier?: number
}) {
  const { open, setOpen, currentStreak, questMultiplier = 1 } = props
  const user = useUser()
  const freezes = user?.streakForgiveness ?? 0
  const isUnverified = user && getEffectiveTier(user) === 'unverified'
  // For unverified users, show the *verified* bonuses (5/10/15/20/25) as the
  // aspirational target in the bar; the disclaimer below explains they
  // currently earn 20% of these. Other tiers see their actual amounts.
  const displayMultiplier = isUnverified ? 1 : questMultiplier
  return (
    <Modal open={open} setOpen={setOpen} size="md">
      <Col className="bg-canvas-0 rounded-md px-8 py-6">
        <Title className="!mt-0">You've started a Prediction Streak! 🔥</Title>
        <p className="text-ink-700 mb-4">
          Make at least one prediction each day (Pacific time) to build your
          streak.
        </p>
        <p className="text-ink-700 mb-2">
          Longer streaks earn bigger mana bonuses:
        </p>
        <div className="my-4">
          <StreakProgressBar
            currentStreak={currentStreak}
            questMultiplier={displayMultiplier}
          />
        </div>

        {isUnverified && (
          <p className="text-ink-600 mb-4 text-xs">
            Unverified accounts receive 20% of the streak bonus shown above.{' '}
            <Link
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
            >
              Verify or subscribe
            </Link>{' '}
            to unlock the full amount.
          </p>
        )}

        <Row className="w-full items-center justify-between">
          <Row className="text-ink-500 items-center gap-1.5 text-sm">
            <span>🧊</span>
            <span>
              {freezes > 0
                ? `${freezes} streak freeze${freezes === 1 ? '' : 's'} owned`
                : 'No streak freezes — buy more in the shop!'}
            </span>
          </Row>
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </Row>
      </Col>
    </Modal>
  )
}
