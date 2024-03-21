import { sumBy, uniqBy } from 'lodash'
import clsx from 'clsx'
import { GoGoal } from 'react-icons/go'
import Link from 'next/link'

import { useLeagueInfo } from 'web/hooks/use-leagues'
import { formatMoney } from 'common/util/format'
import { ProgressBar } from 'web/components/progress-bar'
import { useRemainingNewUserSignupBonuses } from 'web/hooks/use-request-new-user-signup-bonus'
import { useBets } from 'web/hooks/use-bets-supabase'
import {
  DAYS_TO_USE_FREE_QUESTIONS,
  User,
  freeQuestionRemaining,
} from 'common/user'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { Bet } from 'common/bet'
import { ReactNode } from 'react'
import { InfoTooltip } from '../widgets/info-tooltip'
import { CreateQuestionButton } from '../buttons/create-question-button'
import { simpleFromNow } from 'web/lib/util/shortenedFromNow'
import { DAY_MS } from 'common/util/time'
import { Button } from '../buttons/button'

export const NewUserGoals = (props: { user: User }) => {
  const { user } = props
  const remainingViewBonuses = useRemainingNewUserSignupBonuses()

  const bets = useBets({ userId: user.id, limit: 100, order: 'desc' })
  const { rows } = useSubscription('contract_bets', {
    k: 'user_id',
    v: user.id,
  })
  const liveBets = rows?.map((r) => r.data as Bet)
  const combinedBets = uniqBy(
    [...(bets ?? []), ...(liveBets ?? [])],
    (b) => b.id
  )
  const amountBet = sumBy(combinedBets, (b) => (b.amount > 0 ? b.amount : 0))

  const leagueInfo = useLeagueInfo(user.id)
  if (remainingViewBonuses === undefined) {
    return null
  }
  if (remainingViewBonuses > 0) {
    return (
      <ProgressDisplay
        className="w-full"
        label="Goal 1"
        value={10 - remainingViewBonuses}
        goal={10}
        description="questions visited"
      >
        <div className="text-ink-600 text-lg">
          Earn {formatMoney(100)} per question visited
        </div>
      </ProgressDisplay>
    )
  }

  if (bets === undefined) {
    return null
  }

  const goalAmountBet = 250
  if (amountBet < goalAmountBet) {
    return (
      <ProgressDisplay
        className="w-full"
        label="Goal 2"
        value={amountBet}
        goal={goalAmountBet}
        format={formatMoney}
        description="bet"
      />
    )
  }

  if (leagueInfo === undefined) {
    return null
  }

  const manaEarned = leagueInfo?.mana_earned ?? 0
  const manaEarnedGoal = 100

  if (manaEarned < manaEarnedGoal) {
    return (
      <ProgressDisplay
        className="w-full"
        label="Goal 3"
        value={manaEarned}
        goal={manaEarnedGoal}
        format={formatMoney}
        description={
          <>
            mana earned{' '}
            <InfoTooltip
              text="Earn mana from betting, creating questions, and referring users."
              tooltipParams={{ placement: 'bottom' }}
            />
          </>
        }
      >
        <Link href="/browse/for-you?s=newest" className="w-full">
          <Button className="mt-2 w-full" size="xs">
            Find profit in new markets
          </Button>
        </Link>
      </ProgressDisplay>
    )
  }

  const remaining = freeQuestionRemaining(
    user?.freeQuestionsCreated,
    user?.createdTime
  )
  const questionsCreated = user.freeQuestionsCreated ?? 0
  const questionsCreatedGoal = 3
  if (questionsCreated < questionsCreatedGoal) {
    return (
      <ProgressDisplay
        className="w-full"
        label="Goal 4"
        value={questionsCreated}
        goal={questionsCreatedGoal}
        description={<>questions created</>}
      >
        <Row className="mt-2 gap-x-1">
          🎉 You've got {remaining} free questions!
          <span>
            Expires in{' '}
            {simpleFromNow(
              user.createdTime + DAY_MS * DAYS_TO_USE_FREE_QUESTIONS
            )}
          </span>
        </Row>
        <CreateQuestionButton color="indigo" size="xs" />
      </ProgressDisplay>
    )
  }
  return null
}

const ProgressDisplay = (props: {
  label: string
  value: number
  goal: number
  description: ReactNode
  format?: (value: number) => string
  children?: ReactNode
  className?: string
}) => {
  const {
    label,
    value,
    goal,
    description,
    format = (x: number) => x.toString(),
    children,
    className,
  } = props
  return (
    <Col
      className={clsx('gap-3 rounded-md bg-indigo-100 px-4 py-3', className)}
    >
      <Row className="items-center gap-2 text-xl">
        <GoGoal className="text-2xl text-indigo-800" />
        {label}
      </Row>
      <Row className="items-center justify-between gap-4">
        <div className="flex-shrink-0 text-lg">
          <span className="">
            {format(value)} of {format(goal)}
          </span>{' '}
          {description}
        </div>
      </Row>
      <ProgressBar className="mb-1" value={value / goal} max={1} />
      {children}
    </Col>
  )
}
