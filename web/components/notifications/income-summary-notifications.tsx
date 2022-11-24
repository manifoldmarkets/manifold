import { ControlledTabs } from 'web/components/layout/tabs'
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import {
  BetFillData,
  ContractResolutionData,
  getSourceIdForLinkComponent,
  getSourceUrl,
  Notification,
} from 'common/notification'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { MANIFOLD_AVATAR_URL, PAST_BETS, PrivateUser, User } from 'common/user'
import clsx from 'clsx'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Linkify } from 'web/components/widgets/linkify'
import {
  BinaryOutcomeLabel,
  CancelLabel,
  MultiLabel,
  NumericValueLabel,
  ProbPercentLabel,
} from 'web/components/outcome-label'
import {
  NotificationGroup,
  useGroupedNotifications,
} from 'web/hooks/use-notifications'
import { TrendingUpIcon } from '@heroicons/react/outline'
import { formatMoney } from 'common/util/format'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { groupBy, sum, uniqBy } from 'lodash'
import { Pagination } from 'web/components/widgets/pagination'
import { SiteLink } from 'web/components/widgets/site-link'
import { NotificationSettings } from 'web/components/notification-settings'
import { SEO } from 'web/components/SEO'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { UserLink } from 'web/components/widgets/user-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import {
  MultiUserLinkInfo,
  MultiUserTransactionLink,
} from 'web/components/multi-user-transaction-link'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { PushNotificationsModal } from 'web/components/push-notifications-modal'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { groupPath } from 'common/group'
import Link from 'next/link'
import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import {
  NESTED_NOTIFICATION_STYLE,
  NOTIFICATION_STYLE,
  NUM_SUMMARY_LINES,
  PARENT_NOTIFICATION_STYLE,
  getHighlightClass,
  NotificationGroupItemComponent,
  NotificationFrame,
  ParentNotificationHeader,
} from 'web/pages/notifications'
import { BettingStreakModal } from '../profile/betting-streak-modal'
import { QuestionOrGroupLink } from './notification-types'

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
  className?: string
}) {
  const { notificationGroup, className } = props
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
      icon={<TrendingUpIcon className=" text-teal-500" />}
      header={
        <div>
          {'Daily Income: '}
          <span className={'text-teal-500'}>
            {'+' + formatMoney(totalIncome)}
          </span>
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
  const { sourceType, sourceUserUsername, sourceText, data } = notification
  const [highlighted] = useState(!notification.isSeen)
  const isMobile = useIsMobile(768)
  const user = useUser()
  const isTip = sourceType === 'tip' || sourceType === 'tip_and_like'
  const isUniqueBettorBonus = sourceType === 'bonus'
  const userLinks: MultiUserLinkInfo[] =
    isTip || isUniqueBettorBonus ? data?.uniqueUsers ?? [] : []

  const streakInDays = notification.data?.streak
    ? notification.data?.streak
    : Date.now() - notification.createdTime > 24 * 60 * 60 * 1000
    ? parseInt(sourceText ?? '0') / BETTING_STREAK_BONUS_AMOUNT
    : user?.currentBettingStreak ?? 0

  function reasonAndLink() {
    const { sourceText } = notification
    let reasonText = ''
    if (sourceType === 'bonus' && sourceText) {
      return (
        <>
          Bonus for{' '}
          <MultiUserTransactionLink
            userInfos={userLinks}
            modalLabel={'Unique traders'}
            text={`${
              parseInt(sourceText) / UNIQUE_BETTOR_BONUS_AMOUNT
            } new traders`}
          />{' '}
          on
          <QuestionOrGroupLink
            notification={notification}
            ignoreClick={false}
          />
        </>
      )
    } else if (sourceType === 'tip') {
      reasonText = `tipped you on`
    } else if (sourceType === 'betting_streak_bonus') {
      if (sourceText && +sourceText === BETTING_STREAK_BONUS_MAX)
        reasonText = '(max) for your'
      else reasonText = 'for your'
      return (
        <>
          {sourceText && +sourceText < BETTING_STREAK_BONUS_MAX && '(max)'} for
          your {sourceText && `🔥 ${streakInDays} day `}
          <PredictionStreak user={user} />
        </>
      )
    } else if (sourceType === 'loan' && sourceText) {
      reasonText = `of your invested predictions returned as a`
      // TODO: support just 'like' notification without a tip
    } else if (sourceType === 'tip_and_like' && sourceText) {
      reasonText = `liked`
    }

    return (
      <>
        {reasonText}
        {sourceType === 'loan' ? (
          <SiteLink
            className={'relative ml-1 font-bold hover:text-indigo-500'}
            href={`/${sourceUserUsername}/?show=loans`}
            onClick={(e) => e.stopPropagation}
          >
            🏦 Loan <span className="font-normal">(learn more)</span>
          </SiteLink>
        ) : (
          <QuestionOrGroupLink
            notification={notification}
            ignoreClick={isMobile}
          />
        )}
      </>
    )
  }

  const incomeNotificationLabel = () => {
    return sourceText ? (
      <span className="text-teal-500">
        {'+' + formatMoney(parseInt(sourceText))}
      </span>
    ) : (
      <div />
    )
  }

  const getIncomeSourceUrl = () => {
    const {
      sourceId,
      sourceContractCreatorUsername,
      sourceContractSlug,
      sourceSlug,
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

  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      // subtitle="hi"
      isChildOfGroup={true}
      symbol={incomeNotificationLabel()}
    >
      <span className={'mx-1'}>
        {isTip &&
          (userLinks.length > 1
            ? 'Multiple users'
            : userLinks.length > 0
            ? userLinks[0].name
            : '')}
      </span>
      <span>{reasonAndLink()}</span>
    </NotificationFrame>
  )
}

export function PredictionStreak(props: { user: User | null | undefined }) {
  const { user } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <span
        className="font-semibold hover:text-indigo-500"
        onClick={() => setOpen(!open)}
      >
        Prediction Streak
      </span>
      <BettingStreakModal isOpen={open} setOpen={setOpen} currentUser={user} />
    </>
  )
}
