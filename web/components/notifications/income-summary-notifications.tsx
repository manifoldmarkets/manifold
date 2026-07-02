import { BETTING_STREAK_BONUS_MAX, REFERRAL_AMOUNT } from 'common/economy'
import {
  getEffectiveBonusMultiplier,
  EffectiveTier,
} from 'common/supporter-config'
import {
  BettingStreakData,
  getSourceUrl,
  LeagueChangeData,
  ManaPaymentData,
  Notification,
  ReferralData,
  StreakFreezeUsedData,
  UniqueBettorData,
} from 'common/notification'
import { formatMoney, maybePluralize } from 'common/util/format'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

import { STREAK_MILESTONES } from 'common/store-review'
import { DAY_MS } from 'common/util/time'
import { UserLink } from 'web/components/widgets/user-link'
import { useStoreReviewNudge } from 'web/hooks/use-store-review-nudge'
import { useUser } from 'web/hooks/use-user'
import { BettingStreakModal } from '../profile/betting-streak-modal'
import { LoansModal } from '../profile/loans-modal'
import {
  AvatarNotificationIcon,
  NotificationFrame,
  NotificationIcon,
  NotificationUserLink,
  PrimaryNotificationLink,
  QuestionOrGroupLink,
} from './notification-helpers'
import { MultipleAvatarIcons } from './notification-types'
import { QuestRewardTxn } from 'common/txn'
import { QUEST_DETAILS } from 'common/quest'
import { QuestsModal } from '../home/quests-or-streak'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { BetOutcomeLabel } from 'web/components/outcome-label'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { DIVISION_NAMES, SILICON_PRIZE_MIN_MANA_EARNED } from 'common/leagues'
import { Linkify } from 'web/components/widgets/linkify'
import {
  PARTNER_UNIQUE_TRADER_BONUS,
  PARTNER_UNIQUE_TRADER_BONUS_MULTI,
  PARTNER_UNIQUE_TRADER_THRESHOLD,
} from 'common/partner'
import { getEffectiveTier } from 'common/user'
import { TokenNumber } from 'web/components/widgets/token-number'
import { first } from 'lodash'
import { truncateText } from '../widgets/truncate'
import { BettingStreakProgressModal } from '../profile/first-streak-modal'

