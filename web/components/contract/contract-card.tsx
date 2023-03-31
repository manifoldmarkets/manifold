import { memo, ReactNode } from 'react'
import clsx from 'clsx'
import Link from 'next/link'
import Image from 'next/image'
import { ClockIcon, StarIcon, UserIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'

import { Row } from '../layout/row'
import { formatLargeNumber, formatMoney } from 'common/util/format'
import { getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import {
  BinaryContract,
  Contract,
  CPMMContract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
  contractPath,
} from 'common/contract'
import {
  BinaryContractOutcomeLabel,
  CancelLabel,
  FreeResponseOutcomeLabel,
  NumericValueLabel,
} from '../outcome-label'
import { getProbability } from 'common/calculate'
import { MiscDetails, ShowTime } from './contract-details'
import { getValueFromBucket } from 'common/calculate-dpm'
import { getTextColor, QuickBet, QuickOutcomeView } from '../bet/quick-bet'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { trackCallback } from 'web/lib/service/analytics'
import { getMappedValue } from 'common/pseudo-numeric'
import { Tooltip } from '../widgets/tooltip'
import { Card } from '../widgets/card'
import { useContract } from 'web/hooks/use-contracts'
import { ProbOrNumericChange } from './prob-change-table'
import { Spacer } from '../layout/spacer'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { DAY_MS } from 'common/util/time'
import { ContractMetrics } from 'common/calculate-metrics'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { ContractCardView } from 'common/events'
import { Group } from 'common/group'
import { groupRoleType } from '../groups/group-member-modal'
import { GroupContractOptions } from '../groups/group-contract-options'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { getLinkTarget } from 'web/components/widgets/site-link'
import { richTextToString } from 'common/util/parse'
import { ContractStatusLabel } from './contracts-list-entry'
import { LikeButton } from './like-button'
import { CommentsButton } from '../swipe/swipe-comments'
import { BetRow } from '../bet/bet-row'
import { fromNow } from 'web/lib/util/time'
import Router from 'next/router'

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
  trackCardViews?: boolean
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
    trackCardViews,
    fromGroupProps,
  } = props
  const contract = useContract(props.contract.id) ?? props.contract
  const { isResolved, createdTime, featuredLabel, creatorCreatedTime } =
    contract
  const { question, outcomeType } = contract
  const { resolution } = contract

  const user = useUser()
  const { ref } = trackCardViews
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useIsVisible(
        () =>
          track('view market card', {
            contractId: contract.id,
            creatorId: contract.creatorId,
            slug: contract.slug,
          } as ContractCardView),
        true
      )
    : { ref: undefined }
  const marketClosed =
    (contract.closeTime || Infinity) < Date.now() || !!resolution

  const showBinaryQuickBet =
    !marketClosed &&
    (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') &&
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
      ref={ref}
    >
      <Col className="relative flex-1 gap-1 pt-2">
        {!hideDetails && (
          <Row className="justify-between px-4">
            <Row className="z-10 items-center gap-2">
              <Avatar
                username={contract.creatorUsername}
                avatarUrl={contract.creatorAvatarUrl}
                size={4}
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
            (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') && (
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

// TODO: move the "resolution or chance" components out of this file

export function BinaryResolutionOrChance(props: {
  contract: BinaryContract
  className?: string
}) {
  const { contract, className } = props
  const { resolution } = contract
  const textColor = getTextColor(contract)

  const prob = getBinaryProbPercent(contract)

  return (
    <Row className={clsx('items-baseline gap-2 text-3xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base font-light')}>
            Resolved
            {resolution === 'MKT' && ' as '}
          </div>
          <BinaryContractOutcomeLabel
            contract={contract}
            resolution={resolution}
          />
        </>
      ) : (
        <>
          <div className={textColor}>{prob}</div>
          <div className={clsx(textColor, 'text-base font-light')}>chance</div>
        </>
      )}
    </Row>
  )
}

export function FreeResponseResolutionOrChance(props: {
  contract: FreeResponseContract | MultipleChoiceContract
}) {
  const { contract } = props
  const { resolution } = contract
  if (!(resolution === 'CANCEL' || resolution === 'MKT')) return null

  return (
    <Row className="gap-2 text-3xl">
      <div className={clsx('text-base font-light')}>Resolved</div>

      <FreeResponseOutcomeLabel
        contract={contract}
        resolution={resolution}
        truncate="none"
      />
    </Row>
  )
}

export function NumericResolutionOrExpectation(props: {
  contract: NumericContract
}) {
  const { contract } = props
  const { resolution } = contract

  const resolutionValue =
    contract.resolutionValue ?? getValueFromBucket(resolution ?? '', contract)

  // All distributional numeric markets are resolved now
  return (
    <Row className="items-baseline gap-2 text-3xl">
      <div className={clsx('text-base font-light')}>Resolved</div>
      {resolution === 'CANCEL' ? (
        <CancelLabel />
      ) : (
        <NumericValueLabel value={resolutionValue} />
      )}
    </Row>
  )
}

export function PseudoNumericResolutionOrExpectation(props: {
  contract: PseudoNumericContract
  className?: string
}) {
  const { contract, className } = props
  const { resolution, resolutionValue, resolutionProbability } = contract

  const value = resolution
    ? resolutionValue
      ? resolutionValue
      : getMappedValue(contract, resolutionProbability ?? 0)
    : getMappedValue(contract, getProbability(contract))

  return (
    <Row className={clsx('items-baseline gap-2 text-3xl', className)}>
      {resolution ? (
        <>
          <div className="text-base font-light">Resolved</div>
          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <>
              <Tooltip text={value.toFixed(2)} placement="bottom">
                <NumericValueLabel value={value} />
              </Tooltip>
            </>
          )}
        </>
      ) : (
        <>
          <Tooltip text={value.toFixed(2)} placement="bottom">
            {formatLargeNumber(value)}
          </Tooltip>
          <div className="text-base font-light">expected</div>
        </>
      )}
    </Row>
  )
}

export const ContractCardWithPosition = memo(function ContractCardWithPosition(
  props: {
    contract: CPMMContract
    showDailyProfit?: boolean
  } & Parameters<typeof ContractCard>[0]
) {
  const { contract, showDailyProfit, ...contractCardProps } = props

  return (
    <ContractCard contract={contract} {...contractCardProps}>
      <ContractMetricsFooter
        contract={contract}
        showDailyProfit={showDailyProfit}
      />
    </ContractCard>
  )
})

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
  metrics: ContractMetrics
  showDailyProfit?: boolean
}) {
  const { contract, metrics, showDailyProfit } = props
  const { totalShares, maxSharesOutcome, from } = metrics
  const { YES: yesShares, NO: noShares } = totalShares
  const dailyProfit = from ? from.day.profit : 0
  const profit = showDailyProfit ? dailyProfit : metrics.profit

  const yesOutcomeLabel =
    contract.outcomeType === 'PSEUDO_NUMERIC' ? 'HIGHER' : 'YES'
  const noOutcomeLabel =
    contract.outcomeType === 'PSEUDO_NUMERIC' ? 'LOWER' : 'NO'

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
    <div className="text-ink-0 from-primary-500 rounded-full bg-gradient-to-br to-fuchsia-500 px-2 py-0.5 text-xs">
      {label}
    </div>
  )
}

