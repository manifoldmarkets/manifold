import {
  ChatIcon,
  FireIcon,
  PresentationChartLineIcon,
  SparklesIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import Router from 'next/router'

import { Contract, contractPath } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ContractCardView } from 'common/events'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useFirebasePublicAndRealtimePrivateContract } from 'web/hooks/use-contract-supabase'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { fromNow } from 'web/lib/util/time'
import { ClaimButton } from '../ad/claim-ad-button'
import { BetRow } from '../bet/bet-row'
import { QuickOutcomeView } from '../bet/quick-bet'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { CommentsButton } from '../swipe/swipe-comments'
import { Avatar } from '../widgets/avatar'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { LikeButton } from './like-button'
import { TradesButton } from './trades-button'

export function FeedContractCard(props: {
  contract: Contract
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  hasItems?: boolean
  item?: FeedTimelineItem
}) {
  const { promotedData, trackingPostfix, hasItems, item } = props
  const user = useUser()

  const contract =
    useFirebasePublicAndRealtimePrivateContract(
      props.contract.visibility,
      props.contract.id
    ) ?? props.contract

  // Note: if we ever make cards taller than viewport, we'll need to pass a lower threshold to the useIsVisible hook

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

  return (
    <div ref={ref}>
      {hasItems ? (
        <SimpleCard
          contract={contract}
          item={item}
          trackClick={trackClick}
          user={user}
        />
      ) : (
        <DetailedCard
          contract={contract}
          trackClick={trackClick}
          user={user}
          promotedData={promotedData}
          item={item}
        />
      )}
    </div>
  )
}

function SimpleCard(props: {
  contract: Contract
  trackClick: () => void
  user: User | null | undefined
  item?: FeedTimelineItem
}) {
  const { contract, user, trackClick, item } = props
  const { question, outcomeType, mechanism, closeTime, isResolved } = contract
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'

  return (
    <Row>
      <Col className="justify-end">
        <div className="dark:border-ink-200 border-ink-300 ml-2 h-1/3 w-4 rounded-tl-xl border-2 border-b-0 border-r-0 sm:ml-4 sm:w-6" />
      </Col>
      <Col
        className={
          'bg-canvas-0 border-ink-200 mt-2 grow justify-between gap-2 overflow-hidden border-l-4 border-b pl-2 pr-4 pt-2 pb-3'
        }
      >
        <Row className="w-full items-start gap-2">
          <Avatar
            username={contract.creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            size="2xs"
            className="mt-1"
          />
          <Link
            className={clsx(
              'break-anywhere transition-color hover:text-primary-700 focus:text-primary-700 whitespace-normal outline-none',
              textColor
            )}
            onClick={trackClick}
            href={contractPath(contract)}
          >
            {question}
          </Link>
        </Row>

        <Row className="text-ink-500 w-full items-center gap-3 text-sm">
          <QuickOutcomeView
            contract={contract}
            showChange={
              item?.dataType === 'contract_probability_changed' ||
              item?.dataType === 'trending_contract'
            }
            size="sm"
          />

          {isBinaryCpmm && <BetRow contract={contract} user={user} />}
        </Row>
      </Col>
    </Row>
  )
}

function ReasonIcon(props: { item?: FeedTimelineItem }) {
  const { item } = props
  if (!item) return null

  const { reasonDescription, dataType } = item

  const SpecificIcon =
    (
      {
        trending_contract: FireIcon,
        new_comment: ChatIcon,
        popular_comment: ChatIcon,
        new_contract: SparklesIcon,
        contract_probability_changed: PresentationChartLineIcon,
      } as any
    )[dataType] ?? FireIcon

  return (
    <Tooltip text={reasonDescription} className="align-middle">
      <SpecificIcon className="text-ink-400 h-5 w-5" />
    </Tooltip>
  )
}

function DetailedCard(props: {
  contract: Contract
  trackClick: () => void
  user: User | null | undefined
  promotedData?: { adId: string; reward: number }
  item?: FeedTimelineItem
}) {
  const { user, contract, trackClick, promotedData, item } = props
  const {
    closeTime,
    isResolved,
    creatorCreatedTime,
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    question,
    outcomeType,
    mechanism,
  } = contract
  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-600' : 'text-ink-900'

  const path = contractPath(contract)

  const metrics = useSavedContractMetrics(contract)
  return (
    <div
      className={clsx(
        'relative rounded-xl',
        'bg-canvas-0 group flex cursor-pointer flex-col overflow-hidden',
        'border-canvas-0 hover:border-primary-300 focus:border-primary-300 border outline-none transition-colors'
      )}
      // we have other links inside this card like the username, so can't make the whole card a button or link
      tabIndex={-1}
      onClick={(e) => {
        trackClick()
        Router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
    >
      <Col className="gap-2 p-1">
        {/* Title is link to contract for open in new tab and a11y */}
        <Row className="justify-between">
          <Row onClick={(e) => e.stopPropagation()} className=" gap-2">
            <Avatar username={creatorUsername} avatarUrl={creatorAvatarUrl} />
            <Col className="w-full gap-1">
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
              <Row className="items-center gap-1 whitespace-nowrap text-sm">
                <UserLink
                  name={creatorName}
                  username={creatorUsername}
                  createdTime={creatorCreatedTime}
                  className={'overflow-none flex-shrink '}
                />
                asked
                <span className="text-ink-400 text-sm">
                  {fromNow(contract.createdTime)}
                </span>
              </Row>
            </Col>
          </Row>

          {promotedData ? (
            <ClaimButton {...promotedData} className={'z-10'} />
          ) : (
            !item?.isCopied && <ReasonIcon item={item} />
          )}
        </Row>

        <Row className="text-ink-500 items-center gap-3 text-sm">
          <QuickOutcomeView
            contract={contract}
            showChange={
              item?.dataType === 'contract_probability_changed' ||
              item?.dataType === 'trending_contract'
            }
            size="sm"
          />

          {isBinaryCpmm && <BetRow contract={contract} user={user} />}
        </Row>

        {isBinaryCpmm && metrics && metrics.hasShares && (
          <YourMetricsFooter metrics={metrics} />
        )}
      </Col>

      <Col className="relative">
        <Row
          className="justify-between px-4 py-1"
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
