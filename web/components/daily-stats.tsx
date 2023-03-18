import React, { useEffect, useState } from 'react'
import Router from 'next/router'
import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { hasCompletedStreakToday } from 'web/components/profile/betting-streak-modal'
import { LoansModal } from 'web/components/profile/loans-modal'
import { Tooltip } from 'web/components/widgets/tooltip'
import { DailyProfit } from 'web/components/daily-profit'
import { QUEST_DETAILS, QUEST_TYPES } from 'common/quest'
import { Modal } from 'web/components/layout/modal'
import { Title } from 'web/components/widgets/title'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
} from 'common/economy'
import { ProgressBar } from 'web/components/progress-bar'
import { useHasSeen } from 'web/hooks/use-has-seen'
import { track } from 'web/lib/service/analytics'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { sum } from 'lodash'
import { filterDefined } from 'common/util/array'
import { completeQuest } from 'web/lib/firebase/api'
import { useIsAuthorized } from 'web/hooks/use-user'
const MS_TO_STOP_CHECKING = 1679378400000
export const dailyStatsClass = 'text-lg py-1'
export const unseenDailyStatsClass =
  'px-1.5 text-blue-600 shadow shadow-blue-700 transition-colors transition-all hover:from-blue-400 hover:via-blue-100 hover:to-blue-200 enabled:bg-gradient-to-tr'
const QUEST_STATS_CLICK_EVENT = 'click quest stats button'
export function DailyStats(props: {
  user: User | null | undefined
  showLoans?: boolean
}) {
  const { user, showLoans } = props
  const authorized = useIsAuthorized()
  const [seenToday, setSeenToday] = useHasSeen(
    user,
    [QUEST_STATS_CLICK_EVENT],
    'week'
  )
  const [showLoansModal, setShowLoansModal] = useState(false)
  useEffect(() => {
    const showLoansModel = Router.query['show'] === 'loans'
    setShowLoansModal(showLoansModel)
  }, [])

  // We're just using this useEffect until the first real week starts, aka this Monday, 2023/03/21
  const { incompleteQuestTypes } = user
    ? getQuestCompletionStatus(user)
    : { incompleteQuestTypes: [] }
  useEffect(() => {
    if (
      incompleteQuestTypes.length === 0 ||
      !authorized ||
      Date.now() > MS_TO_STOP_CHECKING ||
      !user?.id
    )
      return
    Promise.all(
      incompleteQuestTypes.map(
        (questType) =>
          questType !== 'BETTING_STREAK' &&
          completeQuest({ questType }).catch((e) => {
            console.log('error completing quest', e)
          })
      )
    )
  }, [JSON.stringify(incompleteQuestTypes), authorized, user?.id])

  const [showQuestsModal, setShowQuestsModal] = useState(false)

  // hide daily stats if user created in last 24 hours
  const justCreated =
    (user?.createdTime ?? 0) > Date.now() - 1000 * 60 * 60 * 24

  if (justCreated || !user) return <></>
  const { allQuestsComplete, totalQuestsCompleted, totalQuests } =
    getQuestCompletionStatus(user)

  return (
    <Row className={'z-30 flex-shrink-0 items-center gap-4'}>
      <DailyProfit user={user} />

      {allQuestsComplete ? (
        <Col
          className="cursor-pointer"
          onClick={() => setShowQuestsModal(true)}
        >
          <Tooltip text={'Prediction streak'}>
            <Row
              className={clsx(
                dailyStatsClass,
                user && !hasCompletedStreakToday(user) && 'grayscale'
              )}
            >
              <span>🔥 {user?.currentBettingStreak ?? 0}</span>
            </Row>
          </Tooltip>
        </Col>
      ) : (
        <button
          className={clsx(
            'cursor-pointer rounded-md py-1',
            dailyStatsClass,
            seenToday ? '' : unseenDailyStatsClass
          )}
          onClick={() => {
            setShowQuestsModal(true)
            track(QUEST_STATS_CLICK_EVENT)
            setSeenToday(true)
          }}
        >
          <Tooltip text={'Your quests'}>
            <Row>
              <span>🧭 {`${totalQuestsCompleted}/${totalQuests}`}</span>
            </Row>
          </Tooltip>
        </button>
      )}
      {showLoans && (
        <Col
          className="flex cursor-pointer"
          onClick={() => setShowLoansModal(true)}
        >
          <Tooltip text={'Next loan'}>
            <Row
              className={clsx(
                dailyStatsClass,
                user && !hasCompletedStreakToday(user) && 'grayscale'
              )}
            >
              <span className="text-teal-500">
                🏦 {formatMoney(user?.nextLoanCached ?? 0)}
              </span>
            </Row>
          </Tooltip>
        </Col>
      )}
      {showLoansModal && (
        <LoansModal isOpen={showLoansModal} setOpen={setShowLoansModal} />
      )}
      {showQuestsModal && (
        <QuestsModal
          open={showQuestsModal}
          setOpen={setShowQuestsModal}
          user={user}
        />
      )}
    </Row>
  )
}

function QuestsModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  user: User
}) {
  const { open, setOpen, user } = props
  const { totalQuestsCompleted, totalQuests, questToCompletionStatus } =
    getQuestCompletionStatus(user)
  const streakStatus = questToCompletionStatus['BETTING_STREAK']
  const streakComplete = streakStatus.currentCount >= streakStatus.requiredCount
  const shareStatus = questToCompletionStatus['SHARES']
  const shareComplete = shareStatus.currentCount >= shareStatus.requiredCount
  const createStatus = questToCompletionStatus['MARKETS_CREATED']
  const createComplete = createStatus.currentCount >= createStatus.requiredCount

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <div className="bg-canvas-0 text-ink-1000 rounded-lg p-3">
        <Col className={'mb-6 items-center justify-center gap-2'}>
          <Title className={'!mb-1'}> Your Quests </Title>
          <span className="text-ink-700 text-sm">
            {`🧭 ${totalQuestsCompleted}/${totalQuests}`} completed
          </span>
          <ProgressBar
            color={'bg-indigo-500'}
            value={totalQuestsCompleted / totalQuests}
            max={1}
            className={'mb-1 w-1/2'}
          />
        </Col>
        <Col className={'mb-4 gap-6'}>
          <Row className={'text-primary-700 '}>Daily</Row>
          <QuestRow
            emoji={'🔥'}
            title={
              (user.currentBettingStreak ?? 0) > 0
                ? `Continue your ${user.currentBettingStreak}-day prediction streak`
                : 'Make a prediction once per day'
            }
            complete={streakComplete}
            status={`(${streakStatus.currentCount}/${streakStatus.requiredCount})`}
            reward={Math.min(
              BETTING_STREAK_BONUS_AMOUNT * (user.currentBettingStreak || 1),
              BETTING_STREAK_BONUS_MAX
            )}
          />
          <Row className={'text-primary-700'}>Weekly</Row>
          <QuestRow
            emoji={'📤'}
            title={`Share ${shareStatus.requiredCount} markets this week`}
            complete={shareComplete}
            status={`(${shareStatus.currentCount}/${shareStatus.requiredCount})`}
            reward={QUEST_DETAILS.SHARES.rewardAmount}
            info={
              'Share a market, comment, group, or your referral link with a friend!'
            }
          />
          <QuestRow
            emoji={'📈'}
            title={`Create ${createStatus.requiredCount} market this week`}
            complete={createComplete}
            status={`(${createStatus.currentCount}/${createStatus.requiredCount})`}
            reward={QUEST_DETAILS.MARKETS_CREATED.rewardAmount}
          />
        </Col>
      </div>
    </Modal>
  )
}
const QuestRow = (props: {
  emoji: string
  title: string
  complete: boolean
  status: string
  reward: number
  info?: string
}) => {
  const { title, complete, status, reward, emoji, info } = props
  return (
    <Row className={'justify-between'}>
      <Col>
        <Row className={'gap-4 sm:gap-6'}>
          <span className={clsx('text-4xl', complete ? '' : 'grayscale')}>
            {emoji}
          </span>
          <Col>
            <span className={clsx('sm:text-xl')}>
              {title}
              {info && (
                <InfoTooltip className={'!mb-1 ml-1 !h-4 !w-4'} text={info} />
              )}
            </span>
            <span
              className={clsx(
                'text-ink-500 text-sm',
                complete && 'text-indigo-500'
              )}
            >
              {complete ? 'Complete!' : status}
            </span>
          </Col>
        </Row>
      </Col>
      <Col className={''}>
        <span
          className={clsx(
            'text-lg sm:text-xl',
            complete ? 'text-teal-600' : 'text-ink-500'
          )}
        >
          +{formatMoney(reward)}
        </span>
      </Col>
    </Row>
  )
}

const getQuestCompletionStatus = (user: User) => {
  const questToCompletionStatus = Object.fromEntries(
    QUEST_TYPES.map((t) => [t, { requiredCount: 0, currentCount: 0 }])
  )

  for (const questType of QUEST_TYPES) {
    const questData = QUEST_DETAILS[questType]
    if (questType === 'BETTING_STREAK')
      questToCompletionStatus[questType] = {
        requiredCount: questData.requiredCount,
        currentCount: hasCompletedStreakToday(user) ? 1 : 0,
      }
    else
      questToCompletionStatus[questType] = {
        requiredCount: questData.requiredCount,
        currentCount: user[questData.userKey] ?? 0,
      }
  }
  const totalQuestsCompleted = sum(
    Object.values(questToCompletionStatus).map((v) =>
      v.currentCount >= v.requiredCount ? 1 : 0
    )
  )
  const incompleteQuestTypes = filterDefined(
    Object.entries(questToCompletionStatus).map(([k, v]) =>
      v.currentCount < v.requiredCount ? k : null
    )
  )

  const totalQuests = Object.keys(questToCompletionStatus).length
  const allQuestsComplete = totalQuestsCompleted === totalQuests

  return {
    questToCompletionStatus,
    totalQuestsCompleted,
    totalQuests,
    allQuestsComplete,
    incompleteQuestTypes,
  }
}