export function ContractCardNew(props: {
  contract: Contract
  className?: string
}) {
  const { className } = props
  const user = useUser()

  const contract = props.contract
  const {
    closeTime,
    isResolved,
    creatorCreatedTime,
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    question,
    description,
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
      } as ContractCardView),
    true
  )

  const isBinaryCpmm = outcomeType === 'BINARY' && mechanism === 'cpmm-1'
  const isClosed = closeTime && closeTime < Date.now()
  const textColor = isClosed && !isResolved ? 'text-ink-500' : 'text-ink-900'
  const descriptionString =
    typeof description === 'string'
      ? description
      : richTextToString(description)

  const showImage = !!coverImageUrl

  const path = contractPath(contract)

  return (
    <div
      className={clsx(
        'relative',
        'border-ink-300 group my-2 flex cursor-pointer flex-col overflow-hidden rounded-xl border-[0.5px]',
        'focus:bg-ink-400/20 lg:hover:bg-ink-400/20 outline-none transition-colors',
        className
      )}
      // we have other links inside this card like the username, so can't make the whole card a button or link
      tabIndex={-1}
      onClick={(e) => {
        Router.push(path)
        e.currentTarget.focus() // focus the div like a button, for style
      }}
    >
      <Col
        className={clsx(
          showImage ? 'bg-canvas-0/95' : 'bg-canvas-0/70',
          'gap-2 py-2 px-4 backdrop-blur-sm'
        )}
      >
        <Row className="text-ink-500 items-center gap-3 overflow-hidden text-sm">
          <Row className="gap-2" onClick={(e) => e.stopPropagation()}>
            <Avatar
              username={creatorUsername}
              avatarUrl={creatorAvatarUrl}
              size="xs"
            />
            <UserLink
              name={creatorName}
              username={creatorUsername}
              className="text-ink-500 h-[24px] text-sm"
              createdTime={creatorCreatedTime}
            />
          </Row>
          <div className="flex-1" />
          <ReasonChosen contract={contract} />
        </Row>

        {/* Title is link to contract for open in new tab and a11y */}
        <Link
          href={path}
          className={clsx(
            'break-anywhere group-hover:text-primary-800 transition-color focus:text-primary-800 group-focus:text-primary-800 whitespace-normal font-medium outline-none',
            textColor
          )}
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
              />
            </div>

            <CommentsButton contract={contract} user={user} />
          </Row>
        </Row>

        {isBinaryCpmm && metrics && metrics.hasShares && (
          <YourMetricsFooter metrics={metrics} />
        )}
      </Col>

      {showImage && (
        <>
          <div className="h-40" />
          <div className="absolute inset-0 -z-10">
            <Image
              fill
              alt={descriptionString}
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
              <UserIcon className="h-4 w-4" />
              <div>{uniqueBettorCount ?? 0}</div>
            </Row>
          </Tooltip>
        )}
      </Row>
    </Row>
  )
}

function YourMetricsFooter(props: { metrics: ContractMetrics }) {
  const { metrics } = props
  const { totalShares, maxSharesOutcome, profit } = metrics
  const { YES: yesShares, NO: noShares } = totalShares

  return (
    <Row className="border-ink-200 my-2 items-center gap-4 rounded border p-2 text-sm">
      <Row className="items-center gap-2">
        <span className="text-ink-500">Payout on {maxSharesOutcome}</span>
        <span className="text-ink-600 font-semibold">
          {maxSharesOutcome === 'YES'
            ? formatMoney(yesShares)
            : formatMoney(noShares)}{' '}
        </span>
      </Row>
      <Row className="ml-auto items-center gap-2">
        <div className="text-ink-500">Profit </div>
        <div className={clsx('text-ink-600 font-semibold')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Row>
    </Row>
  )
}
