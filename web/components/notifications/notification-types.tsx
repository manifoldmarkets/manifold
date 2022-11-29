import { ControlledTabs } from 'web/components/layout/tabs'
import React, { ReactNode, useEffect, useMemo, useState } from 'react'
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
import { MANIFOLD_AVATAR_URL, PAST_BETS, PrivateUser } from 'common/user'
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
  IncomeNotificationGroupItem,
  IncomeNotificationItem,
  PredictionStreak,
} from 'web/components/notifications/income-summary-notifications'
import { getHighlightClass, NotificationFrame } from 'web/pages/notifications'
import { truncateLengthType, truncateText } from '../widgets/truncate'
import { useHistory } from 'react-router-dom'
import { BadgesModal } from '../profile/badges-modal'

export function NotificationItem(props: {
  notification: Notification
  isChildOfGroup?: boolean
  isIncomeNotification?: boolean
}) {
  const { notification, isChildOfGroup, isIncomeNotification } = props
  const { sourceType, reason, sourceUpdateType } = notification

  const [highlighted] = useState(!notification.isSeen)
  if (isIncomeNotification) {
    return <IncomeNotificationItem notification={notification} />
  }

  // TODO Any new notification should be its own component
  if (reason === 'bet_fill') {
    return (
      <BetFillNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'contract') {
    if (sourceUpdateType === 'resolved') {
      return (
        <MarketResolvedNotification
          highlighted={highlighted}
          notification={notification}
          isChildOfGroup={isChildOfGroup}
        />
      )
    }
    if (sourceUpdateType === 'closed') {
      return (
        <MarketClosedNotification
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          highlighted={highlighted}
        />
      )
    }
    if (reason === 'contract_from_followed_user') {
      return (
        <NewMarketNotification
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          highlighted={highlighted}
        />
      )
    } else if (reason === 'tagged_user') {
      return (
        <TaggedUserNotification
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          highlighted={highlighted}
        />
      )
    }
    return (
      <MarketUpdateNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'badge') {
    return (
      <BadgeNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'signup_bonus') {
    return (
      <SignupBonusNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'comment') {
    return (
      <CommentNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'answer') {
    return (
      <AnswerNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'follow') {
    return (
      <FollowNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'liquidity') {
    return (
      <LiquidityNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'group') {
    return (
      // not appearing?
      <GroupAddNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'user') {
    return (
      // not appearing?
      <UserJoinedNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  } else if (sourceType === 'challenge') {
    return (
      <ChallengeNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
      />
    )
  }
  return (
    <NotificationFrame
      notification={notification}
      // subtitle={getReasonForShowingNotification(notification)}
      highlighted={highlighted}
      isChildOfGroup={isChildOfGroup}
      symbol={''}
    >
      <div className={'mt-1 ml-1 md:text-base'}>
        <NotificationTextLabel notification={notification} />
      </div>
    </NotificationFrame>
  )
}

function BetFillNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted } = props
  const { sourceText, data, sourceContractTitle } = notification
  const {
    creatorOutcome,
    probability,
    limitOrderTotal,
    limitOrderRemaining,
    fillAmount,
  } = (data as BetFillData) ?? {}
  const amount = formatMoney(parseInt(sourceText ?? '0'))
  const color =
    creatorOutcome === 'YES'
      ? 'text-teal-500'
      : creatorOutcome === 'NO'
      ? 'text-scarlet-500'
      : 'text-blue-500'
  const description =
    creatorOutcome && probability ? (
      <span>
        {amount} of your
        <span className={clsx('mx-1', color)}>{creatorOutcome}</span>
        limit order at was filled{' '}
      </span>
    ) : (
      <span>{amount} of your limit order was filled</span>
    )

  const subtitle = (
    <>
      {limitOrderRemaining ? (
        <>
          Your limit order will buy{' '}
          <span className={clsx(color)}>{creatorOutcome}</span> down to{' '}
          <b>{Math.round(probability * 100)}%</b>. You have{' '}
          {formatMoney(limitOrderRemaining)} remaining.
        </>
      ) : (
        ''
      )}
    </>
  )

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={creatorOutcome === 'NO' ? '📉' : '📈'}
      subtitle={subtitle}
      link={getSourceUrl(notification)}
    >
      <>
        {description}
        {!isChildOfGroup && (
          <span>
            on{' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength={'md'}
            />
          </span>
        )}
      </>
    </NotificationFrame>
  )
}

function BadgeNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted } = props
  const { sourceText } = notification
  const [isOpen, setOpen] = useState(false)
  const user = useUser()
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'🥇'}
      onClick={() => setOpen(true)}
    >
      <span> {sourceText}</span>
      {user && <BadgesModal isOpen={isOpen} setOpen={setOpen} user={user} />}
    </NotificationFrame>
  )
}
function SignupBonusNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted } = props
  const { sourceText } = notification
  const text = (
    <span>
      Thanks for using Manifold! We sent you{' '}
      <span className={'text-teal-500'}>
        {formatMoney(parseInt(sourceText ?? ''))}
      </span>{' '}
      for being a valuable new predictor.
    </span>
  )

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'✨'}
      link={getSourceUrl(notification)}
    >
      <Row>{text}</Row>
    </NotificationFrame>
  )
}

function MarketResolvedNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted } = props
  const {
    sourceText,
    data,
    sourceUserName,
    sourceUserUsername,
    sourceContractTitle,
  } = notification
  const { userInvestment, userPayout } = (data as ContractResolutionData) ?? {}
  const profit = userPayout - userInvestment
  const profitable = profit >= 0
  const subtitle =
    sourceText === 'CANCEL' ? (
      <>Your {formatMoney(userInvestment)} invested has been returned to you</>
    ) : profitable ? (
      <>
        You won{' '}
        <span className="font-semibold text-teal-500">
          +{formatMoney(profit)}
        </span>{' '}
        for you good investments!
      </>
    ) : (
      <>You lost {formatMoney(Math.abs(profit))} ... Better luck next time!</>
    )
  let symbol = '☑️'

  const resolutionDescription = () => {
    if (!sourceText) return <div />

    if (sourceText === 'YES' || sourceText == 'NO') {
      return <BinaryOutcomeLabel outcome={sourceText as any} />
    }

    if (sourceText.includes('%')) {
      return (
        <ProbPercentLabel
          prob={parseFloat(sourceText.replace('%', '')) / 100}
        />
      )
    }
    if (sourceText === 'MKT' || sourceText === 'PROB') return <MultiLabel />

    // Numeric markets
    const isNumberWithCommaOrPeriod = /^[0-9,.]*$/.test(sourceText)
    if (isNumberWithCommaOrPeriod)
      return <NumericValueLabel value={parseFloat(sourceText)} />

    // Free response market
    return (
      <span
        className={
          'inline-block max-w-[200px] truncate align-bottom text-blue-400'
        }
      >
        {sourceText}
      </span>
    )
  }

  const content =
    sourceText === 'CANCEL' ? (
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        cancelled
        {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            {' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength="md"
            />
          </span>
        )}
      </>
    ) : (
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        resolved {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength="md"
            />
          </span>
        )}{' '}
        to {resolutionDescription()}
      </>
    )

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      subtitle={subtitle}
      symbol={symbol}
      link={getSourceUrl(notification)}
    >
      <>{content}</>
    </NotificationFrame>
  )
}

function MarketClosedNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted } = props
  const { sourceContractTitle } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol="❗"
      link={getSourceUrl(notification)}
    >
      <span>
        Please resolve your question
        {!isChildOfGroup && (
          <>
            {' '}
            <PrimaryNotificationLink text={sourceContractTitle} />
          </>
        )}
      </span>
    </NotificationFrame>
  )
}

function NewMarketNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted } = props
  const { sourceContractTitle, sourceUserName, sourceUserUsername } =
    notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol="🌟"
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        <span>
          asked <PrimaryNotificationLink text={sourceContractTitle} />
        </span>
      </>
    </NotificationFrame>
  )
}
function MarketUpdateNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted } = props
  const {
    sourceContractTitle,
    sourceUserName,
    sourceUserUsername,
    sourceUpdateType,
    sourceText,
  } = notification

  const action = sourceUpdateType === 'closed' ? 'closed' : 'updated'
  const subtitle =
    sourceText && parseInt(sourceText) > 0 ? (
      <span>
        updated close time: {new Date(parseInt(sourceText)).toLocaleString()}
      </span>
    ) : (
      sourceText
    )
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol="✏️"
      subtitle={subtitle}
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        <span>
          {action}{' '}
          {!isChildOfGroup && (
            <PrimaryNotificationLink text={sourceContractTitle} />
          )}
          {isChildOfGroup && <>the question</>}
        </span>
      </>
    </NotificationFrame>
  )
}

function CommentNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, isChildOfGroup } = props
  const {
    sourceUserName,
    sourceUserUsername,
    reason,
    sourceText,
    sourceContractTitle,
  } = notification
  const reasonText =
    reason === 'reply_to_users_answer' || reason === 'reply_to_users_comment'
      ? 'replied to you '
      : `commented `
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'💬'}
      subtitle={truncateText(sourceText, 'md')}
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        {reasonText}
        {!isChildOfGroup && (
          <span>
            on <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </>
    </NotificationFrame>
  )
}

function AnswerNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, isChildOfGroup } = props
  const {
    sourceUserName,
    sourceUserUsername,
    sourceText,
    sourceContractTitle,
  } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'🙋'}
      subtitle={truncateText(sourceText, 'lg')}
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        answered{' '}
        {!isChildOfGroup && (
          <span>
            on <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </>
    </NotificationFrame>
  )
}

function TaggedUserNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, isChildOfGroup } = props
  const { sourceUserName, sourceUserUsername, sourceContractTitle } =
    notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'🏷️'}
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        tagged you{' '}
        {!isChildOfGroup && (
          <span>
            on <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </>
    </NotificationFrame>
  )
}

function FollowNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, isChildOfGroup } = props
  const { sourceUserName, sourceUserUsername } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'➕'}
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        followed you
      </>
    </NotificationFrame>
  )
}

function LiquidityNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, isChildOfGroup } = props
  const {
    sourceUserName,
    sourceUserUsername,
    sourceText,
    sourceContractTitle,
  } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'💧'}
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        added{' '}
        {sourceText && <span>{formatMoney(parseInt(sourceText))} of</span>}{' '}
        liquidity{' '}
        {!isChildOfGroup && (
          <span>
            to <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </>
    </NotificationFrame>
  )
}

function GroupAddNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, isChildOfGroup } = props
  const { sourceUserName, sourceUserUsername, sourceTitle } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'👥'}
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        added you to the group{' '}
        <span>
          <PrimaryNotificationLink text={sourceTitle} />
        </span>
      </>
    </NotificationFrame>
  )
}

function UserJoinedNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, isChildOfGroup } = props
  const { sourceUserName, sourceUserUsername, sourceSlug, reason, sourceText } =
    notification
  let reasonBlock = <span>because of you</span>
  if (sourceSlug && reason) {
    reasonBlock = (
      <>
        to bet on your market{' '}
        <QuestionOrGroupLink notification={notification} truncate={true} />
      </>
    )
  } else if (sourceSlug) {
    reasonBlock = (
      <>
        because you shared{' '}
        <QuestionOrGroupLink notification={notification} truncate={true} />
      </>
    )
  }
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'👋'}
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
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        joined Manifold Markets {reasonBlock}
      </>
    </NotificationFrame>
  )
}

function ChallengeNotification(props: {
  notification: Notification
  highlighted: boolean
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, isChildOfGroup } = props
  const {
    sourceUserName,
    sourceUserUsername,
    sourceContractTitle,
    sourceText,
  } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      symbol={'⚔️'}
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        accepted your challenge{' '}
        {!isChildOfGroup && (
          <span>
            on{' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength="md"
            />{' '}
          </span>
        )}
        {sourceText && (
          <span>
            for{' '}
            <span className="text-teal-500">
              {formatMoney(parseInt(sourceText))}
            </span>
          </span>
        )}
      </>
    </NotificationFrame>
  )
}

export function PrimaryNotificationLink(props: {
  text: string | undefined
  truncatedLength?: truncateLengthType
}) {
  const { text, truncatedLength } = props
  if (!text) {
    ;<></>
  }
  return (
    <span className="font-semibold transition-colors hover:text-indigo-500">
      {truncateText(text, truncatedLength ?? 'lg')}
    </span>
  )
}

export function QuestionOrGroupLink(props: {
  notification: Notification
  truncate?: boolean
  ignoreClick?: boolean
}) {
  const { notification, ignoreClick, truncate } = props
  const {
    sourceType,
    sourceContractTitle,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
    sourceTitle,
  } = notification

  let title = sourceContractTitle || sourceTitle
  if (truncate && title) {
    title = truncateText(title, 'lg')
  }

  if (ignoreClick) return <span className={'ml-1 font-bold '}>{title}</span>
  return (
    <SiteLink
      className={'relative ml-1 font-semibold hover:text-indigo-500'}
      href={
        sourceContractCreatorUsername
          ? `/${sourceContractCreatorUsername}/${sourceContractSlug}`
          : // User's added to group or received a tip there
          (sourceType === 'group' || sourceType === 'tip') && sourceSlug
          ? `${groupPath(sourceSlug)}`
          : // User referral via group
          sourceSlug?.includes('/group/')
          ? `${sourceSlug}`
          : ''
      }
      onClick={() =>
        track('Notification Clicked', {
          type: 'question title',
          sourceType,
          sourceContractTitle,
          sourceContractCreatorUsername,
          sourceContractSlug,
          sourceSlug,
          sourceTitle,
        })
      }
    >
      {title}
    </SiteLink>
  )
}

function NotificationTextLabel(props: {
  notification: Notification
  className?: string
}) {
  const { className, notification } = props
  const { sourceText, reasonText } = notification
  const defaultText = sourceText ?? reasonText ?? ''
  return (
    <div className={className ? className : 'line-clamp-4 whitespace-pre-line'}>
      <Linkify text={defaultText} />
    </div>
  )
}
