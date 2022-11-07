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
  CPMMBinaryContract,
  CPMMContract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
} from 'common/contract'
import {
  AnswerLabel,
  BinaryContractOutcomeLabel,
  CancelLabel,
  FreeResponseOutcomeLabel,
} from '../outcome-label'
import {
  getOutcomeProbability,
  getProbability,
  getTopAnswer,
} from 'common/calculate'
import { AvatarDetails, MiscDetails, ShowTime } from './contract-details'
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
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { ProbOrNumericChange } from './prob-change-table'
import { Spacer } from '../layout/spacer'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { DAY_MS } from 'common/util/time'
import { ContractMetrics } from 'common/calculate-metrics'

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
  children?: ReactNode
  pinned?: boolean
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
    children,
    pinned,
  } = props
  const contract = useContract(props.contract.id) ?? props.contract
  const { isResolved, createdTime } = contract
  const { question, outcomeType } = contract
  const { resolution } = contract

  const user = useUser()

  const marketClosed =
    (contract.closeTime || Infinity) < Date.now() || !!resolution

  const showBinaryQuickBet =
    user &&
    !marketClosed &&
    (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') &&
    !hideQuickBet

  const isNew = createdTime > Date.now() - DAY_MS && !isResolved
  const hasImage = contract.coverImageUrl && showImage
  return (
    <Card
      className={clsx(
        'font-readex-pro group relative flex w-full leading-normal',
        hasImage ? 'ub-cover-image' : '',
        className
      )}
    >
      <Col className="relative flex-1 gap-1 pt-2">
        <Row className="justify-between px-4 ">
          <AvatarDetails contract={contract} noLink={noLinkAvatar} />
          <Row className="gap-1">
            {pinned && <FeaturedPill />}
            {/* {isNew && <NewContractBadge />} */}
          </Row>
        </Row>
        {/* overlay question on image */}
        {hasImage && (
          <div className="relative mb-2">
            <img
              className="h-80 w-full object-cover "
              src={contract.coverImageUrl}
            />
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

        <Col className="gap-1 px-4 pb-1 ">
          {/* question is here if not overlaid on an image */}
          {!hasImage && (
            <div
              className={clsx(
                'break-anywhere text-greyscale-7 text-md pb-2 font-medium',
                questionClass
              )}
            >
              {question}
            </div>
          )}
          {showBinaryQuickBet ? (
            <QuickBet contract={contract} user={user} className="z-10" />
          ) : (
            <QuickOutcomeView contract={contract} />
          )}
        </Col>
        <Row className={clsx('gap-1 px-4', children ? '' : 'mb-2')}>
          <MiscDetails
            contract={contract}
            showTime={showTime}
            hideGroupLink={hideGroupLink}
          />
          {!isNew &&
            (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') && (
              <ProbOrNumericChange
                className="py-2 px-2"
                contract={contract as CPMMContract}
                user={user}
              />
            )}
        </Row>
        {children}
      </Col>

      {/* Add click layer */}
      {onClick ? (
        <a
          className="absolute top-0 left-0 right-0 bottom-0"
          href={contractPath(contract)}
          onClick={(e) => {
            // Let the browser handle the link click (opens in new tab).
            if (e.ctrlKey || e.metaKey) return

            e.preventDefault()
            track('click market card' + (trackingPostfix ?? ''), {
              slug: contract.slug,
              contractId: contract.id,
            })
            onClick()
          }}
        />
      ) : (
        <Link
          href={contractPath(contract)}
          onClick={trackCallback(
            'click market card' + (trackingPostfix ?? ''),
            {
              slug: contract.slug,
              contractId: contract.id,
            }
          )}
          className="absolute top-0 left-0 right-0 bottom-0"
          target={newTab ? '_blank' : '_self'}
        />
      )}
    </Card>
  )
})

export function BinaryResolutionOrChance(props: {
  contract: BinaryContract
  large?: boolean
  className?: string
  probAfter?: number // 0 to 1
}) {
  const { contract, large, className, probAfter } = props
  const { resolution } = contract
  const textColor = getTextColor(contract)

  const before = getBinaryProbPercent(contract)
  const after = probAfter && formatPercent(probAfter)
  const probChanged = before !== after

  return (
    <Col
      className={clsx('items-end', large ? 'text-4xl' : 'text-3xl', className)}
    >
      {resolution ? (
        <Row className="flex items-start">
          <div>
            <div
              className={clsx('text-gray-500', large ? 'text-xl' : 'text-base')}
            >
              Resolved
            </div>
            <BinaryContractOutcomeLabel
              contract={contract}
              resolution={resolution}
            />
          </div>
        </Row>
      ) : (
        <>
          {probAfter && probChanged ? (
            <div>
              <span className="text-gray-500 line-through">{before}</span>
              <span className={textColor}>{after}</span>
            </div>
          ) : (
            <div className={textColor}>{before}</div>
          )}
          <div className={clsx(textColor, large ? 'text-xl' : 'text-base')}>
            chance
          </div>
        </>
      )}
    </Col>
  )
}

export function FreeResponseTopAnswer(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  className?: string
}) {
  const { contract } = props

  const topAnswer = getTopAnswer(contract)

  return topAnswer ? (
    <AnswerLabel
      className="!text-greyscale-7 text-md"
      answer={topAnswer}
      truncate="medium"
    />
  ) : null
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
  const textColor = `text-blue-400`

  const value = resolution
    ? resolutionValue
      ? resolutionValue
      : getMappedValue(contract)(resolutionProbability ?? 0)
    : getMappedValue(contract)(getProbability(contract))

  return (
    <Col className={clsx(resolution ? 'text-3xl' : 'text-xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base text-gray-500')}>Resolved</div>

          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <Tooltip className={textColor} text={value.toFixed(2)}>
              {formatLargeNumber(value)}
            </Tooltip>
          )}
        </>
      ) : (
        <>
          <Tooltip
            className={clsx('text-3xl', textColor)}
            text={value.toFixed(2)}
          >
            {formatLargeNumber(value)}
          </Tooltip>
          <div className={clsx('text-base', textColor)}>expected</div>
        </>
      )}
    </Col>
  )
}