// Shown in place of a "reduced because unverified" / "come back for a bonus"
// subtitle when the user is admin-flagged (effective tier 'restricted'): they
// earn ZERO bonuses until they verify, so the messaging must say so rather than
// nudge them toward a bonus they won't receive.
function FlaggedBonusSubtitle() {
  // Forward-looking wording on purpose: this renders on the current user's whole
  // bonus-notification history (it keys off their live effective tier), so it
  // must NOT claim a past bonus "wasn't received" — only that new bonuses are
  // paused while the account is flagged.
  return (
    <span>
      Your account is flagged for verification, so new bonuses are paused.{' '}
      <a
        href="/membership"
        className="text-primary-700 font-semibold hover:underline"
      >
        Verify your identity
      </a>{' '}
      to restore them.
    </span>
  )
}
export function UniqueBettorBonusIncomeNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, highlighted, setHighlighted, isChildOfGroup } = props
  const { sourceText } = notification
  const [open, setOpen] = useState(false)
  const user = useUser()
  const myData = (notification.data ?? {}) as UniqueBettorData
  const relatedNotifications =
    myData && 'relatedNotifications' in myData
      ? ((myData as any).relatedNotifications as Notification[])
      : []
  const singleGroupedNotif = relatedNotifications.length === 1
  const data = (
    singleGroupedNotif ? first(relatedNotifications)?.data : myData
  ) as UniqueBettorData
  const { outcomeType, isPartner, totalUniqueBettors } = data
  const numNewTraders =
    relatedNotifications.length > 0 ? relatedNotifications.length : 1
  const answerText = truncateText(data.answerText, 'lg')

  const partnerBonusPerTrader =
    outcomeType === 'MULTIPLE_CHOICE'
      ? PARTNER_UNIQUE_TRADER_BONUS_MULTI
      : PARTNER_UNIQUE_TRADER_BONUS
  const partnerBonusAmount = numNewTraders * partnerBonusPerTrader
  const showBet = data?.bet && data?.outcomeType
  // Use the creator's tier at award time (embedded in the txn/notification) so
  // the "reduced" label is historically accurate; fall back to current tier for
  // notifications created before effectiveTier was recorded.
  const txnTier = (data as { effectiveTier?: string } | undefined)
    ?.effectiveTier
  const userTier = user ? getEffectiveTier(user) : undefined
  const isUnverified =
    txnTier === 'unverified' ||
    (txnTier === undefined && userTier === 'unverified')
  const isFlagged =
    txnTier === 'restricted' ||
    (txnTier === undefined && userTier === 'restricted')
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      subtitle={
        isFlagged ? (
          <FlaggedBonusSubtitle />
        ) : isUnverified ? (
          <span>
            Reduced because your account is unverified.{' '}
            <a
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
            >
              Verify
            </a>
            ,{' '}
            <a
              href="/checkout"
              className="text-primary-700 font-semibold hover:underline"
            >
              buy mana
            </a>
            , or{' '}
            <a
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
            >
              subscribe
            </a>{' '}
            to earn the full unique-trader bonus.
          </span>
        ) : undefined
      }
      icon={
        <MultipleAvatarIcons
          notification={notification}
          symbol={'🎁'}
          setOpen={setOpen}
        />
      }
      link={getSourceUrl(notification)}
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} /> Bonus for{' '}
        <PrimaryNotificationLink
          text={
            sourceText
              ? `${numNewTraders} ${maybePluralize(
                  'new trader',
                  numNewTraders
                )}`
              : 'new traders'
          }
        />{' '}
        {showBet ? (
          <BettorStatusLabel
            className="mr-1"
            uniqueBettorData={data}
            answerText={answerText}
          />
        ) : answerText && outcomeType !== 'NUMBER' ? (
          <span className="mr-1">
            on <span className="text-primary-700">{answerText}</span>
          </span>
        ) : null}
        {!isChildOfGroup && (
          <>
            {' on '}
            <QuestionOrGroupLink
              truncatedLength="lg"
              notification={notification}
            />{' '}
          </>
        )}
      </span>
      {isPartner && totalUniqueBettors && (
        <div>
          Partners bonus:{' '}
          {totalUniqueBettors < PARTNER_UNIQUE_TRADER_THRESHOLD ? (
            <>
              only{' '}
              <span className="font-semibold">
                {PARTNER_UNIQUE_TRADER_THRESHOLD - totalUniqueBettors}
              </span>{' '}
              more traders to collect{' '}
              <span className="font-semibold text-teal-600">
                ${partnerBonusPerTrader.toFixed(2)} each
              </span>
            </>
          ) : (
            <span className="font-semibold text-teal-600">
              ${partnerBonusAmount.toFixed(2)}
            </span>
          )}
        </div>
      )}
      <MultiUserNotificationModal
        notification={notification}
        modalLabel={'Traders'}
        open={open}
        setOpen={setOpen}
      />
    </NotificationFrame>
  )
}
// Note: not used atm
export function UniqueBettorNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const [open, setOpen] = useState(false)
  const data = (notification.data ?? {}) as UniqueBettorData
  const { outcomeType } = data
  const relatedNotifications =
    data && 'relatedNotifications' in data
      ? (data as any).relatedNotifications
      : []
  const numNewTraders =
    relatedNotifications.length > 0 ? relatedNotifications.length : 1
  const answerText =
    relatedNotifications.length > 0
      ? relatedNotifications[0].data?.answerText
      : undefined

  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <MultipleAvatarIcons
          notification={notification}
          symbol={'🆕'}
          setOpen={setOpen}
        />
      }
      subtitle={
        notification.data?.bet &&
        notification.data?.outcomeType && (
          <div className={'ml-0.5'}>
            <BettorStatusLabel
              uniqueBettorData={data}
              className="line-clamp-1 gap-1"
            />
          </div>
        )
      }
      link={getSourceUrl(notification)}
    >
      <span className="line-clamp-3">
        <PrimaryNotificationLink
          text={`${numNewTraders} ${maybePluralize(
            'new trader',
            numNewTraders
          )}`}
        />{' '}
        on <QuestionOrGroupLink notification={notification} />{' '}
        {answerText && outcomeType !== 'NUMBER' ? ` (${answerText})` : ''}
      </span>
      <MultiUserNotificationModal
        notification={notification}
        modalLabel={'Traders'}
        open={open}
        setOpen={setOpen}
      />
    </NotificationFrame>
  )
}
export function PushNotificationBonusNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🎁'} />
      }
    >
      <span className="line-clamp-3">
        <IncomeNotificationLabel notification={notification} />{' '}
        <span className={'font-semibold'}>Bonus</span> for enabling push
        notifications
      </span>
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
  // The bonus award embeds effectiveTier in the txn data — use it if present,
  // otherwise fall back to the current user's tier (notifications can outlive
  // tier transitions).
  const txnTier = (data as { effectiveTier?: string } | undefined)
    ?.effectiveTier
  const userTier = user ? getEffectiveTier(user) : undefined
  const isUnverified =
    txnTier === 'unverified' ||
    (txnTier === undefined && userTier === 'unverified')
  const isFlagged =
    txnTier === 'restricted' ||
    (txnTier === undefined && userTier === 'restricted')
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      subtitle={
        isFlagged ? (
          <FlaggedBonusSubtitle />
        ) : isUnverified ? (
          <span>
            This bonus is reduced because your account is unverified.{' '}
            <a
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
            >
              Verify
            </a>
            ,{' '}
            <a
              href="/checkout"
              className="text-primary-700 font-semibold hover:underline"
            >
              buy mana
            </a>
            , or{' '}
            <a
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
            >
              subscribe
            </a>{' '}
            to earn the full amount.
          </span>
        ) : undefined
      }
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
  const { sourceText, createdTime } = notification
  const [open, setOpen] = useState(false)
  const user = useUser()
  const tryOfferReview = useStoreReviewNudge('streak-bonus-modal')
  const {
    streak: streakInDays,
    cashAmount,
    bonusAmount,
    effectiveTier: txnTier,
  } = notification.data as BettingStreakData
  const noBonus = sourceText === '0'

  const handleOpen = () => {
    setOpen(true)
    // Only nudge on a fresh milestone — clicking a year-old streak-7 notification
    // should not arm the prompt.
    const isFresh = Date.now() - createdTime < DAY_MS
    if (
      isFresh &&
      !noBonus &&
      streakInDays &&
      (STREAK_MILESTONES as readonly number[]).includes(streakInDays)
    ) {
      // Let the celebration modal land before the OS review prompt overlays it.
      setTimeout(tryOfferReview, 2500)
    }
  }

  // Streak multiplier driven by effective tier (verification + subscription).
  // Prefer the tier embedded at award time so the "reduced" label and amounts
  // reflect history; fall back to current tier for older notifications.
  const effectiveTier: EffectiveTier =
    (txnTier as EffectiveTier | undefined) ??
    (user ? getEffectiveTier(user) : 'verified')
  const streakMultiplier = getEffectiveBonusMultiplier(effectiveTier, 'streak')
  const maxBonus = Math.floor(BETTING_STREAK_BONUS_MAX * streakMultiplier)
  const verifiedMaxBonus = BETTING_STREAK_BONUS_MAX
  const isUnverified = effectiveTier === 'unverified'
  const isFlagged = effectiveTier === 'restricted'

  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      subtitle={
        isFlagged ? (
          <FlaggedBonusSubtitle />
        ) : isUnverified ? (
          <span>
            This bonus is reduced because your account is unverified.{' '}
            <a
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
            >
              Verify
            </a>
            ,{' '}
            <a
              href="/checkout"
              className="text-primary-700 font-semibold hover:underline"
            >
              buy mana
            </a>
            , or{' '}
            <a
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
            >
              subscribe
            </a>{' '}
            to earn up to{' '}
            <TokenNumber
              amount={verifiedMaxBonus}
              className={'font-bold'}
              isInline
            />{' '}
            per streak day.
          </span>
        ) : (
          noBonus && (
            <span>Come back and predict again tomorrow for a bonus!</span>
          )
        )
      }
      icon={
        <NotificationIcon
          symbol={'🔥'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-600 to-primary-300'
          }
        />
      }
      onClick={handleOpen}
    >
      {noBonus ? (
        <span className="line-clamp-3">
          Congrats on your {sourceText && <span>🔥 {streakInDays} day</span>}{' '}
          <PrimaryNotificationLink text="Prediction Streak" />
        </span>
      ) : (
        <span className="line-clamp-3">
          {bonusAmount && (
            <TokenNumber
              className={'text-teal-600'}
              isInline={true}
              amount={bonusAmount}
              coinType={'mana'}
            />
          )}{' '}
          {bonusAmount && bonusAmount >= maxBonus && <span>(max) </span>}
          Bonus for your {sourceText && <span>🔥 {streakInDays} day</span>}{' '}
          <PrimaryNotificationLink text="Prediction Streak" />
        </span>
      )}
      <BettingStreakProgressModal
        open={open}
        setOpen={setOpen}
        currentStreak={user?.currentBettingStreak ?? 0}
        questMultiplier={streakMultiplier}
      />
    </NotificationFrame>
  )
}
export function BettingStreakExpiringNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
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
          symbol={'⏰'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-yellow-600 to-orange-300'
          }
        />
      }
      onClick={() => setOpen(true)}
      subtitle={'Place a prediction in the next 3 hours to keep it.'}
    >
      <span className="line-clamp-3">
        Don't let your <span>🔥 {streakInDays} day</span>{' '}
        <PrimaryNotificationLink text="Prediction Streak" /> expire!
      </span>
      <BettingStreakModal isOpen={open} setOpen={setOpen} currentUser={user} />
    </NotificationFrame>
  )
}

export function BettingStreakFreezeUsedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  const data = notification.data as StreakFreezeUsedData | undefined
  const streak = data?.streak ?? 0
  const freezesRemaining = data?.freezesRemaining ?? 0
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      isChildOfGroup={true}
      icon={
        <NotificationIcon
          symbol={'🧊'}
          symbolBackgroundClass={'bg-gradient-to-br from-blue-400 to-cyan-300'}
        />
      }
      onClick={() => setOpen(true)}
      subtitle={
        freezesRemaining > 0
          ? `You have ${freezesRemaining} streak freeze${
              freezesRemaining === 1 ? '' : 's'
            } remaining.`
          : 'You have no streak freezes left — predict today to keep your streak!'
      }
    >
      <span className="line-clamp-3">
        A <PrimaryNotificationLink text="Streak Freeze" /> was used to save your{' '}
        <span>🔥 {streak} day</span> prediction streak!
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
      {user && open && (
        <LoansModal isOpen={open} setOpen={setOpen} user={user} />
      )}
    </NotificationFrame>
  )
}
export function ManaPaymentReceivedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { data, sourceId, sourceUserName, sourceUserUsername } = notification
  const { token } = data as ManaPaymentData
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'💸'} />
      }
      subtitle={<Linkify text={data?.message ?? ''} />}
      link={`/${sourceUserUsername}`}
    >
      <span>
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
          className=""
        />
        <PrimaryNotificationLink text=" sent you " />
        <IncomeNotificationLabel notification={notification} token={token} />
      </span>
    </NotificationFrame>
  )
}

