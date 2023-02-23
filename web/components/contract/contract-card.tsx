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
  formatPercent,
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
import {
  getOutcomeProbability,
  getProbability,
  getTopAnswer,
} from 'common/calculate'
import { MiscDetails, ShowTime } from './contract-details'
import { getExpectedValue, getValueFromBucket } from 'common/calculate-dpm'
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
                className="text-sm text-gray-400"
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
                  'break-anywhere bg-gradient-to-t from-slate-900 px-4 pb-2 pt-12 text-xl font-semibold text-white',
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
                'break-anywhere text-md pb-2 font-medium text-gray-900',
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
  truncate: 'short' | 'long' | 'none'
  className?: string
}) {
  const { contract, truncate, className } = props
  const { resolution } = contract

  const topAnswer = getTopAnswer(contract)
  const textColor = getTextColor(contract)

  return (
    <Col className={clsx(resolution ? 'text-3xl' : 'text-xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base text-gray-500 sm:hidden')}>
            Resolved
          </div>
          {(resolution === 'CANCEL' || resolution === 'MKT') && (
            <FreeResponseOutcomeLabel
              contract={contract}
              resolution={resolution}
              truncate={truncate}
              answerClassName="text-3xl uppercase text-blue-500"
            />
          )}
        </>
      ) : (
        topAnswer && (
          <Row className="items-center gap-6">
            <Col className={clsx('text-3xl', textColor)}>
              <div>
                {formatPercent(getOutcomeProbability(contract, topAnswer.id))}
              </div>
              <div className="text-base">chance</div>
            </Col>
          </Row>
        )
      )}
    </Col>
  )
}

export function NumericResolutionOrExpectation(props: {
  contract: NumericContract
  className?: string
}) {
  const { contract, className } = props
  const { resolution } = contract
  const textColor = getTextColor(contract)

  const resolutionValue =
    contract.resolutionValue ?? getValueFromBucket(resolution ?? '', contract)

  return (
    <Col className={clsx(resolution ? 'text-3xl' : 'text-xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base text-gray-500')}>Resolved</div>

          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <div className="text-blue-400">
              {formatLargeNumber(resolutionValue)}
            </div>
          )}
        </>
      ) : (
        <>
          <div className={clsx('text-3xl', textColor)}>
            {formatLargeNumber(getExpectedValue(contract))}
          </div>
          <div className={clsx('text-base', textColor)}>expected</div>
        </>
      )}
    </Col>
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
    <div className="columns-2 items-center gap-4 rounded-b-[7px] bg-gray-100 px-4 pt-1 pb-2 text-sm">
      <Col>
        <span className="text-xs text-gray-400">Your position</span>
        <div className="text-sm text-gray-600">
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
        <div className="text-xs text-gray-400">
          {' '}
          Your {showDailyProfit ? 'daily' : 'total'} profit{' '}
        </div>
        <div className={clsx('text-sm font-semibold text-gray-600')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Col>
    </div>
  )
}

export function FeaturedPill(props: { label?: string }) {
  const label = props.label ?? 'Featured'
  return (
    <div className="rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-2 py-0.5 text-xs text-white">
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
  const textColor = isClosed && !isResolved ? 'text-gray-500' : 'text-gray-900'
  const descriptionString =
    typeof description === 'string'
      ? description
      : richTextToString(description)

  return (
    <Link
      href={contractPath(contract)}
      className={clsx(
        'group flex flex-col gap-2 whitespace-nowrap rounded-sm py-3 px-4',
        'bg-white focus:bg-[#fafaff] lg:hover:bg-[#fafaff]',
        className
      )}
    >
      <Row className="items-center gap-3 text-sm text-gray-500">
        <Row className="z-10 gap-2">
          <Avatar
            username={creatorUsername}
            avatarUrl={creatorAvatarUrl}
            size="xs"
          />
          <UserLink
            name={creatorName}
            username={creatorUsername}
            className="h-[24px] text-sm text-gray-500"
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

      {coverImageUrl && (
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

      <Row ref={ref} className="items-center gap-3 text-sm text-gray-500">
        <div className="text-base font-semibold">
          <ContractStatusLabel contract={contract} chanceLabel />
        </div>

        {isBinaryCpmm && <BetRow buttonClassName="z-10" contract={contract} />}

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
    <Row className="items-center gap-4 rounded bg-gray-50 p-2 text-sm">
      <Row className="items-center gap-2">
        <span className="text-gray-500">Your position</span>
        <div className="text-gray-600">
          <span className="font-semibold">
            {maxSharesOutcome === 'YES'
              ? formatWithCommas(yesShares)
              : formatWithCommas(noShares)}{' '}
          </span>
          {maxSharesOutcome} shares
        </div>
      </Row>
      <Row className="ml-auto items-center gap-2">
        <div className="text-gray-500">Your profit </div>
        <div className={clsx('font-semibold text-gray-600')}>
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Row>
    </Row>
  )
}
