import {
  BETTING_STREAK_BONUS_MAX,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { getSourceUrl, Notification } from 'common/notification'
import { formatMoney } from 'common/util/format'
import { groupBy } from 'lodash'
import { useState } from 'react'

import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { BettingStreakModal } from '../profile/betting-streak-modal'
import { LoansModal } from '../profile/loans-modal'
import {
  AvatarNotificationIcon,
  NotificationFrame,
  NotificationIcon,
  PrimaryNotificationLink,
  QuestionOrGroupLink,
} from './notification-helpers'
import {
  MarketResolvedNotification,
  MultipleAvatarIcons,
} from './notification-types'
import { QuestRewardTxn } from 'common/txn'
import { QUEST_DETAILS } from 'common/quest'
import { QuestsModal } from '../quests-or-streak'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Bet } from 'common/bet'
import { BetOutcomeLabel } from 'web/components/outcome-label'
import { outcomeType } from 'common/contract'

// Loop through the contracts and combine the notification items into one
export function combineAndSumIncomeNotifications(
  notifications: Notification[]
) {
  const newNotifications: Notification[] = []
  const groupedNotificationsBySourceType = groupBy(
    notifications,
    (n) => n.sourceType
  )
  for (const sourceType in groupedNotificationsBySourceType) {
    // Source title splits by contracts, groups, betting streak bonus
    const groupedNotificationsBySourceTitle = groupBy(
      groupedNotificationsBySourceType[sourceType],
      (notification) => {
        return notification.sourceTitle ?? notification.sourceContractTitle
      }
    )
    for (const sourceTitle in groupedNotificationsBySourceTitle) {
      const notificationsForSourceTitle =
        groupedNotificationsBySourceTitle[sourceTitle]

      let sum = 0
      notificationsForSourceTitle.forEach(
        (notification) => (sum = parseInt(notification.sourceText) + sum)
      )

      const newNotification = {
        ...notificationsForSourceTitle[0],
        sourceText: sum.toString(),
        sourceUserUsername: notificationsForSourceTitle[0].sourceUserUsername,
        data: {
          relatedNotifications: notificationsForSourceTitle,
        },
      }
      newNotifications.push(newNotification)
    }
  }
  return newNotifications
}

export function IncomeNotificationItem(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { sourceType } = notification

  if (sourceType === 'bonus') {
    return (
      <UniqueBettorBonusIncomeNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'quest_reward') {
    return (
      <QuestIncomeNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'betting_streak_bonus') {
    return (
      <BettingStreakBonusIncomeNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'loan') {
    return (
      <LoanIncomeNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'contract') {
    return (
      <MarketResolvedNotification
        highlighted={highlighted}
        notification={notification}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'user') {
    return (
      <UserJoinedNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else return <></>
}

export function UniqueBettorBonusIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { sourceText } = notification
  const [open, setOpen] = useState(false)
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <MultipleAvatarIcons
          notification={notification}
          symbol={'🎁'}
          setOpen={setOpen}
        />
      }
      subtitle={
        notification.data?.bet &&
        notification.data?.outcomeType && (
          <div className={'ml-0.5'}>
            <BettorStatusLabel
              bet={notification.data.bet}
              contractOutcomeType={notification.data.outcomeType}
              answerText={notification.data.answerText}
            />
          </div>
        )
      }
      link={getSourceUrl(notification)}
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} /> Bonus for{' '}
        <PrimaryNotificationLink
          text={
            sourceText
              ? `${
                  parseInt(sourceText) / UNIQUE_BETTOR_BONUS_AMOUNT
                } new traders`
              : 'unique traders'
          }
        />{' '}
        on <QuestionOrGroupLink notification={notification} />
      </span>
      <MultiUserNotificationModal
        notification={notification}
        modalLabel={'Unique traders'}
        open={open}
        setOpen={setOpen}
      />
    </NotificationFrame>
  )
}
export function QuestIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { data } = notification
  const { questType } = data as QuestRewardTxn['data']
  const user = useUser()
  const [open, setOpen] = useState(false)
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <NotificationIcon
          symbol={'🧭'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-500 to-primary-300'
          }
        />
      }
      onClick={() => setOpen(true)}
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} /> Bonus for{' '}
        <PrimaryNotificationLink
          text={`completing the ${QUEST_DETAILS[questType].title} quest`}
        />
      </span>
      {user && <QuestsModal open={open} setOpen={setOpen} user={user} />}
    </NotificationFrame>
  )
}

