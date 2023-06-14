import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import Router from 'next/router'
import { MutableRefObject } from 'react'

import { Contract, contractPath } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ContractCardView } from 'common/events'
import { formatMoney } from 'common/util/format'
import { useFirebasePublicAndRealtimePrivateContract } from 'web/hooks/use-contract-supabase'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { fromNow } from 'web/lib/util/time'
import { ClaimButton } from '../ad/claim-ad-button'
import { BetRow } from '../bet/bet-row'
import { QuickOutcomeView } from '../bet/quick-bet'
import { ReasonChosen } from '../feed/feed-reason-chosen'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { CommentsButton } from '../swipe/swipe-comments'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { PublicMarketGroups } from './contract-details'
import { ContractStatusLabel } from './contracts-table'
import { LikeButton } from './like-button'
import { TradesButton } from './trades-button'

export function FeedContractCard(props: {
  contract: Contract
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  className?: string
  reason?: string
  hasItems?: boolean
  showReason?: boolean
}) {
  const {
    className,
    promotedData,
    reason,
    trackingPostfix,
    hasItems,
    showReason,
  } = props

  const contract =
    useFirebasePublicAndRealtimePrivateContract(
      props.contract.visibility,
      props.contract.id
    ) ?? props.contract
  const { closeTime, isResolved } = contract

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

  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'
  const path = contractPath(contract)

  if (!hasItems) {
    return (
      <Col>
        {showReason && (
          <ReasonChosen
            contract={contract}
            reason={promotedData ? 'Boosted' : reason}
            className="mb-1"
          />
        )}
        <DetailedCard
          ref={ref}
          contract={contract}
          trackClick={trackClick}
          path={path}
          promotedData={promotedData}
          className={className}
          hasItems={hasItems}
        />
      </Col>
    )
  }
  return (
    <SimpleCard
      contract={contract}
      textColor={textColor}
      trackClick={trackClick}
      promotedData={promotedData}
      reason={reason}
      showReason={showReason}
    />
  )
}

function SimpleCard(props: {
  contract: Contract
  textColor: string
  trackClick: () => void
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  reason?: string
  showReason?: boolean
}) {
  const { contract, textColor, trackClick, promotedData, reason, showReason } =
    props
  const { question } = contract
  return (
    <Row>
      <Col className=" grow-y justify-end">
        <div className="dark:border-ink-200 border-ink-300 ml-2 h-1/3 w-4 rounded-tl-xl border-2 border-b-0 border-r-0 sm:ml-4 sm:w-6" />
      </Col>
      <Col className="mt-2 grow">
        {showReason && (
          <ReasonChosen
            contract={contract}
            reason={promotedData ? 'Boosted' : reason}
            className="mb-1"
          />
        )}
        <Link
          className={clsx(
            'relative',
            'bg-canvas-100 dark:border-ink-200 border-ink-300 group cursor-pointer justify-between overflow-hidden border-l-4 py-2 pl-2 pr-4 dark:bg-opacity-20',
            'outline-none transition-colors'
          )}
          onClick={(e) => {
            trackClick()
            e.stopPropagation()
          }}
          href={contractPath(contract)}
        >
          <Row className="mb-1 justify-between">
            <Col className="justify-end">
              <span className="text-ink-500">
                <UserLink
                  name={contract.creatorName}
                  username={contract.creatorUsername}
                />{' '}
                asked
              </span>
            </Col>
            {promotedData && (
              <ClaimButton {...promotedData} className={'z-10'} />
            )}
          </Row>
          <Row className="w-full justify-between gap-4">
            <div
              className={clsx(
                'break-anywhere transition-color hover:text-primary-700 focus:text-primary-700 whitespace-normal outline-none',
                textColor
              )}
            >
              {question}
            </div>
            <div className="font-semibold">
              <ContractStatusLabel contract={contract} />
            </div>
          </Row>
        </Link>
      </Col>
    </Row>
  )
}

function DetailedCard(props: {
  ref: MutableRefObject<HTMLDivElement | null>
  contract: Contract
  trackClick: () => void
  path: string
  promotedData?: { adId: string; reward: number }
  className?: string
  hasItems?: boolean
}) {
  const { ref, contract, trackClick, path, promotedData, className, hasItems } =
    props
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
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'
  const user = useUser()

  const showImage = !!coverImageUrl
  const metrics = useSavedContractMetrics(contract)
  return (
    <div
      className={clsx(
        'relative rounded-xl',
        'bg-canvas-0 group flex cursor-pointer flex-col overflow-hidden',
        'border-canvas-0 hover:border-primary-300 border outline-none transition-colors ',
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
      <Col className="gap-2 p-4 py-2">
        {/* Title is link to contract for open in new tab and a11y */}
        <Row className="justify-between">
          <Row onClick={(e) => e.stopPropagation()} className="gap-2">
            <Avatar username={creatorUsername} avatarUrl={creatorAvatarUrl} />
            <Col className="w-full">
              <span>
                <span className="text-sm">
                  <UserLink
                    name={creatorName}
                    username={creatorUsername}
                    createdTime={creatorCreatedTime}
                    className={'font-semibold'}
                  />
                  <span> asked </span>
                </span>
                <span className="text-ink-500 text-sm">
                  {shortenedFromNow(contract.createdTime)}
                </span>
              </span>
              <div className="text-ink-500 text-sm">
                {contract.closeTime ? (
                  <>closes {fromNow(contract.closeTime)}</>
                ) : (
                  'Never closes'
                )}
              </div>
            </Col>
          </Row>
          {promotedData && <ClaimButton {...promotedData} className={'z-10'} />}
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
        <Col className="relative mt-1 h-40 w-full items-center justify-center">
          <div className="absolute inset-0 mt-2 bg-transparent transition-all group-hover:saturate-150">
            <Image
              fill
              alt=""
              sizes="100vw"
              className="object-cover"
              src={coverImageUrl}
            />
          </div>
          <Row className="absolute bottom-0 left-0">
            <PublicMarketGroups
              contract={contract}
              className={'px-4 py-2'}
              justGroups={true}
            />
          </Row>
        </Col>
      )}
      {!showImage && (
        <PublicMarketGroups
          contract={contract}
          className={'px-4 py-2'}
          justGroups={true}
        />
      )}
      {!showImage && (
        <div className="w-full">
          <hr className="border-ink-200 mx-auto w-[calc(100%-1rem)]" />
        </div>
      )}
      <Col className="relative">
        <Row
          className="justify-between gap-2 px-4 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <TradesButton contract={contract} />
          <CommentsButton contract={contract} user={user} />
          <div className="flex items-center gap-1.5 p-1">
            <LikeButton
              contentId={contract.id}
              contentCreatorId={contract.creatorId}
              user={user}
              contentType={'contract'}
              totalLikes={contract.likedByUserCount ?? 0}
              contract={contract}
              contentText={question}
              size="md"
              color="gray"
              className="!px-0"
              trackingLocation={'contract card (feed)'}
            />
          </div>
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

export function FeaturedPill(props: { label?: string }) {
  const label = props.label ?? 'Featured'
  return (
    <div className="from-primary-500 rounded-full bg-gradient-to-br to-fuchsia-500 px-2 text-white">
      {label}
    </div>
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
