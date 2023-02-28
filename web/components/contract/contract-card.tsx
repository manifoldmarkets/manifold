import { memo, ReactNode } from 'react'
import clsx from 'clsx'
import Link from 'next/link'
import { UserIcon } from '@heroicons/react/outline'
import { FireIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'

import { Row } from '../layout/row'
import {
  formatLargeNumber,
  formatMoney,
  formatWithCommas,
} from 'common/util/format'
import { contractPath, getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import {
  BinaryContract,
  Contract,
  CPMMContract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
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
import Image from 'next/image'
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
                  'break-anywhere text-ink-0 from-ink-900 bg-gradient-to-t px-4 pb-2 pt-12 text-xl font-semibold',
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
        <span className="text-ink-400 text-xs">Your position</span>
        <div className="text-ink-600 text-sm">
          <span className="font-semibold">
            {maxSharesOutcome === 'YES'
              ? formatWithCommas(yesShares)
              : formatWithCommas(noShares)}{' '}
          </span>
          {maxSharesOutcome === 'YES' ? yesOutcomeLabel : noOutcomeLabel}
          {' shares'}
        </div>
      </Col>
      <Col>
        <div className="text-ink-400 text-xs">
          {' '}
          Your {showDailyProfit ? 'daily' : 'total'} profit{' '}
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
  hideImage?: boolean
  className?: string
}) {
  const { hideImage, className } = props
  const user = useUser()

  const contract = useContract(props.contract.id) ?? props.contract
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
    uniqueBettorCount,
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

  return (
    <Link
      href={contractPath(contract)}
      className={clsx(
        'group flex flex-col gap-2 whitespace-nowrap rounded-sm py-3 px-4',
        'bg-canvas-0 focus:bg-ink-300/10 lg:hover:bg-ink-300/10',
        className
      )}
    >
      <Row className="text-ink-500 items-center gap-3 text-sm">
        <Row className="z-10 gap-2">
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
        {!isClosed && contract.elasticity < 0.5 ? (
          <Tooltip text={'High-stakes'} className={'z-10'}>
            <FireIcon className="h-5 w-5 text-blue-700" />
          </Tooltip>
        ) : null}
        <Tooltip
          text={`${uniqueBettorCount} unique traders`}
          placement="bottom"
          className={'z-10'}
        >
          <Row className={'shrink-0 items-center gap-2'}>
            <UserIcon className="h-5 w-5" />
            <div className="">{uniqueBettorCount || '0'}</div>
          </Row>
        </Tooltip>
      </Row>

      <div
        className={clsx(
          'break-anywhere whitespace-normal font-medium',
          textColor
        )}
      >
        {question}
      </div>

      {!hideImage && coverImageUrl && (
        <div className="relative h-36 lg:h-48">
          <Image
            fill
            alt={descriptionString}
            sizes="100vw"
            className="object-cover"
            src={coverImageUrl ?? ''}
          />
        </div>
      )}

      <Row ref={ref} className="text-ink-500 items-center gap-3 text-sm">
        <div className="text-base font-semibold">
          <ContractStatusLabel contract={contract} chanceLabel />
        </div>

        {user !== null && isBinaryCpmm && (
          <BetRow buttonClassName="z-10" contract={contract} />
        )}

        <Row
          className="z-20 ml-auto items-center gap-2"
          onClick={(e) => {
            // Don't navigate to the contract page when clicking buttons.
            e.preventDefault()
          }}
        >
          <CommentsButton contract={contract} color="gray" size="md" />
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
            className={'!mx-0 gap-2 drop-shadow-sm'}
          />
        </Row>
      </Row>

      {isBinaryCpmm && metrics && metrics.hasShares && (
        <YourMetricsFooter metrics={metrics} />
      )}
    </Link>
  )
}

function YourMetricsFooter(props: { metrics: ContractMetrics }) {
  const { metrics } = props
  const { totalShares, maxSharesOutcome, profit } = metrics
  const { YES: yesShares, NO: noShares } = totalShares

  return (
    <Row className="bg-canvas-50 items-center gap-4 rounded p-2 text-sm">
      <Row className="items-center gap-2">
        <span className="text-ink-500">Your position</span>
        <div className="text-ink-600">
          <span className="font-semibold">
            {maxSharesOutcome === 'YES'
              ? formatWithCommas(yesShares)
              : formatWithCommas(noShares)}{' '}
          </span>
          {maxSharesOutcome} shares
        </div>
      </Row>
      <Row className="ml-auto items-center gap-2">
        <div className="text-ink-500">Your profit </div>
        <div className={clsx('text-ink-600 font-semibold')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Row>
    </Row>
  )
}
