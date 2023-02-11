import clsx from 'clsx'
import Link from 'next/link'
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
import { memo, ReactNode } from 'react'
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
import { JSONContent } from '@tiptap/core'
import { richTextToString } from 'common/util/parse'

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
