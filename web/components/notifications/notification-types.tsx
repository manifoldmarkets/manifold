import clsx from 'clsx'
import {
  BetFillData,
  BetReplyNotificationData,
  ContractResolutionData,
  getSourceUrl,
  Notification,
  ReactionNotificationTypes,
  ReviewNotificationData,
} from 'common/notification'
import { formatMoney } from 'common/util/format'
import { floatingEqual } from 'common/util/math'
import { WeeklyPortfolioUpdate } from 'common/weekly-portfolio-update'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { MultiUserReactionModal } from 'web/components/multi-user-reaction-link'
import {
  BettingStreakBonusIncomeNotification,
  BettingStreakExpiringNotification,
  LeagueChangedNotification,
  LoanIncomeNotification,
  ManaPaymentReceivedNotification,
  QuestIncomeNotification,
  UniqueBettorBonusIncomeNotification,
  UserJoinedNotification,
} from 'web/components/notifications/income-summary-notifications'
import {
  BinaryOutcomeLabel,
  MultiLabel,
  NumericValueLabel,
  ProbPercentLabel,
} from 'web/components/outcome-label'
import { Avatar } from 'web/components/widgets/avatar'
import { useContract } from 'web/hooks/use-contract-supabase'
import { useGroupsWithContract } from 'web/hooks/use-group-supabase'
import { Rating, ReviewPanel } from '../reviews/stars'
import { Linkify } from '../widgets/linkify'
import { linkClass } from '../widgets/site-link'
import {
  AvatarNotificationIcon,
  NOTIFICATION_ICON_SIZE,
  NotificationFrame,
  NotificationIcon,
  NotificationTextLabel,
  NotificationUserLink,
  PrimaryNotificationLink,
  QuestionOrGroupLink,
} from './notification-helpers'
import Link from 'next/link'
import { Modal } from '../layout/modal'
import { Button } from '../buttons/button'
import { StarIcon } from '@heroicons/react/solid'
import { useReview } from 'web/hooks/use-review'
import { groupPath } from 'common/group'
import { REFERRAL_AMOUNT } from 'common/economy'
import { ReferralsDialog } from 'web/components/buttons/referrals-button'
import { useUser } from 'web/hooks/use-user'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'
import { SEARCH_TYPE_KEY } from 'web/components/supabase-search'
import { canSetReferrer } from 'web/lib/firebase/users'
import {
  CommentOnLoverNotification,
  NewMatchNotification,
} from 'manifold-love/components/love-notification-types'