export function BettingStreakBonusIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { sourceText } = notification
  const [open, setOpen] = useState(false)
  const user = useUser()
  const streakInDays = notification.data?.streak
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <NotificationIcon
          symbol={'🔥'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-600 to-primary-300'
          }
        />
      }
      onClick={() => setOpen(true)}
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} />{' '}
        {sourceText && +sourceText === BETTING_STREAK_BONUS_MAX && (
          <span>(max) </span>
        )}
        Bonus for your {sourceText && <span>🔥 {streakInDays} day</span>}{' '}
        <PrimaryNotificationLink text="Prediction Streak" />
      </span>
      <BettingStreakModal isOpen={open} setOpen={setOpen} currentUser={user} />
    </NotificationFrame>
  )
}

export function LoanIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const [open, setOpen] = useState(false)
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <NotificationIcon
          symbol={'🏦'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-green-600 to-green-300'
          }
        />
      }
      onClick={() => setOpen(true)}
    >
      <span>
        <IncomeNotificationLabel notification={notification} /> of your invested
        predictions returned as a{' '}
        <span>
          <PrimaryNotificationLink text="Loan" />
        </span>
      </span>
      <LoansModal isOpen={open} setOpen={setOpen} />
    </NotificationFrame>
  )
}

function UserJoinedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceUserName, sourceUserUsername, sourceSlug, reason, sourceText } =
    notification
  let reasonBlock = <span>because of a link you shared</span>
  if (sourceSlug && reason == 'user_joined_to_bet_on_your_market') {
    reasonBlock = (
      <>
        to bet on the market{' '}
        <QuestionOrGroupLink
          notification={notification}
          truncatedLength={'xl'}
        />
      </>
    )
  } else if (sourceSlug && reason === 'user_joined_from_your_group_invite') {
    reasonBlock = (
      <>
        because you shared{' '}
        <QuestionOrGroupLink
          notification={notification}
          truncatedLength={'xl'}
        />
      </>
    )
  }
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'👋'} />
      }
      link={getSourceUrl(notification)}
      subtitle={
        sourceText && (
          <span>
            As a thank you, we sent you{' '}
            <span className="text-teal-500">
              {formatMoney(parseInt(sourceText))}
            </span>
            !
          </span>
        )
      }
    >
      <div className="line-clamp-3">
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        joined Manifold {reasonBlock}
      </div>
    </NotificationFrame>
  )
}

function IncomeNotificationLabel(props: { notification: Notification }) {
  const { notification } = props
  const { sourceText } = notification
  return sourceText ? (
    <span className="text-teal-600">{formatMoney(parseInt(sourceText))}</span>
  ) : (
    <div />
  )
}

const BettorStatusLabel = (props: {
  bet: Bet
  contractOutcomeType: outcomeType
  answerText?: string
}) => {
  const { bet, contractOutcomeType, answerText } = props
  const { amount } = bet
  return (
    <Row className={'line-clamp-1 '}>
      <span className="text-ink-600">{formatMoney(amount)}</span> on{' '}
      <BetOutcomeLabel
        bet={bet}
        contractOutcomeType={contractOutcomeType}
        answerText={answerText}
      />
    </Row>
  )
}

function MultiUserNotificationModal(props: {
  notification: Notification
  modalLabel: string
  open: boolean
  setOpen: (open: boolean) => void
  short?: boolean
}) {
  const { notification, modalLabel, open, setOpen, short } = props
  const relatedNotifications = notification.data?.relatedNotifications as
    | Notification[]
    | undefined

  return (
    <Modal open={open} setOpen={setOpen} size={'md'}>
      <Col className="bg-canvas-0 text-ink-1000 relative items-start gap-4 rounded-md p-6">
        <span className={'sticky top-0 text-xl'}>{modalLabel}</span>
        {(relatedNotifications?.length ?? 0) > 0 ? (
          <Col className="max-h-96 w-full gap-4 overflow-y-auto">
            {relatedNotifications?.map((notif) => (
              <Row
                key={notif.sourceUserUsername + 'list'}
                className="w-full items-center gap-1"
              >
                {notif.sourceText && (
                  <span className="min-w-[3.5rem] text-teal-500">
                    +{formatMoney(parseInt(notif.sourceText))}
                  </span>
                )}
                <Avatar
                  username={notif.sourceUserUsername}
                  avatarUrl={notif.sourceUserAvatarUrl}
                  size={'sm'}
                />
                <UserLink
                  name={notif.sourceUserName}
                  username={notif.sourceUserUsername}
                  short={short}
                />
                {notif.data?.bet && notif.data?.outcomeType && (
                  <BettorStatusLabel
                    bet={notif.data.bet}
                    contractOutcomeType={notif.data.outcomeType}
                    answerText={notif.data.answerText}
                  />
                )}
              </Row>
            ))}
          </Col>
        ) : (
          <div>No one yet...</div>
        )}
      </Col>
    </Modal>
  )
}
