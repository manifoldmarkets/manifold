import {
  BETTING_STREAK_BONUS_MAX,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { groupPath } from 'common/group'
import { getSourceIdForLinkComponent, Notification } from 'common/notification'
import { formatMoney } from 'common/util/format'
import { groupBy, uniqBy } from 'lodash'
import { useState } from 'react'
import {
  MultiUserLinkInfo,
  MultiUserTransactionModal,
} from 'web/components/multi-user-transaction-link'
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

// Loop through the contracts and combine the notification items into one
export function combineNotificationsByAddingNumericSourceTexts(
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
        (notification) => (sum = parseInt(notification.sourceText ?? '0') + sum)
      )
      const uniqueUsers = uniqBy(
        notificationsForSourceTitle.map((notification) => {
          let thisSum = 0
          notificationsForSourceTitle
            .filter(
              (n) => n.sourceUserUsername === notification.sourceUserUsername
            )
            .forEach((n) => (thisSum = parseInt(n.sourceText ?? '0') + thisSum))
          return {
            username: notification.sourceUserUsername,
            name: notification.sourceUserName,
            avatarUrl: notification.sourceUserAvatarUrl,
            amount: thisSum,
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
  const userLinks: MultiUserLinkInfo[] = data?.uniqueUsers ?? []
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
            'bg-gradient-to-br from-indigo-500 to-indigo-300'
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
            'bg-gradient-to-br from-indigo-600 to-indigo-300'
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

export function getIncomeSourceUrl(notification: Notification) {
  const {
    sourceId,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
    sourceType,
    sourceUserUsername,
  } = notification
  if (sourceType === 'tip' && sourceContractSlug)
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${sourceSlug}`
  if (sourceType === 'tip' && sourceSlug) return `${groupPath(sourceSlug)}`
  if (sourceType === 'challenge') return `${sourceSlug}`
  if (sourceType === 'betting_streak_bonus')
    return `/${sourceUserUsername}/?show=betting-streak`
  if (sourceType === 'loan') return `/${sourceUserUsername}/?show=loans`
  if (sourceContractCreatorUsername && sourceContractSlug)
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${getSourceIdForLinkComponent(
      sourceId ?? '',
      sourceType
    )}`
}

export function IncomeNotificationLabel(props: { notification: Notification }) {
  const { notification } = props
  const { sourceText } = notification
  return sourceText ? (
    <span className="text-teal-600">{formatMoney(parseInt(sourceText))}</span>
  ) : (
    <div />
  )
}
