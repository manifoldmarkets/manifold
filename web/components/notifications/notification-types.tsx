import clsx from 'clsx'
import {
  BalanceChangeNotificationTypes,
  BetFillData,
  ContractResolutionData,
  getSourceUrl,
  Notification,
  ReactionNotificationTypes,
} from 'common/notification'
import { formatMoney } from 'common/util/format'
import { WeeklyPortfolioUpdate } from 'common/weekly-portfolio-update'
import { useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { MultiUserReactionModal } from 'web/components/multi-user-reaction-link'
import { IncomeNotificationItem } from 'web/components/notifications/income-summary-notifications'
import {
  BinaryOutcomeLabel,
  MultiLabel,
  NumericValueLabel,
  ProbPercentLabel,
} from 'web/components/outcome-label'
import { UserLink } from 'web/components/widgets/user-link'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { Linkify } from '../widgets/linkify'
import {
  AvatarNotificationIcon,
  NotificationFrame,
  NotificationIcon,
  NotificationTextLabel,
  PrimaryNotificationLink,
  QuestionOrGroupLink,
} from './notification-helpers'

export function NotificationItem(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceType, reason, sourceUpdateType } = notification

  const [highlighted, setHighlighted] = useState(!notification.isSeen)

  if (BalanceChangeNotificationTypes.includes(reason)) {
    return (
      <IncomeNotificationItem
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  }

  // TODO Any new notification should be its own component
  if (reason === 'bet_fill') {
    return (
      <BetFillNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'contract') {
    if (sourceUpdateType === 'resolved') {
      return (
        <MarketResolvedNotification
          highlighted={highlighted}
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          setHighlighted={setHighlighted}
        />
      )
    }
    if (sourceUpdateType === 'closed') {
      return (
        <MarketClosedNotification
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          highlighted={highlighted}
          setHighlighted={setHighlighted}
        />
      )
    }
    if (reason === 'contract_from_followed_user') {
      return (
        <NewMarketNotification
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          highlighted={highlighted}
          setHighlighted={setHighlighted}
        />
      )
    } else if (reason === 'tagged_user') {
      return (
        <TaggedUserNotification
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          highlighted={highlighted}
          setHighlighted={setHighlighted}
        />
      )
    }
    return (
      <MarketUpdateNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'signup_bonus') {
    return (
      <SignupBonusNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'comment') {
    return (
      <CommentNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'answer') {
    return (
      <AnswerNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'follow') {
    return (
      <FollowNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'liquidity') {
    return (
      <LiquidityNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'group') {
    if (reason === 'group_role_changed') {
      return (
        <GroupRoleChangedNotification
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          highlighted={highlighted}
          setHighlighted={setHighlighted}
        />
      )
    }
    return (
      <GroupAddNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'challenge') {
    return (
      <ChallengeNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (ReactionNotificationTypes.includes(sourceType)) {
    return (
      <UserLikeNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'profit_loss_updates') {
    return (
      <WeeklyUpdateNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  }
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={isChildOfGroup}
      icon={<></>}
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
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceText, data, sourceContractTitle } = notification
  const {
    creatorOutcome,
    probability,
    limitOrderRemaining,
    limitAt: dataLimitAt,
    outcomeType,
  } = (data as BetFillData) ?? {}
  const amount = formatMoney(parseInt(sourceText ?? '0'))
  const limitAt =
    dataLimitAt !== undefined
      ? dataLimitAt
      : Math.round(probability * 100) + '%'

  const outcome =
    outcomeType === 'PSEUDO_NUMERIC'
      ? creatorOutcome === 'YES'
        ? ' HIGHER'
        : ' LOWER'
      : creatorOutcome
  const color =
    creatorOutcome === 'YES'
      ? 'text-teal-600'
      : creatorOutcome === 'NO'
      ? 'text-scarlet-600'
      : 'text-blue-600'
  const description =
    creatorOutcome && probability ? (
      <span>
        {amount} of your
        <span className={clsx('mx-1', color)}>{outcome}</span>
        limit order at was filled{' '}
      </span>
    ) : (
      <span>{amount} of your limit order was filled</span>
    )

  const subtitle = (
    <>
      {limitOrderRemaining ? (
        <>
          You are buying <span className={clsx(color)}>{outcome}</span> at{' '}
          <b>{limitAt}</b>. You have {formatMoney(limitOrderRemaining)}{' '}
          remaining.
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
      setHighlighted={setHighlighted}
      icon={
        <NotificationIcon
          symbol={creatorOutcome === 'NO' ? '👇' : '☝️'}
          symbolBackgroundClass={
            creatorOutcome === 'NO'
              ? 'bg-gradient-to-br from-scarlet-600 to-scarlet-300'
              : 'bg-gradient-to-br from-teal-600 to-teal-300'
          }
        />
      }
      subtitle={subtitle}
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        {description}
        {!isChildOfGroup && (
          <span>
            on <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </div>
    </NotificationFrame>
  )
}

function SignupBonusNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
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
      setHighlighted={setHighlighted}
      icon={
        <NotificationIcon
          symbol={'✨'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-600 to-primary-300'
          }
        />
      }
      link={getSourceUrl(notification)}
    >
      <Row>{text}</Row>
    </NotificationFrame>
  )
}

export function MarketResolvedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const {
    sourceText,
    data,
    sourceUserName,
    sourceUserUsername,
    sourceContractTitle,
  } = notification
  const { userInvestment, userPayout, profitRank, totalShareholders } =
    (data as ContractResolutionData) ?? {}
  const profit = userPayout - userInvestment
  const profitable = profit > 0 && userInvestment > 0
  const [opacity, setOpacity] = useState(highlighted && profitable ? 1 : 0)
  const [isVisible, setIsVisible] = useState(false)
  const { ref } = useIsVisible(() => setIsVisible(true), true)

  useEffect(() => {
    if (opacity > 0 && isVisible)
      setTimeout(() => {
        setOpacity(opacity - 0.02)
      }, opacity * 100)
  }, [isVisible, opacity])
  console.log(data)
  const betterThan = (totalShareholders ?? 0) - (profitRank ?? 0)
  const comparison =
    profitRank && totalShareholders && betterThan > 0
      ? `you outperformed ${betterThan} other${betterThan > 1 ? 's' : ''}!`
      : ''
  const subtitle =
    sourceText === 'CANCEL' && userInvestment > 0 ? (
      <>Your {formatMoney(userInvestment)} invested has been returned to you</>
    ) : sourceText === 'CANCEL' && Math.abs(userPayout) > 0 ? (
      <>Your {formatMoney(-userPayout)} in profit has been removed</>
    ) : profitable ? (
      <>
        Your {formatMoney(userInvestment)} won{' '}
        <span className="text-teal-600">+{formatMoney(profit)}</span> in profit
        {comparison ? `, and ${comparison}` : ``}
      </>
    ) : userInvestment > 0 ? (
      <>
        You lost {formatMoney(Math.abs(profit))}
        {comparison ? `, but ${comparison}` : ``}
      </>
    ) : (
      <div />
    )

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
          'inline-block max-w-[200px] truncate align-bottom text-blue-600'
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
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        cancelled {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            {' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength={'xl'}
            />
          </span>
        )}
      </>
    ) : (
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        resolved {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength={'xl'}
            />
          </span>
        )}{' '}
        to {resolutionDescription()}
      </>
    )

  const confettiBg =
    highlighted && profitable ? (
      <div
        ref={ref}
        className={clsx(
          'bg-confetti-animated pointer-events-none absolute inset-0'
        )}
        style={{
          opacity,
        }}
      />
    ) : undefined

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      subtitle={subtitle}
      icon={
        <AvatarNotificationIcon
          notification={notification}
          symbol={sourceText === 'CANCEL' ? '🚫' : profitable ? '💰' : '☑️'}
        />
      }
      customBackground={confettiBg}
      link={getSourceUrl(notification)}
    >
      {content}
    </NotificationFrame>
  )
}

function MarketClosedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceContractTitle } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <NotificationIcon
          symbol={'❗'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-amber-400 to-amber-200'
          }
        />
      }
      link={getSourceUrl(notification)}
    >
      <span className="line-clamp-3">
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
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceContractTitle, sourceUserName, sourceUserUsername } =
    notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🌟'} />
      }
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        <span>
          asked <PrimaryNotificationLink text={sourceContractTitle} />
        </span>
      </div>
    </NotificationFrame>
  )
}

function MarketUpdateNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
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
        Updated close time: {new Date(parseInt(sourceText)).toLocaleString()}
      </span>
    ) : (
      sourceText
    )
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'✏️'} />
      }
      subtitle={subtitle}
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        <span>
          {action}{' '}
          {!isChildOfGroup && (
            <PrimaryNotificationLink text={sourceContractTitle} />
          )}
          {isChildOfGroup && <>the question</>}
        </span>
      </div>
    </NotificationFrame>
  )
}

function CommentNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
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
  const comment = sourceText
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💬'} />
      }
      subtitle={
        comment ? (
          <div className="line-clamp-2">
            <Linkify text={comment} />{' '}
          </div>
        ) : (
          <></>
        )
      }
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        {reasonText}
        {!isChildOfGroup && (
          <span>
            on <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </div>
    </NotificationFrame>
  )
}

function AnswerNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
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
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🙋'} />
      }
      subtitle={<div className="line-clamp-2">{sourceText}</div>}
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        answered{' '}
        {!isChildOfGroup && (
          <span>
            on <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </div>
    </NotificationFrame>
  )
}

function TaggedUserNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceUserName, sourceUserUsername, sourceContractTitle } =
    notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🏷️'} />
      }
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        tagged you{' '}
        {!isChildOfGroup && (
          <span>
            on <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </div>
    </NotificationFrame>
  )
}

function UserLikeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted, isChildOfGroup } = props
  const [open, setOpen] = useState(false)
  const { sourceUserName, sourceType, sourceText } = notification
  const relatedNotifications: Notification[] = notification.data
    ?.relatedNotifications ?? [notification]
  const multipleReactions = relatedNotifications.length > 1
  const reactorsText = multipleReactions
    ? `${sourceUserName} & ${relatedNotifications.length - 1} other${
        relatedNotifications.length > 2 ? 's' : ''
      }`
    : sourceUserName
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💖'} />
      }
      onClick={() => setOpen(true)}
      subtitle={
        sourceType === 'comment_like' ? <Linkify text={sourceText} /> : <></>
      }
    >
      {reactorsText && <PrimaryNotificationLink text={reactorsText} />} liked
      your
      {sourceType === 'comment_like' ? ' comment on ' : ' market '}
      {!isChildOfGroup && <QuestionOrGroupLink notification={notification} />}
      <MultiUserReactionModal
        similarNotifications={relatedNotifications}
        modalLabel={'Who dunnit?'}
        open={open}
        setOpen={setOpen}
      />
    </NotificationFrame>
  )
}

function FollowNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceUserName, sourceUserUsername } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon
          notification={notification}
          symbol={
            <Col className="from-ink-400 to-ink-200 h-5 w-5 items-center rounded-lg bg-gradient-to-br text-sm">
              ➕
            </Col>
          }
        />
      }
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        followed you
      </>
    </NotificationFrame>
  )
}

function LiquidityNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
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
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💧'} />
      }
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        added{' '}
        {sourceText && <span>{formatMoney(parseInt(sourceText))} of</span>}{' '}
        liquidity{' '}
        {!isChildOfGroup && (
          <span>
            to <PrimaryNotificationLink text={sourceContractTitle} />
          </span>
        )}
      </div>
    </NotificationFrame>
  )
}

function GroupAddNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceUserName, sourceUserUsername, sourceTitle } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'👥'} />
      }
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        added you{' '}
        {!isChildOfGroup && (
          <span>
            to <PrimaryNotificationLink text={sourceTitle} />
          </span>
        )}
      </div>
    </NotificationFrame>
  )
}

function ChallengeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
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
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'⚔️'} />
      }
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        accepted your challenge{' '}
        {!isChildOfGroup && (
          <span>
            on{' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength="xl"
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

function GroupRoleChangedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceUserName, sourceUserUsername, sourceText, sourceTitle } =
    notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'👥'} />
      }
      link={getSourceUrl(notification)}
    >
      <>
        <UserLink
          name={sourceUserName || ''}
          username={sourceUserUsername || ''}
          className={'hover:text-primary-500 relative flex-shrink-0'}
        />{' '}
        {sourceText}{' '}
        {!isChildOfGroup && (
          <span>
            in{' '}
            <PrimaryNotificationLink text={sourceTitle} truncatedLength="xl" />{' '}
          </span>
        )}
      </>
    </NotificationFrame>
  )
}

function WeeklyUpdateNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { data } = notification
  const { weeklyProfit } = data as WeeklyPortfolioUpdate
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      link={getSourceUrl(notification)}
      icon={
        <NotificationIcon
          symbol={'✨'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-600 to-primary-300'
          }
        />
      }
    >
      <>
        <span>
          Your portfolio changed by{' '}
          <span className={clsx(weeklyProfit > 0 ? 'text-teal-600' : '')}>
            {formatMoney(Math.abs(weeklyProfit))}
          </span>{' '}
          this week. Tap here to see your summary!
        </span>
      </>
    </NotificationFrame>
  )
}
