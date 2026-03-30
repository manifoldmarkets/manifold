import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Button } from 'web/components/buttons/button'

import { useEffect } from 'react'
import { useUser } from 'web/hooks/use-user'
import { StreakProgressBar } from './streak-progress-bar'
import { updateUser } from 'web/lib/api/api'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { getBenefit } from 'common/supporter-config'

const START = 1744135118428 // 2025-04-08
export function FirstStreakModalManager() {
  const [open, setOpen] = usePersistentInMemoryState(false, 'seen-streak-modal')
  const user = useUser()

  useEffect(() => {
    if (
      user?.currentBettingStreak === 1 &&
      !user?.seenStreakModal &&
      user?.createdTime > START
    ) {
      setOpen(true)
      updateUser({
        seenStreakModal: true,
      })
    }
  }, [user?.currentBettingStreak])

  const questMultiplier = getBenefit(user?.entitlements, 'questMultiplier')

  return (
    <BettingStreakProgressModal
      open={open}
      setOpen={setOpen}
      currentStreak={user?.currentBettingStreak ?? 0}
      questMultiplier={questMultiplier}
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
            questMultiplier={questMultiplier}
          />
        </div>

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
