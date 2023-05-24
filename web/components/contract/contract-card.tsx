import { ClockIcon, StarIcon, UserIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import { memo, ReactNode, useState } from 'react'

import { Contract, contractPath, CPMMContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { ContractCardView } from 'common/events'
import { Group } from 'common/group'
import { STONK_NO, STONK_YES } from 'common/stonk'
import { formatMoney } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { DAY_MS } from 'common/util/time'
import Router from 'next/router'
import toast from 'react-hot-toast'
import { getLinkTarget } from 'web/components/widgets/site-link'
import { useRealtimeContract } from 'web/hooks/use-contract-supabase'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { redeemBoost } from 'web/lib/firebase/api'
import { track, trackCallback } from 'web/lib/service/analytics'
import { fromNow } from 'web/lib/util/time'
import { BetRow } from '../bet/bet-row'
import { QuickBet, QuickOutcomeView } from '../bet/quick-bet'
import { GroupContractOptions } from '../groups/group-contract-options'
import { groupRoleType } from '../groups/group-member-modal'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import { CommentsButton } from '../swipe/swipe-comments'
import { Avatar } from '../widgets/avatar'
import { Card } from '../widgets/card'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { MiscDetails, ShowTime } from './contract-details'
import { ContractStatusLabel } from './contracts-table'
import { LikeButton } from './like-button'
import { ProbOrNumericChange } from './prob-change-table'

export const ContractCard = memo(function ContractCard(props: {
  contract: Contract
  showTime?: ShowTime
  className?: string
  questionClass?: string
  onClick?: () => void
  hideQuickBet?: boolean
  hideGroupLink?: boolean
  trackingPostfix?: string
  noLinkAvatar?: boolean
  newTab?: boolean
  showImage?: boolean
  showDescription?: boolean
  children?: ReactNode
  pinned?: boolean
  hideQuestion?: boolean
  hideDetails?: boolean
  numAnswersFR?: number
  fromGroupProps?: {
    group: Group
    userRole: groupRoleType | null
  }
}) {
  const {
    showTime,
    className,
    questionClass,
    onClick,
    hideQuickBet,
    hideGroupLink,
    trackingPostfix,
    noLinkAvatar,
    newTab,
    showImage,
    showDescription,
    children,
    pinned,
    hideQuestion,
    hideDetails,
    numAnswersFR,
    fromGroupProps,
  } = props
  const contract = useRealtimeContract(props.contract.id) ?? props.contract
  const { isResolved, createdTime, featuredLabel, creatorCreatedTime } =
    contract
  const { question, outcomeType } = contract
  const { resolution } = contract

  const user = useUser()
  const marketClosed =
    (contract.closeTime || Infinity) < Date.now() || !!resolution

  const showBinaryQuickBet =
    !marketClosed &&
    (outcomeType === 'BINARY' ||
      outcomeType === 'PSEUDO_NUMERIC' ||
      outcomeType === 'STONK') &&
    !hideQuickBet

  const isNew = createdTime > Date.now() - DAY_MS && !isResolved
  const hasImage = contract.coverImageUrl && showImage
  const href = contractPath(contract)
  return (
    <Card
      className={clsx(
        'group relative flex w-full leading-normal',
        hasImage ? 'ub-cover-image' : '',
        className
      )}
    >
      <Col className="relative flex-1 gap-1 pt-2">
        {!hideDetails && (
          <Row className="justify-between px-4">
            <Row className="z-10 items-center gap-2">
              <Avatar
                username={contract.creatorUsername}
                avatarUrl={contract.creatorAvatarUrl}
                size={'2xs'}
                noLink={noLinkAvatar}
              />
              <UserLink
                name={contract.creatorName}
                username={contract.creatorUsername}
                noLink={noLinkAvatar}
                className="text-ink-400 text-sm"
                createdTime={creatorCreatedTime}
              />
            </Row>
            <Row className="gap-1">
              {pinned && <FeaturedPill label={featuredLabel} />}
              {/* {isNew && <NewContractBadge />} */}
              {fromGroupProps &&
                fromGroupProps.userRole &&
                (fromGroupProps.userRole == 'admin' ||
                  fromGroupProps.userRole == 'moderator') && (
                  <div className="z-20">
                    <GroupContractOptions
                      group={fromGroupProps.group}
                      contract={contract}
                    />
                  </div>
                )}
            </Row>
          </Row>
        )}
        {/* overlay question on image */}
        {hasImage && !hideQuestion && (
          <div className="relative mb-2">
            <div className="relative h-36">
              <Image
                fill
                alt={contract.question}
                sizes="100vw"
                className="object-cover"
                src={contract.coverImageUrl ?? ''}
              />
            </div>
            <div className="absolute bottom-0 w-full">
              <div
                className={clsx(
                  'break-anywhere bg-gradient-to-t from-black px-4 pb-2 pt-12 text-xl font-semibold text-white',
                  questionClass
                )}
              >
                <div className="drop-shadow-lg">{question}</div>
              </div>
            </div>
          </div>
        )}

        <Col className="gap-1 px-4 pb-1">
          {/* question is here if not overlaid on an image */}
          {!hasImage && !hideQuestion && (
            <div
              className={clsx(
                'break-anywhere text-md text-ink-900 pb-2 font-medium',
                questionClass
              )}
            >
              {question}
            </div>
          )}
          {showBinaryQuickBet ? (
            <QuickBet contract={contract} user={user} className="z-10" />
          ) : (
            <QuickOutcomeView contract={contract} numAnswersFR={numAnswersFR} />
          )}
        </Col>

        {showDescription && (
          <DescriptionRow description={contract.description} />
        )}

        <Row className={clsx('gap-1 px-4', children ? '' : 'mb-2')}>
          <MiscDetails
            contract={contract}
            showTime={showTime}
            hideGroupLink={hideGroupLink}
          />

          {!isNew &&
            (outcomeType === 'BINARY' ||
              outcomeType === 'PSEUDO_NUMERIC' ||
              outcomeType === 'STONK') && (
              <Tooltip text={'Daily price change'} className={'z-10'}>
                <ProbOrNumericChange
                  className="py-2 px-2"
                  contract={contract as CPMMContract}
                  user={user}
                />
              </Tooltip>
            )}
        </Row>
        {children}
      </Col>

      {/* Add click layer */}
      {onClick ? (
        <a
          className="absolute top-0 left-0 right-0 bottom-0"
          href={href}
          onClick={(e) => {
            // Let the browser handle the link click (opens in new tab).
            if (e.ctrlKey || e.metaKey) {
              track('click market card' + (trackingPostfix ?? ''), {
                slug: contract.slug,
                contractId: contract.id,
              })
            } else {
              e.preventDefault()
              onClick()
            }
          }}
        />
      ) : (
        <Link
          href={href}
          onClick={trackCallback(
            'click market card' + (trackingPostfix ?? ''),
            {
              slug: contract.slug,
              contractId: contract.id,
            }
          )}
          className="absolute top-0 left-0 right-0 bottom-0"
          target={newTab ? getLinkTarget(href, newTab) : '_self'}
        />
      )}
    </Card>
  )
})

function DescriptionRow(props: { description: string | JSONContent }) {
  const { description } = props

  const descriptionString =
    typeof description === 'string'
      ? description
      : richTextToString(description)

  return (
    <Row className="px-4 pb-1">
      <div className="break-anywhere line-clamp-6 text-sm font-thin">
        {descriptionString}
      </div>
    </Row>
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

export function ContractCardNew(props: {
  contract: Contract
  promotedData?: { adId: string; reward: number }
  /** location of the card, to disambiguate card click events */
  trackingPostfix?: string
  className?: string
}) {
  const { className, promotedData, trackingPostfix } = props
  const user = useUser()

  const contract = useRealtimeContract(props.contract.id) ?? props.contract
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
        'border-ink-200 group my-2 flex cursor-pointer flex-col overflow-hidden rounded-xl border',
        'hover:border-ink-400 focus:border-ink-400 outline-none transition-colors',
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
      <Col className="bg-canvas-0 gap-2 py-2 px-4">
        <Row className="text-ink-600 items-center gap-3 overflow-hidden text-sm">
          <Row className="gap-2" onClick={(e) => e.stopPropagation()}>
            <Avatar
              username={creatorUsername}
              avatarUrl={creatorAvatarUrl}
              size="xs"
            />
            <UserLink
              name={creatorName}
              username={creatorUsername}
              className="text-ink-600 h-[24px] text-sm"
              createdTime={creatorCreatedTime}
            />
          </Row>
          <div className="flex-1" />
          {promotedData ? <BoostPill /> : <ReasonChosen contract={contract} />}
        </Row>

        {/* Title is link to contract for open in new tab and a11y */}
        <Link
          href={path}
          className={clsx(
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
          <div className="text-base font-semibold">
            <ContractStatusLabel contract={contract} chanceLabel />
          </div>

          {isBinaryCpmm && (
            <div className="flex gap-2">
              <BetRow contract={contract} noUser={!user} />
            </div>
          )}

          <Row
            className="ml-auto items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
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
        </Row>

        {isBinaryCpmm && metrics && metrics.hasShares && (
          <YourMetricsFooter metrics={metrics} />
        )}

        {!showImage && promotedData && (
          <div className="flex justify-center">
            <ClaimButton {...promotedData} />
          </div>
        )}
      </Col>

      {showImage && (
        <>
          <div className="flex h-40 w-full items-center justify-center">
            {promotedData && <ClaimButton {...promotedData} className="mt-2" />}
          </div>
          <div className="absolute inset-0 -z-10 transition-all group-hover:saturate-150">
            <Image
              fill
              alt=""
              sizes="100vw"
              className="object-cover"
              src={coverImageUrl}
            />
          </div>
        </>
      )}
    </div>
  )
}

const BoostPill = () => (
  <Tooltip text="They're paying you to see this" placement="right">
    <FeaturedPill label="Boosted" />
  </Tooltip>
)

function ReasonChosen(props: { contract: Contract }) {
  const { contract } = props
  const { createdTime, closeTime, uniqueBettorCount } = contract

  const now = Date.now()
  const reason =
    createdTime > now - DAY_MS
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
        'rounded-lg bg-yellow-300 bg-gradient-to-br from-yellow-400 via-yellow-200 to-yellow-300 py-2.5 px-6 font-semibold text-gray-900 transition-colors',
        'hover:via-yellow-100 focus:via-yellow-100',
        'disabled:bg-canvas-50 disabled:text-ink-800 disabled:cursor-default disabled:bg-none',
        className
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
        `Claim ${formatMoney(reward)}`
      )}
    </button>
  )
}
