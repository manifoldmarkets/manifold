import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
} from 'common/economy'
import { formatMoney } from 'common/util/format'
import { humanish, User } from 'common/user'
import { getBenefit } from 'common/supporter-config'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import clsx from 'clsx'
import { VerifyPhoneNumberBanner } from 'web/components/user/verify-phone-number-banner'

// Initialize dayjs plugins
dayjs.extend(utc)
dayjs.extend(timezone)

export function BettingStreakModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
  currentUser: User | null | undefined
}) {
  const { isOpen, setOpen, currentUser } = props
  const missingStreak = currentUser && !hasCompletedStreakToday(currentUser)

  // Get quest multiplier from membership tier (1x for non-supporters)
  const questMultiplier = getBenefit(currentUser?.entitlements, 'questMultiplier')
  const bonusAmount = Math.floor(BETTING_STREAK_BONUS_AMOUNT * questMultiplier)
  const bonusMax = Math.floor(BETTING_STREAK_BONUS_MAX * questMultiplier)

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="bg-canvas-0 text-ink-1000 items-center gap-4 rounded-md px-8 py-6">
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
        <VerifyPhoneNumberBanner user={currentUser} />
        <Col className={'gap-2'}>
          <span className={'text-primary-700'}>• What are they?</span>
          <span className={'ml-2'}>
            {currentUser && !humanish(currentUser) ? (
              <span className={'font-semibold'}>Verified users</span>
            ) : (
              'You'
            )}{' '}
            get {formatMoney(bonusAmount)} for each consecutive
            day of predicting, up to {formatMoney(bonusMax)}.
            The more days you predict in a row, the more you earn!
            {questMultiplier > 1 && (
              <span className="text-primary-600"> ({questMultiplier}x membership bonus!)</span>
            )}
          </span>
          <span className={'text-primary-700'}>
            • Can I save my streak if I forget?
          </span>
          <span className={'ml-2'}>
            Streak freezes protect your streak from resetting. You can purchase
            them in the shop.
            {currentUser && (currentUser.streakForgiveness ?? 0) > 0 && (
              <span>
                {' '}
                Right now you have
                <span className={'mx-1 font-bold'}>
                  {currentUser.streakForgiveness}
                </span>
                available.
              </span>
            )}
          </span>
        </Col>
      </Col>
    </Modal>
  )
}

export function hasCompletedStreakToday(user: User) {
  if (user.currentBettingStreak === 0) return false

  // Get current time in Pacific
  const now = dayjs().tz('America/Los_Angeles')

  // Get today's reset time (midnight Pacific)
  const todayResetTime = now.startOf('day')

  // Get yesterday's reset time
  const yesterdayResetTime = todayResetTime.subtract(1, 'day')

  // Use yesterday's reset time if we haven't hit today's yet
  const resetTime = now.isBefore(todayResetTime)
    ? yesterdayResetTime
    : todayResetTime

  return (user?.lastBetTime ?? 0) > resetTime.valueOf()
}
