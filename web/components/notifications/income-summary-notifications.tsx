import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { groupPath } from 'common/group'
import { getSourceIdForLinkComponent, Notification } from 'common/notification'
import { formatMoney } from 'common/util/format'
import { groupBy, sum, uniqBy } from 'lodash'
import { useState } from 'react'
import {
  MultiUserLinkInfo,
  MultiUserTransactionModal,
} from 'web/components/multi-user-transaction-link'
import { UserLink } from 'web/components/widgets/user-link'
import { NotificationGroup } from 'web/hooks/use-notifications'
import { useUser } from 'web/hooks/use-user'
import { NotificationGroupItemComponent } from 'web/pages/notifications'
import { BettingStreakModal } from '../profile/betting-streak-modal'
import { LoansModal } from '../profile/loans-modal'
import {
  AvatarNotificationIcon,
  NotificationFrame,
  NotificationIcon,
  ParentNotificationHeader,
  PrimaryNotificationLink,
  QuestionOrGroupLink,
} from './notification-helpers'

// Loop through the contracts and combine the notification items into one
function combineNotificationsByAddingNumericSourceTexts(
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

export function IncomeNotificationGroupItem(props: {
  notificationGroup: NotificationGroup
}) {
  const { notificationGroup } = props
  const { notifications } = notificationGroup

  const combinedNotifs = combineNotificationsByAddingNumericSourceTexts(
    notifications.filter((n) => n.sourceType !== 'betting_streak_bonus')
  )
  const [highlighted, setHighlighted] = useState(
    notifications.some((n) => !n.isSeen)
  )
  const totalIncome = sum(
    notifications.map((notification) =>
      notification.sourceText ? parseInt(notification.sourceText) : 0
    )
  )
  // Because the server's reset time will never align with the client's, we may
  // erroneously sum 2 betting streak bonuses, therefore just show the most recent
  const mostRecentBettingStreakBonus = notifications
    .filter((n) => n.sourceType === 'betting_streak_bonus')
    .sort((a, b) => a.createdTime - b.createdTime)
    .pop()
  if (mostRecentBettingStreakBonus)
    combinedNotifs.unshift(mostRecentBettingStreakBonus)
  const header = (
    <ParentNotificationHeader
      header={
        <div>
          {'Daily Income: '}
          <span className={'text-teal-600'}>{formatMoney(totalIncome)}</span>
        </div>
      }
      highlighted={highlighted}
    />
  )

  return (
    <NotificationGroupItemComponent
      notifications={combinedNotifs}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      header={header}
      isIncomeNotification={true}
    />
  )
}

export function IncomeNotificationItem(props: { notification: Notification }) {
  const { notification } = props
  const { sourceType } = notification
  const highlighted = !notification.isSeen

  if (sourceType === 'tip' || sourceType === 'tip_and_like') {
    return (
      <TipIncomeNotification
        notification={notification}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'bonus') {
    return (
      <BonusIncomeNotification
        notification={notification}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'betting_streak_bonus') {
    return (
      <BettingStreakBonusIncomeNotification
        notification={notification}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'loan') {
    return (
      <LoanIncomeNotification
        notification={notification}
        highlighted={highlighted}
      />
    )
  } else return <></>
}

export function TipIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
}) {
  const { notification, highlighted } = props
  const {
    sourceUserName,
    sourceUserUsername,
    sourceContractTitle,
    sourceTitle,
  } = notification
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
      isChildOfGroup={true}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💰'} />
      }
      // link={getIncomeSourceUrl(notification)}
      onClick={() => setOpen(true)}
    >
      <span>
        <IncomeNotificationLabel notification={notification} />{' '}
        {/* <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        /> */}
        {tippersText && <PrimaryNotificationLink text={tippersText} />} tipped
        you on <QuestionOrGroupLink notification={notification} />
        {/* <PrimaryNotificationLink text={sourceContractTitle || sourceTitle} /> */}
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
}) {
  const { notification, highlighted } = props
  const { sourceText, data } = notification
  const userLinks: MultiUserLinkInfo[] = data?.uniqueUsers ?? []
  const [open, setOpen] = useState(false)
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
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
      <span>
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
        on{' '}
        <QuestionOrGroupLink
          notification={notification}
          truncatedLength={'xl'}
        />
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
}) {
  const { notification, highlighted } = props
  const { sourceText } = notification
  const [open, setOpen] = useState(false)
  const user = useUser()
  const streakInDays = notification.data?.streak
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
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
      <span>
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
}) {
  const { notification, highlighted } = props
  const [open, setOpen] = useState(false)
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
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