export const ContractCardWithPosition = memo(
  function ContractCardWithPosition(props: {
    contract: CPMMContract
    noLinkAvatar?: boolean
    showDailyProfit?: boolean
    className?: string
    showImage?: boolean
  }) {
    const {
      noLinkAvatar,
      showDailyProfit,
      className,
      showImage,
    } = props
    const contract = (useContract(props.contract.id) ??
      props.contract) as CPMMBinaryContract

    const user = useUser()
    const userBets = useUserContractBets(user?.id, contract.id)
    const metrics = useSavedContractMetrics(contract, userBets)

    return (
      <ContractCard
        contract={contract}
        noLinkAvatar={noLinkAvatar}
        showImage={showImage}
        className={clsx(
          className,
          'mb-4 break-inside-avoid-column overflow-hidden'
        )}
      >
        {user && metrics && metrics.hasShares ? (
          <MetricsFooter
            contract={contract}
            metrics={metrics}
            showDailyProfit={showDailyProfit}
          />
        ) : (
          <Spacer h={2} />
        )}
      </ContractCard>
    )
  }
)

function MetricsFooter(props: {
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
    <Row
      className={clsx(
        'bg-greyscale-1.5 items-center gap-4 pl-4 pr-4 pt-1 pb-2 text-sm'
      )}
    >
      <Col className="w-1/2">
        <span className="text-greyscale-4 text-xs"> Your position </span>
        <div className="text-greyscale-6 text-sm">
          <span className="font-semibold">
            {maxSharesOutcome === 'YES'
              ? formatWithCommas(yesShares)
              : formatWithCommas(noShares)}{' '}
          </span>
          {maxSharesOutcome === 'YES' ? yesOutcomeLabel : noOutcomeLabel}
          {' shares'}
        </div>
      </Col>
      <Col className="w-1/2">
        <div className="text-greyscale-4 text-xs">
          {' '}
          Your {showDailyProfit ? 'daily' : 'total'} profit{' '}
        </div>
        <div
          className={clsx(
            'text-greyscale-6 text-sm font-semibold'
            // : profit > 0
            // ? 'text-teal-500'
            // : 'text-red-600'
          )}
        >
          {profit ? formatMoney(profit) : '--'}
        </div>
      </Col>
    </Row>
  )
}

export function FeaturedPill() {
  return (
    <div className="rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-2 py-0.5 text-xs text-white">
      Featured
    </div>
  )
}
