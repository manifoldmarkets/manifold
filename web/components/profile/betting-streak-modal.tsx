import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
} from 'common/economy'
import { formatMoney } from 'common/util/format'

export function BettingStreakModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { isOpen, setOpen } = props

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="items-center gap-4 rounded-md bg-white px-8 py-6">
        <span className={'text-8xl'}>🔥</span>
        <span className="text-xl">Daily betting streaks</span>
        <Col className={'gap-2'}>
          <span className={'text-indigo-700'}>• What are they?</span>
          <span className={'ml-2'}>
            You get {formatMoney(BETTING_STREAK_BONUS_AMOUNT)} more for each day
            of consecutive betting up to {formatMoney(BETTING_STREAK_BONUS_MAX)}
            . The more days you bet in a row, the more you earn!
          </span>
          <span className={'text-indigo-700'}>
            • Where can I check my streak?
          </span>
          <span className={'ml-2'}>
            You can see your current streak on the top right of your profile
            page.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
