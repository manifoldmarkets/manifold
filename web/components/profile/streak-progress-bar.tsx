import clsx from 'clsx'
import { Col } from '../layout/col'
import { TokenNumber } from '../widgets/token-number'
import { BETTING_STREAK_BONUS_MAX } from 'common/economy'
import { range } from 'd3-array'
import { BETTING_STREAK_BONUS_AMOUNT } from 'common/economy'

export function StreakProgressBar(props: { currentStreak: number }) {
  const { currentStreak } = props
  const bonuses = range(1, 6).map((day) => ({
    day,
    amount: Math.min(
      BETTING_STREAK_BONUS_AMOUNT * day,
      BETTING_STREAK_BONUS_MAX
    ),
  }))
  const numDays = bonuses.length

  // Calculate progress: clamp between 0 and numDays
  const clampedStreak = Math.max(0, Math.min(currentStreak, numDays))
  const progressPercent = (clampedStreak / numDays) * 100

  return (
    <div className="relative mb-8 w-full pb-6">
      {/* Background track */}
      <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
      {/* Filled progress */}
      <div
        className="bg-primary-500 absolute top-0 h-2.5 rounded-full"
        style={{ width: `${progressPercent}%` }}
      />
      {/* Progress segments and labels */}
      <div className="absolute top-0 flex h-full w-full items-center justify-between px-1">
        {bonuses.map((bonus, index) => (
          <div
            key={bonus.day}
            className="relative flex flex-1 items-center justify-center"
            style={{ marginLeft: index === 0 ? '-2px' : '4px' }}
          >
            <Col
              className={clsx(
                'absolute top-full mt-1.5 items-center text-sm',
                // Highlight text if streak reached this day
                index < clampedStreak ? 'text-primary-700' : 'text-ink-500'
              )}
            >
              <span className="">
                {bonus.day === 5 ? `Day ${bonus.day}+` : `Day ${bonus.day}`}
              </span>
              <span
                className={clsx(
                  'font-semibold',
                  index < clampedStreak ? 'text-primary-700' : 'text-ink-700'
                )}
              >
                <TokenNumber amount={bonus.amount} coinType="mana" />
              </span>
            </Col>
          </div>
        ))}
      </div>
    </div>
  )
}
