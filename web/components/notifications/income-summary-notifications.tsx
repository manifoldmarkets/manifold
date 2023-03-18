import {
  BETTING_STREAK_BONUS_MAX,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { getSourceUrl, Notification } from 'common/notification'
import { formatMoney } from 'common/util/format'
import { groupBy, uniqBy } from 'lodash'
import { useState } from 'react'
import {
  MultiUserLinkInfo,
  MultiUserTransactionModal,
} from 'web/components/multi-user-transaction-link'

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
import { MarketResolvedNotification } from './notification-types'
import { QuestRewardTxn } from 'common/txn'
import { QUEST_DETAILS } from 'common/quest'

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
      const uniqueUsers = uniqBy(
        notificationsForSourceTitle.map((notification) => {
          let sum = 0
          notificationsForSourceTitle
            .filter(
              (n) => n.sourceUserUsername === notification.sourceUserUsername
            )
            .forEach((n) => (sum = parseInt(n.sourceText) + sum))
          return {
            name: notification.sourceUserName,
            username: notification.sourceUserUsername,
            avatarUrl: notification.sourceUserAvatarUrl,
            amount: sum,
          } as MultiUserLinkInfo
        }),
        (n) => n.username
      )

      const newNotification = {
        ...notificationsForSourceTitle[0],
        sourceText: sum.toString(),
        sourceUserUsername: notificationsForSourceTitle[0].sourceUserUsername,
        data: { uniqueUsers },
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

  if (sourceType === 'tip' || sourceType === 'tip_and_like') {
    return (
      <TipIncomeNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'bonus') {
    return (
      <BonusIncomeNotification
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

export function TipIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { sourceUserName } = notification
  const [open, setOpen] = useState(false)
  const userLinks: MultiUserLinkInfo[] = notification.data?.uniqueUsers ?? []
  const multipleTips = userLinks.length > 1
  const tippersText = multipleTips
    ? `${sourceUserName} & ${userLinks.length - 1} other${
        userLinks.length - 1 > 1 ? 's' : ''
      }`
    : sourceUserName
    ? sourceUserName
    : 'some users'
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💰'} />
      }
      onClick={() => setOpen(true)}
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} />{' '}
        {tippersText && <PrimaryNotificationLink text={tippersText} />} tipped
        you on <QuestionOrGroupLink notification={notification} />
      </span>
      <MultiUserTransactionModal
        userInfos={userLinks}
        modalLabel={'Who tipped you'}
        open={open}
        setOpen={setOpen}
      />
    </NotificationFrame>
  )
}

export function BonusIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { sourceText, data } = notification
  const userLinks: MultiUserLinkInfo[] = data?.uniqueUsers ?? [
    { ...notification, sum: parseInt(sourceText) },
  ]
  const [open, setOpen] = useState(false)
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <NotificationIcon
          symbol={'🎁'}
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
      <MultiUserTransactionModal
        userInfos={userLinks}
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
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} /> Bonus for{' '}
        <PrimaryNotificationLink
          text={`completing the ${QUEST_DETAILS[questType].title} quest`}
        />
      </span>
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
  let reasonBlock = <span>because of you</span>
  if (sourceSlug && reason) {
    reasonBlock = (
      <>
        to bet on your market{' '}
        <QuestionOrGroupLink
          notification={notification}
          truncatedLength={'xl'}
        />
      </>
    )
  } else if (sourceSlug) {
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
        joined Manifold Markets {reasonBlock}
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
