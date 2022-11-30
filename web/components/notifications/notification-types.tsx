import clsx from 'clsx'
import {
  BetFillData,
  ContractResolutionData,
  getSourceUrl,
  Notification,
} from 'common/notification'
import { formatMoney } from 'common/util/format'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { IncomeNotificationItem } from 'web/components/notifications/income-summary-notifications'
import {
  BinaryOutcomeLabel,
  MultiLabel,
  NumericValueLabel,
  ProbPercentLabel,
} from 'web/components/outcome-label'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { BadgesModal } from '../profile/badges-modal'
import { Linkify } from '../widgets/linkify'
import { truncateText } from '../widgets/truncate'
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
  isIncomeNotification?: boolean
}) {
  const { notification, isChildOfGroup, isIncomeNotification } = props
  const { sourceType, reason, sourceUpdateType } = notification

  const [highlighted, _setHighlighted] = useState(!notification.isSeen)
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
      highlighted={highlighted}
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
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted } = props
  const { sourceText, data, sourceContractTitle } = notification
  const { creatorOutcome, probability, limitOrderRemaining } =
    (data as BetFillData) ?? {}
  const amount = formatMoney(parseInt(sourceText ?? '0'))
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
      <>
        {description}
        {!isChildOfGroup && (
          <span>
            on{' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength={'xl'}
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
      icon={
        <NotificationIcon
          symbol={'🥇'}
          symbolBackgroundClass={'bg-gradient-to-br from-blue-600 to-blue-300'}
        />
      }
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
      icon={
        <NotificationIcon
          symbol={'✨'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-indigo-600 to-indigo-300'
          }
        />
      }
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
        Your {formatMoney(userInvestment)} investment won{' '}
        <span className="text-teal-600">+{formatMoney(profit)}</span> in profit!
      </>
    ) : (
      <>You lost {formatMoney(Math.abs(profit))} ... Better luck next time!</>
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
          className={'relative flex-shrink-0 hover:text-indigo-500'}
        />{' '}
        cancelled
        {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            {' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength="lg"
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
              truncatedLength="lg"
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
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'☑️'} />
      }
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
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🌟'} />
      }
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
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'✏️'} />
      }
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
  const comment = truncateText(sourceText, 'xl')
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💬'} />
      }
      subtitle={comment ? <Linkify text={comment} /> : <></>}
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
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🙋'} />
      }
      subtitle={truncateText(sourceText, 'xl')}
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
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🏷️'} />
      }
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
      icon={
        <AvatarNotificationIcon
          notification={notification}
          symbol={
            <Col className="h-5 w-5 items-center rounded-lg bg-gradient-to-br from-gray-400 to-gray-200 text-sm">
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
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💧'} />
      }
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
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'👥'} />
      }
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
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'⚔️'} />
      }
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
              truncatedLength="lg"
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
