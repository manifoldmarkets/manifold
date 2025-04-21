import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { Button } from 'web/components/buttons/button'

import { useEffect } from 'react'
import { useUser } from 'web/hooks/use-user'
import { StreakProgressBar } from './streak-progress-bar'
import { updateUser } from 'web/lib/api/api'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'

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

  return (
    <BettingStreakProgressModal
      open={open}
      setOpen={setOpen}
      currentStreak={user?.currentBettingStreak ?? 0}
    />
  )
}
export function BettingStreakProgressModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  currentStreak: number
}) {
  const { open, setOpen, currentStreak } = props
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
          <StreakProgressBar currentStreak={currentStreak} />
        </div>

        <Button onClick={() => setOpen(false)} className="self-end">
          Got it
        </Button>
      </Col>
    </Modal>
  )
}