export function NotificationItem(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceType, reason, sourceUpdateType } = notification

  const [highlighted, setHighlighted] = useState(!notification.isSeen)

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
  } else if (sourceType === 'betting_streak_expiring') {
    return (
      <BettingStreakExpiringNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'loan_income') {
    return (
      <LoanIncomeNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'mana_payment_received') {
    return (
      <ManaPaymentReceivedNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'bounty_added') {
    return (
      <BountyAddedNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (reason === 'bounty_canceled') {
    return (
      <BountyCanceledNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (sourceType === 'user' && sourceUpdateType === 'updated') {
    return (
      <UserJoinedNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'bet_fill') {
    return (
      <BetFillNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'limit_order_cancelled') {
    return (
      <LimitOrderCancelledNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'contract_from_followed_user') {
    return (
      <NewMarketNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'contract_from_private_group') {
    return (
      <NewPrivateMarketNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'comment' || sourceType === 'love_comment') {
    return (
      <CommentNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'comment_on_lover') {
    return (
      <CommentOnLoverNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (sourceType === 'new_match') {
    return (
      <NewMatchNotification
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
  } else if (sourceType === 'bet_reply') {
    return (
      <BetReplyNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'bounty_awarded') {
    return (
      <BountyAwardedNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (
    reason === 'vote_on_your_contract' ||
    reason === 'all_votes_on_watched_markets'
  ) {
    return (
      <VotedNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (
    reason == 'poll_close_on_watched_markets' ||
    reason == 'your_poll_closed'
  ) {
    return (
      <PollClosedNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (
    (sourceType === 'contract' || sourceType === 'love_contract') &&
    sourceUpdateType === 'updated'
  ) {
    return (
      <MarketUpdateNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (
    (sourceType === 'contract' || sourceType === 'love_contract') &&
    sourceUpdateType === 'resolved'
  ) {
    return (
      <MarketResolvedNotification
        highlighted={highlighted}
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        setHighlighted={setHighlighted}
      />
    )
  } else if (
    (sourceType === 'contract' || sourceType === 'love_contract') &&
    sourceUpdateType === 'closed'
  ) {
    return (
      <MarketClosedNotification
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
  } else if (sourceType === 'answer' || sourceType === 'love_answer') {
    return (
      <AnswerNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'on_new_follow') {
    return (
      <FollowNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'league_changed') {
    return (
      <LeagueChangedNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'subsidized_your_market') {
    return (
      <LiquidityNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'group_role_changed') {
    return (
      <GroupRoleChangedNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'added_to_group') {
    return (
      <GroupAddNotification
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
  } else if (sourceType === 'referral_program') {
    return (
      <ReferralProgramNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (sourceType === 'follow_suggestion') {
    return (
      <FollowSuggestionNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        isChildOfGroup={isChildOfGroup}
      />
    )
  } else if (reason === 'onboarding_flow' && sourceType === 'follow') {
    return (
      <FollowFromReferralNotification
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
      />
    )
  } else if (reason === 'review_on_your_market') {
    return (
      <ReviewNotification
        notification={notification}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        isChildOfGroup={isChildOfGroup}
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
      <div className={'ml-1 mt-1 md:text-base'}>
        <NotificationTextLabel notification={notification} />
      </div>
    </NotificationFrame>
  )
}

function LimitOrderCancelledNotification(props: {
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
    limitAt: dataLimitAt,
    outcomeType,
  } = (data as BetFillData) ?? {}
  const amountRemaining = formatMoney(parseInt(sourceText ?? '0'))
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
  const description = (
    <span>
      Your<span className={clsx('mx-1', color)}>{outcome}</span>
      limit order for {amountRemaining} at {limitAt} was cancelled due to
      insufficient funds.
    </span>
  )
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🚫'} />
      }
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
    limitOrderTotal,
    limitAt: dataLimitAt,
    outcomeType,
    betAnswer,
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
        <span className="font-semibold">{amount}</span> of your{' '}
        <span className={clsx(color)}>{outcome}</span>{' '}
        {betAnswer && <span>{betAnswer}</span>} limit order at{' '}
        <span className="font-semibold">{limitAt}</span> was filled{' '}
      </span>
    ) : (
      <span>{amount} of your limit order was filled</span>
    )

  const subtitle = (
    <>
      {limitOrderRemaining === 0 && (
        <>
          Your limit order{' '}
          {limitOrderTotal && <>for {formatMoney(limitOrderTotal)}</>} is
          complete
        </>
      )}
      {!!limitOrderRemaining && (
        <>
          You have {formatMoney(limitOrderRemaining)}
          {limitOrderTotal && <>/{formatMoney(limitOrderTotal)}</>} remaining in
          your order
        </>
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
        <AvatarNotificationIcon
          notification={notification}
          symbol={creatorOutcome === 'NO' ? '👇' : '☝️'}
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
    sourceId,
    sourceUserName,
    sourceUserUsername,
    sourceContractTitle,
  } = notification
  const { userInvestment, userPayout, profitRank, totalShareholders } =
    (data as ContractResolutionData) ?? {}
  const profit = userPayout - userInvestment
  const profitable = profit > 0 && !floatingEqual(userInvestment, 0)
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
        {comparison ? `, and ${comparison}` : ``} 🎉🎉🎉
      </>
    ) : userInvestment > 0 ? (
      <>
        You lost {formatMoney(Math.abs(profit))}
        {comparison ? `, but ${comparison}` : ``}
      </>
    ) : (
      <div />
    )
  const [openRateModal, setOpenRateModal] = useState(false)

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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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

  const [justNowReview, setJustNowReview] = useState<null | Rating>(null)
  const userReview = useReview(notification.sourceId, notification.userId)
  const showReviewButton = !userReview && !justNowReview

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      subtitle={
        <>
          <div className="mb-1">{subtitle}</div>
          {showReviewButton && (
            <Button
              size={'2xs'}
              color={'gray'}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setOpenRateModal(true)
              }}
            >
              <Row className="gap-1">
                <StarIcon className="h-4 w-4" />
                Rate {notification.sourceUserName}'s resolution
              </Row>
            </Button>
          )}
          {!showReviewButton && (
            <Row className="text-ink-500 items-center gap-0.5 text-sm italic">
              You rated this resolution {justNowReview ?? userReview?.rating}{' '}
              <StarIcon className="h-4 w-4" />
            </Row>
          )}
        </>
      }
      icon={
        <AvatarNotificationIcon
          notification={notification}
          symbol={sourceText === 'CANCEL' ? '🚫' : profitable ? '💰' : '☑️'}
        />
      }
      link={getSourceUrl(notification)}
    >
      {content}
      <Modal open={openRateModal} setOpen={setOpenRateModal}>
        <ReviewPanel
          marketId={notification.sourceId}
          author={notification.sourceUserName}
          className="my-2"
          onSubmit={(rating: Rating) => {
            setJustNowReview(rating)
            setOpenRateModal(false)
          }}
        />
      </Modal>
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
  const { sourceContractTitle, sourceId, sourceUserName, sourceUserUsername } =
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
        />{' '}
        <span>
          asked <PrimaryNotificationLink text={sourceContractTitle} />
        </span>
      </div>
    </NotificationFrame>
  )
}

function NewPrivateMarketNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const {
    sourceContractTitle,
    sourceId,
    sourceUserName,
    sourceUserUsername,
    sourceContractId,
  } = notification
  const contract = useContract(sourceContractId)
  const privateGroup = useGroupsWithContract(contract)
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
        />{' '}
        <span>
          asked <PrimaryNotificationLink text={sourceContractTitle} />
        </span>{' '}
        in private group,{' '}
        {privateGroup && privateGroup.length > 0 ? (
          <Link
            className={clsx(linkClass, 'hover:text-primary-500 font-semibold')}
            href={groupPath(privateGroup[0].slug)}
          >
            {privateGroup[0].name}
          </Link>
        ) : (
          'a private group'
        )}
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
    sourceId,
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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
    sourceId,
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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
function BetReplyNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceId, sourceUserName, sourceUserUsername, sourceContractTitle } =
    notification
  const { betOutcome, betAmount, commentText } =
    notification.data as BetReplyNotificationData

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💬'} />
      }
      subtitle={commentText}
      link={getSourceUrl(notification)}
    >
      <div className="line-clamp-3">
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
        />{' '}
        bet{' '}
        <span
          className={
            betOutcome === 'YES' ? 'text-teal-600' : 'text-scarlet-600'
          }
        >
          {formatMoney(betAmount)} {betOutcome}
        </span>{' '}
        in reply to your comment{' '}
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
    sourceId,
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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
  const { sourceId, sourceUserName, sourceUserUsername, sourceContractTitle } =
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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

export function MultipleAvatarIcons(props: {
  notification: Notification
  symbol: string
  setOpen: (open: boolean) => void
}) {
  const { notification, symbol, setOpen } = props
  const relatedNotifications: Notification[] = sortBy(
    notification.data?.relatedNotifications ?? [notification],
    (n) => n.createdTime
  )

  const combineAvatars = (notifications: Notification[]) => {
    const totalAvatars = notifications.length
    const maxToShow = Math.min(totalAvatars, 3)
    const avatarsToCombine = notifications.slice(
      totalAvatars - maxToShow,
      totalAvatars
    )
    const max = avatarsToCombine.length
    const startLeft = -0.35 * (max - 1)
    return avatarsToCombine.map((n, index) => (
      <div
        key={index}
        className={'absolute'}
        style={
          index === 0
            ? {
                left: `${startLeft}rem`,
              }
            : {
                left: `${startLeft + index * 0.5}rem`,
              }
        }
      >
        <AvatarNotificationIcon
          notification={n}
          symbol={index === max - 1 ? symbol : ''}
        />
      </div>
    ))
  }

  return (
    <div
      onClick={(event) => {
        if (relatedNotifications.length === 1) return
        event.preventDefault()
        setOpen(true)
      }}
    >
      {relatedNotifications.length > 1 ? (
        <Col
          className={`pointer-events-none relative items-center justify-center`}
        >
          {/* placeholder avatar to set the proper size*/}
          <Avatar size={NOTIFICATION_ICON_SIZE} />
          {combineAvatars(relatedNotifications)}
        </Col>
      ) : (
        <AvatarNotificationIcon notification={notification} symbol={symbol} />
      )}
    </div>
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
  const reactorsText =
    relatedNotifications.length > 1
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
        <MultipleAvatarIcons
          notification={notification}
          symbol={'💖'}
          setOpen={setOpen}
        />
      }
      link={getSourceUrl(notification)}
      subtitle={
        sourceType === 'comment_like' ? <Linkify text={sourceText} /> : <></>
      }
    >
      {reactorsText && <PrimaryNotificationLink text={reactorsText} />} liked
      your
      {sourceType === 'comment_like'
        ? ' comment ' + (isChildOfGroup ? '' : 'on ')
        : ' question '}
      {!isChildOfGroup && <QuestionOrGroupLink notification={notification} />}
      <MultiUserReactionModal
        similarNotifications={relatedNotifications}
        modalLabel={'Who liked it?'}
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
  const { sourceId, sourceUserName, sourceUserUsername } = notification
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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
    sourceId,
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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
  const { sourceId, sourceUserName, sourceUserUsername, sourceTitle } =
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
      <div className="line-clamp-3">
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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

function GroupRoleChangedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const {
    sourceId,
    sourceUserName,
    sourceUserUsername,
    sourceText,
    sourceTitle,
  } = notification
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
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
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

function ReferralProgramNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted } = props
  const [showModal, setShowModal] = useState(false)
  const user = useUser()

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={false}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      onClick={() => setShowModal(true)}
      icon={
        <AvatarNotificationIcon
          notification={
            {
              sourceUserName: MANIFOLD_USER_NAME,
              sourceUserUsername: MANIFOLD_USER_USERNAME,
              sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
            } as Notification
          }
          symbol={'💸'}
        />
      }
      subtitle={
        user && canSetReferrer(user) ? (
          <span>Did a friend refer you? Tap here to attribute them!</span>
        ) : (
          <span>Tap here to see your referral code!</span>
        )
      }
    >
      <span>
        Want free mana? Refer friends and get{' '}
        <span className="text-teal-500">{formatMoney(REFERRAL_AMOUNT)}</span> on
        every sign up!
      </span>
      {user && (
        <ReferralsDialog
          user={user}
          isOpen={showModal}
          setIsOpen={setShowModal}
        />
      )}
    </NotificationFrame>
  )
}

function FollowFromReferralNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceId, sourceUserName, sourceUserUsername } = notification
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
      link={`/browse?${SEARCH_TYPE_KEY}=Users`}
      subtitle={`Tap here to find more people to follow!`}
    >
      <>
        <span>
          You're now following{' '}
          <NotificationUserLink
            userId={sourceId}
            name={sourceUserName}
            username={sourceUserUsername}
          />{' '}
          (your referrer)
        </span>
      </>
    </NotificationFrame>
  )
}
function FollowSuggestionNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { sourceId, sourceUserName, sourceUserUsername } = notification
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
      link={`/browse?${SEARCH_TYPE_KEY}=Users`}
      subtitle={`Or, tap here to find more people to follow!`}
    >
      <>
        <span>
          Want to follow{' '}
          <NotificationUserLink
            userId={sourceId}
            name={sourceUserName}
            username={sourceUserUsername}
          />
          ? You just bet on their question!
        </span>
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

function BountyAwardedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted, isChildOfGroup } = props
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      link={getSourceUrl(notification)}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💰'} />
      }
    >
      <>
        <span>
          <NotificationUserLink
            userId={notification.sourceId}
            name={notification.sourceUserName}
            username={notification.sourceUserUsername}
            className=""
          />
          awarded you a{' '}
          <span className="font-semibold text-teal-600">
            {formatMoney(+notification?.sourceText)}
          </span>{' '}
          bounty
          {!isChildOfGroup && (
            <span>
              {' '}
              for your answer on{' '}
              <PrimaryNotificationLink
                text={notification.sourceContractTitle}
              />
            </span>
          )}
        </span>
      </>
    </NotificationFrame>
  )
}

function BountyAddedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted, isChildOfGroup } = props
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      link={getSourceUrl(notification)}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💰'} />
      }
    >
      <>
        <span>
          <NotificationUserLink
            userId={notification.sourceId}
            name={notification.sourceUserName}
            username={notification.sourceUserUsername}
            className=""
          />{' '}
          added{' '}
          <span className="font-semibold text-teal-600">
            {formatMoney(+notification?.sourceText)}
          </span>{' '}
          to your bountied question{' '}
          {!isChildOfGroup && (
            <span>
              <PrimaryNotificationLink
                text={notification.sourceContractTitle}
              />
            </span>
          )}
        </span>
      </>
    </NotificationFrame>
  )
}

function BountyCanceledNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted, isChildOfGroup } = props
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      link={getSourceUrl(notification)}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'❌'} />
      }
      subtitle={`with ${notification.sourceText} bounty left unpaid`}
    >
      <span>
        <NotificationUserLink
          userId={notification.sourceId}
          name={notification.sourceUserName}
          username={notification.sourceUserUsername}
          className=""
        />{' '}
        canceled bounty{' '}
        {!isChildOfGroup && (
          <span>
            <PrimaryNotificationLink text={notification.sourceContractTitle} />
          </span>
        )}
      </span>
    </NotificationFrame>
  )
}

function VotedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted, isChildOfGroup } = props
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      link={getSourceUrl(notification)}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🗳️'} />
      }
    >
      <span>
        <NotificationUserLink
          userId={notification.sourceId}
          name={notification.sourceUserName}
          username={notification.sourceUserUsername}
          className=""
        />{' '}
        voted on <b>{notification.sourceText}</b>
        {!isChildOfGroup && (
          <span>
            {' '}
            on{' '}
            <PrimaryNotificationLink text={notification.sourceContractTitle} />
          </span>
        )}
      </span>
    </NotificationFrame>
  )
}
function ReviewNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted, isChildOfGroup } = props
  const { rating, review } = notification.data as ReviewNotificationData
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      link={getSourceUrl(notification)}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'⭐️'} />
      }
      subtitle={review}
    >
      <span>
        <NotificationUserLink
          userId={notification.sourceId}
          name={notification.sourceUserName}
          username={notification.sourceUserUsername}
          className=""
        />{' '}
        gave you{' '}
        <span
          className={clsx(
            rating > 3
              ? 'rounded-md bg-gradient-to-br from-amber-100 to-amber-400 px-2 dark:text-gray-500'
              : ''
          )}
        >
          {rating} star{rating > 1 ? 's' : ''}
        </span>
        {!isChildOfGroup && (
          <span>
            {' '}
            on{' '}
            <PrimaryNotificationLink text={notification.sourceContractTitle} />
          </span>
        )}
      </span>
    </NotificationFrame>
  )
}

function PollClosedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted, isChildOfGroup } = props
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      link={getSourceUrl(notification)}
      icon={
        <NotificationIcon
          symbol={'🗳️'}
          symbolBackgroundClass="bg-gradient-to-br from-fuchsia-500 to-fuchsia-200"
        />
      }
      subtitle={notification.sourceText}
    >
      <>
        <span>
          {notification.reason == 'your_poll_closed' ? (
            <span>Your poll</span>
          ) : (
            <span>
              <NotificationUserLink
                userId={notification.sourceId}
                name={notification.sourceUserName}
                username={notification.sourceUserUsername}
                className=""
              />
              {`'s poll`}
            </span>
          )}
          {!isChildOfGroup && (
            <span>
              {' '}
              <PrimaryNotificationLink
                text={notification.sourceContractTitle}
              />
            </span>
          )}{' '}
          has autoclosed!
        </span>
      </>
    </NotificationFrame>
  )
}