export function CharityChampionDethronedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  const { sourceId, sourceUserName, sourceUserUsername } = notification
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'🏆'} />
      }
      link="/charity"
    >
      <span>
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
          className=""
        />
        <span> claimed the </span>
        <PrimaryNotificationLink text="Charity Champion Trophy" />
        <span> from you!</span>
      </span>
    </NotificationFrame>
  )
}

export function CharityChampionEligibleNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
}) {
  const { notification, highlighted, setHighlighted } = props
  return (
    <NotificationFrame
      notification={notification}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <NotificationIcon
          symbol={'🏆'}
          symbolBackgroundClass="bg-gradient-to-br from-amber-500 to-yellow-300"
        />
      }
      link="/charity"
    >
      <span>
        You're the <span className="font-semibold">#1 entry holder</span>!{' '}
        <PrimaryNotificationLink text="Claim the Charity Champion Trophy" />
      </span>
    </NotificationFrame>
  )
}

export function ReferralNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const {
    sourceId,
    sourceUserName,
    sourceContractTitle,
    sourceContractCreatorUsername,
    sourceUserUsername,
    sourceText,
    data,
    createdTime,
  } = notification
  const user = useUser()
  const tryOfferReview = useStoreReviewNudge('referral-bonus')

  // Fire once on mount when the user is viewing a fresh referral bonus.
  // Multiple fresh referrals rendering at once are de-duped by the hook's
  // module-level localLastFireTime + cooldown; stale referrals (>1d old) skip.
  const isFresh = Date.now() - createdTime < DAY_MS
  useEffect(() => {
    if (!isFresh) return
    const t = setTimeout(tryOfferReview, 1500)
    return () => clearTimeout(t)
  }, [isFresh, tryOfferReview])
  const isYourMarket = sourceContractCreatorUsername === user?.username
  // Use data.manaAmount if available, fall back to sourceText for old notifications
  const referralData = data as ReferralData | undefined
  const manaAmount =
    referralData?.manaAmount ??
    (sourceText ? parseFloat(sourceText) : REFERRAL_AMOUNT)
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
    >
      <div className="line-clamp-3">
        <TokenNumber
          className={'text-teal-600'}
          amount={manaAmount}
          coinType="MANA"
          isInline
        />{' '}
        Bonus {isYourMarket ? 'for' : 'for referring the new user'}{' '}
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
        />{' '}
        {isYourMarket ? 'signing up on your market ' : ''}
        {!isChildOfGroup && (
          <PrimaryNotificationLink text={sourceContractTitle} />
        )}
      </div>
    </NotificationFrame>
  )
}

