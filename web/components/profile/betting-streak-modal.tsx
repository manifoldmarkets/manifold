import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  BETTING_STREAK_RESET_HOUR,
} from 'common/economy'
import { User } from 'common/user'
import dayjs from 'dayjs'
import clsx from 'clsx'
import { FormattedMana } from '../mana'

export function BettingStreakModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
  currentUser: User | null | undefined
}) {
  const { isOpen, setOpen, currentUser } = props
  const missingStreak = currentUser && !hasCompletedStreakToday(currentUser)

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="items-center gap-4 rounded-md bg-white px-8 py-6">
        <span
          className={clsx(
            'text-8xl',
            missingStreak ? 'grayscale' : 'grayscale-0'
          )}
        >
          🔥
        </span>
        {missingStreak && (
          <Col className={' gap-2 text-center'}>
            <span className={'font-bold'}>
              You haven't predicted yet today!
            </span>
            <span className={'ml-2'}>
              If the fire icon is gray, this means you haven't predicted yet
              today to get your streak bonus. Get out there and make a
              prediction!
            </span>
          </Col>
        )}
        <span className="text-xl">Daily prediction streaks</span>
        <Col className={'gap-2'}>
          <span className={'text-indigo-700'}>• What are they?</span>
          <span className={'ml-2'}>
            You get <FormattedMana amount={BETTING_STREAK_BONUS_AMOUNT} /> more
            for each day of consecutive predicting up to{' '}
            <FormattedMana amount={BETTING_STREAK_BONUS_MAX} />. The more days
            you predict in a row, the more you earn!
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

export function hasCompletedStreakToday(user: User) {
  const now = dayjs().utc()
  const utcTodayAtResetHour = now
    .hour(BETTING_STREAK_RESET_HOUR)
    .minute(0)
    .second(0)
  const utcYesterdayAtResetHour = utcTodayAtResetHour.subtract(1, 'day')
  let resetTime = utcTodayAtResetHour.valueOf()
  if (now.isBefore(utcTodayAtResetHour)) {
    resetTime = utcYesterdayAtResetHour.valueOf()
  }
  return (user?.lastBetTime ?? 0) > resetTime
}
