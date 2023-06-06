import { ClockIcon, StarIcon, UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import Router from 'next/router'
import toast from 'react-hot-toast'

import { Contract, contractPath, CPMMContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ContractCardView } from 'common/events'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { formatMoney } from 'common/util/format'
import { DAY_MS } from 'common/util/time'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { redeemBoost } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { fromNow } from 'web/lib/util/time'
import { BetRow } from '../bet/bet-row'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { CommentsButton } from '../swipe/swipe-comments'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { ContractStatusLabel } from './contracts-table'
import { LikeButton } from './like-button'
import { useFirebasePublicAndRealtimePrivateContract } from 'web/hooks/use-contract-supabase'
import { QuickOutcomeView } from '../bet/quick-bet'
import { TradesButton } from './trades-button'
import { getGroupLinksToDisplay } from 'common/group'
import { PublicMarketGroups } from './contract-details'

export function FeedContractCard(props: {
  contract: Contract
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  className?: string
  reason?: string
  hasItems?: boolean
}) {
  const { className, promotedData, reason, trackingPostfix, hasItems } = props
  const user = useUser()

  const contract =
    useFirebasePublicAndRealtimePrivateContract(
      props.contract.visibility,
      props.contract.id
    ) ?? props.contract
  const {
    closeTime,
    isResolved,
    creatorCreatedTime,
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    question,
    coverImageUrl,
    outcomeType,
    mechanism,
  } = contract

  const metrics = useSavedContractMetrics(contract)

  const { ref } = useIsVisible(
    () =>
      track('view market card', {
        contractId: contract.id,
        creatorId: contract.creatorId,
        slug: contract.slug,
        isPromoted: !!promotedData,
      } as ContractCardView),
    true
  )

  const trackClick = () =>
    track(('click market card ' + trackingPostfix).trim(), {
      contractId: contract.id,
      creatorId: contract.creatorId,
      slug: contract.slug,
      isPromoted: !!promotedData,
    })

  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'

  const showImage = !!coverImageUrl

  const path = contractPath(contract)

  return (
    <div
      className={clsx(
        'relative',
        'bg-canvas-0 group flex cursor-pointer flex-col overflow-hidden',
        'outline-none transition-colors',
        className
      )}
      // we have other links inside this card like the username, so can't make the whole card a button or link
      tabIndex={-1}
      onClick={(e) => {
        trackClick()
        Router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
    >
      <Col className=" bg-canvas-0 gap-2 p-4 py-2">
        {/* Title is link to contract for open in new tab and a11y */}
        <Row className="justify-between">
          <Row onClick={(e) => e.stopPropagation()} className="gap-2">
            <Avatar username={creatorUsername} avatarUrl={creatorAvatarUrl} />
            <Col>
              <UserLink
                name={creatorName}
                username={creatorUsername}
                createdTime={creatorCreatedTime}
              />
              <div className="text-ink-500 text-sm">
                created {fromNow(contract.createdTime)}
              </div>
            </Col>
          </Row>
          {promotedData && <ClaimButton {...promotedData} />}
        </Row>
        <Link
          href={path}
          className={clsx(
            'text-lg',
            'break-anywhere transition-color hover:text-primary-700 focus:text-primary-700 whitespace-normal font-medium outline-none',
            textColor
          )}
          // if open in new tab, don't open in this one
          onClick={(e) => {
            trackClick()
            e.stopPropagation()
          }}
        >
          {question}
        </Link>

        <Row ref={ref} className="text-ink-500 items-center gap-3 text-sm">
          <QuickOutcomeView contract={contract} />

          {isBinaryCpmm && (
            <div className="flex gap-2">
              <BetRow contract={contract} user={user} />
            </div>
          )}
        </Row>

        {isBinaryCpmm && metrics && metrics.hasShares && (
          <YourMetricsFooter metrics={metrics} />
        )}
      </Col>

      {showImage && (
        <div className="relative">
          <div className="absolute inset-0 bg-transparent transition-all group-hover:saturate-150">
            <Image
              fill
              alt=""
              sizes="100vw"
              className="object-cover"
              src={coverImageUrl}
            />
          </div>
        </div>
      )}
      <PublicMarketGroups
        contract={contract}
        className={'px-4 py-2'}
        justGroups={true}
      />
      <div className=" mt-2 w-full">
        <hr className="border-ink-200 mx-auto w-[calc(100%-1rem)]" />
      </div>
      <Col className="relative">
        <Row
          className="justify-between gap-2 px-4 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <TradesButton contract={contract} />
          <div className="flex items-center gap-1.5 p-1">
            <LikeButton
              contentId={contract.id}
              contentCreatorId={contract.creatorId}
              user={user}
              contentType={'contract'}
              totalLikes={contract.likedByUserCount ?? 0}
              contract={contract}
              contentText={question}
              showTotalLikesUnder
              size="md"
              color="gray"
              className="!px-0"
              trackingLocation={'contract card (feed)'}
            />
          </div>
          <CommentsButton contract={contract} user={user} />
        </Row>
      </Col>
      {hasItems && (
        <div className=" w-full">
          <hr className="border-ink-200 mx-auto w-[calc(100%-1rem)]" />
        </div>
      )}
    </div>
  )
}

export function ContractMetricsFooter(props: {
  contract: CPMMContract
  showDailyProfit?: boolean
}) {
  const { contract, showDailyProfit } = props

  const user = useUser()
  const metrics = useSavedContractMetrics(contract)

  return user && metrics && metrics.hasShares ? (
    <LoadedMetricsFooter
      contract={contract}
      metrics={metrics}
      showDailyProfit={showDailyProfit}
    />
  ) : (
    <Spacer h={2} />
  )
}

function LoadedMetricsFooter(props: {
  contract: CPMMContract
  metrics: ContractMetric
  showDailyProfit?: boolean
}) {
  const { contract, metrics, showDailyProfit } = props
  const { totalShares, maxSharesOutcome, from } = metrics
  const { YES: yesShares, NO: noShares } = totalShares
  const dailyProfit = from ? from.day.profit : 0
  const profit = showDailyProfit ? dailyProfit : metrics.profit
  const { outcomeType } = contract

  const yesOutcomeLabel =
    outcomeType === 'PSEUDO_NUMERIC'
      ? 'HIGHER'
      : outcomeType === 'STONK'
      ? STONK_YES
      : 'YES'
  const noOutcomeLabel =
    outcomeType === 'PSEUDO_NUMERIC'
      ? 'LOWER'
      : outcomeType === 'STONK'
      ? STONK_NO
      : 'NO'

  return (
    <div className="bg-ink-100 columns-2 items-center gap-4 rounded-b-[7px] px-4 pt-1 pb-2 text-sm">
      <Col>
        <span className="text-ink-400 text-xs">Payout</span>
        <div className="text-ink-600 text-sm">
          <span className="font-semibold">
            {maxSharesOutcome === 'YES'
              ? formatMoney(yesShares)
              : formatMoney(noShares)}{' '}
          </span>
          on {maxSharesOutcome === 'YES' ? yesOutcomeLabel : noOutcomeLabel}
        </div>
      </Col>
      <Col>
        <div className="text-ink-400 text-xs">
          {' '}
          {showDailyProfit ? 'daily' : 'total'} Profit{' '}
        </div>
        <div className={clsx('text-ink-600 text-sm font-semibold')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Col>
    </div>
  )
}

export function FeaturedPill(props: { label?: string }) {
  const label = props.label ?? 'Featured'
  return (
    <div className="from-primary-500 rounded-full bg-gradient-to-br to-fuchsia-500 px-2 text-white">
      {label}
    </div>
  )
}

const BoostPill = () => (
  <Tooltip text="They're paying you to see this" placement="right">
    <FeaturedPill label="Boosted" />
  </Tooltip>
)

function ReasonChosen(props: { contract: Contract; reason?: string }) {
  const { contract } = props
  const { createdTime, closeTime, uniqueBettorCount } = contract

  const now = Date.now()
  const reason = props.reason
    ? props.reason
    : createdTime > now - DAY_MS
    ? 'New'
    : closeTime && closeTime < now + DAY_MS
    ? 'Closing soon'
    : !uniqueBettorCount || uniqueBettorCount <= 5
    ? 'For you'
    : 'Trending'

  return (
    <Row className="gap-3">
      <div className="flex items-center gap-1">
        {reason}
        {reason === 'New' && <StarIcon className="h-4 w-4" />}
      </div>
      <Row className="shrink-0 items-center gap-1 whitespace-nowrap">
        {reason === 'Closing soon' && (
          <>
            <ClockIcon className="h-4 w-4" />
            {fromNow(closeTime || 0)}
          </>
        )}
        {reason === 'New' && fromNow(createdTime)}
        {reason === 'Trending' && (
          <Tooltip
            text={`${uniqueBettorCount ?? 0} unique traders`}
            placement="bottom"
            className={'z-10'}
          >
            <Row className={'shrink-0 items-center gap-1'}>
              <UserIcon className={'h-4 w-4'} />
              <div>{uniqueBettorCount ?? 0}</div>
            </Row>
          </Tooltip>
        )}
      </Row>
    </Row>
  )
}

function YourMetricsFooter(props: { metrics: ContractMetric }) {
  const { metrics } = props
  const { totalShares, maxSharesOutcome, profit } = metrics
  const { YES: yesShares, NO: noShares } = totalShares

  return (
    <Row className="bg-ink-200/50 my-2 items-center gap-4 rounded p-2 text-sm">
      <Row className="items-center gap-2">
        <span className="text-ink-500">Payout on {maxSharesOutcome}</span>
        <span className="text-ink-700 font-semibold">
          {maxSharesOutcome === 'YES'
            ? formatMoney(yesShares)
            : formatMoney(noShares)}{' '}
        </span>
      </Row>
      <Row className="ml-auto items-center gap-2">
        <div className="text-ink-500">Profit </div>
        <div className={clsx('text-ink-700 font-semibold')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Row>
    </Row>
  )
}

function ClaimButton(props: {
  adId: string
  reward: number
  className?: string
}) {
  const { adId, reward, className } = props

  const [claimed, setClaimed] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <button
      className={clsx(
        'h-min rounded-full bg-yellow-300 bg-gradient-to-br from-yellow-400 via-yellow-200 to-yellow-300 py-1 px-2 font-semibold text-gray-900 transition-colors',
        'hover:via-yellow-100 focus:via-yellow-100',
        'disabled:bg-canvas-50 disabled:text-ink-800 disabled:cursor-default disabled:bg-none',
        className,
        'text-sm'
      )}
      disabled={loading || claimed}
      onClick={async (e) => {
        e.stopPropagation()
        setLoading(true)
        try {
          await redeemBoost({ adId })
          toast.success(`+${formatMoney(reward)}`)
          setClaimed(true)
          track('claim boost', { adId })
        } catch (err) {
          toast.error(
            (err as any).message ??
              (typeof err === 'string' ? err : 'Error claiming boost')
          )
        } finally {
          setLoading(false)
        }
      }}
    >
      {claimed ? (
        'Claimed!'
      ) : loading ? (
        <LoadingIndicator />
      ) : (
        `Claim ${formatMoney(reward)} Boost`
      )}
    </button>
  )
}