export function LeagueChangedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const { data } = notification
  const { previousLeague, newLeague, bonusAmount, missedPrizeReason } =
    data as LeagueChangeData
  const newlyAdded = previousLeague === undefined
  const promoted =
    previousLeague && previousLeague.division < newLeague.division
  const demoted = previousLeague && previousLeague.division > newLeague.division
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <NotificationIcon
          symbol={newlyAdded ? '🏆' : promoted ? '🥇' : '🥈'}
          symbolBackgroundClass={
            'bg-gradient-to-br from-primary-600 to-primary-300'
          }
        />
      }
      subtitle={
        bonusAmount > 0 ? (
          <span>
            You earned <IncomeNotificationLabel notification={notification} />{' '}
            as a prize
            {previousLeague &&
              ` for placing Rank ${previousLeague.rank} this season`}
            .
          </span>
        ) : missedPrizeReason === 'silicon_min_mana_not_met' &&
          previousLeague ? (
          <span>
            You placed Rank {previousLeague.rank} this season but didn't earn
            the {formatMoney(SILICON_PRIZE_MIN_MANA_EARNED)} minimum required
            for a Silicon prize.
          </span>
        ) : previousLeague ? (
          <span>You placed Rank {previousLeague.rank} this season.</span>
        ) : undefined
      }
      link={'/leagues'}
    >
      <div className="line-clamp-3">
        <span>
          {previousLeague && promoted
            ? `You've been promoted from ${
                DIVISION_NAMES[previousLeague.division]
              } to ${DIVISION_NAMES[newLeague.division]} league!`
            : previousLeague && demoted
            ? `You've been demoted from ${
                DIVISION_NAMES[previousLeague.division]
              } to ${DIVISION_NAMES[newLeague.division]} league.`
            : previousLeague
            ? `You retained your spot in ${
                DIVISION_NAMES[previousLeague.division]
              } league!`
            : `You were added to ${
                DIVISION_NAMES[newLeague.division]
              } league! Tap here to check it out.`}
        </span>
      </div>
    </NotificationFrame>
  )
}

function IncomeNotificationLabel(props: {
  notification: Notification
  token?: 'M$' | 'CASH'
  className?: string
}) {
  const { notification, token = 'M$', className } = props
  const { sourceText } = notification
  return sourceText && token === 'M$' ? (
    <TokenNumber
      className={clsx('text-teal-600', className)}
      amount={parseFloat(sourceText)}
      coinType={'mana'}
      isInline
    />
  ) : sourceText && token === 'CASH' ? (
    <TokenNumber
      className={clsx('text-amber-500', className)}
      amount={parseFloat(sourceText)}
      coinType={'CASH'}
      isInline
    />
  ) : (
    <div />
  )
}

const BettorStatusLabel = (props: {
  uniqueBettorData: UniqueBettorData
  className?: string
  answerText?: string
}) => {
  const { uniqueBettorData, className } = props
  const { bet, outcomeType, totalAmountBet, token } = uniqueBettorData
  const answerText = props.answerText ?? uniqueBettorData.answerText
  const { amount, outcome } = bet
  const showProb =
    (outcomeType === 'PSEUDO_NUMERIC' &&
      props.uniqueBettorData.max !== undefined) ||
    (outcomeType !== 'PSEUDO_NUMERIC' && outcomeType !== 'NUMBER')
  const showOutcome = outcomeType === 'MULTIPLE_CHOICE'
  return (
    <span className={className}>
      <span className="text-ink-600">
        {formatMoney(totalAmountBet ?? amount, token)}
      </span>{' '}
      {showOutcome && `${outcome} `}
      on{' '}
      <BetOutcomeLabel
        bet={bet}
        contractOutcomeType={outcomeType}
        answerText={answerText}
      />{' '}
      {showProb &&
        `(${getFormattedMappedValue(
          props.uniqueBettorData as any,
          bet.probAfter
        )})`}
    </span>
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
                  displayContext="notifications"
                />
                <UserLink
                  user={{
                    id: notif.sourceId,
                    username: notif.sourceUserUsername,
                    name: notif.sourceUserName,
                  }}
                  short={short}
                  displayContext="notifications"
                />
                {notif.data?.bet && notif.data?.outcomeType && (
                  <BettorStatusLabel
                    className="line-clamp-1 gap-1"
                    uniqueBettorData={notif.data as UniqueBettorData}
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
