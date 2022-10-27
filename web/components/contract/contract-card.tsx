import clsx from 'clsx'
import Link from 'next/link'
import { Row } from '../layout/row'
import {
  formatLargeNumber,
  formatMoney,
  formatPercent,
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
import { useUser, useUserContractMetrics } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { trackCallback } from 'web/lib/service/analytics'
import { getMappedValue } from 'common/pseudo-numeric'
import { Tooltip } from '../widgets/tooltip'
import { SiteLink } from '../widgets/site-link'
import { ProbOrNumericChange } from './prob-change-table'
import { Card } from '../widgets/card'
import { floatingEqual } from 'common/util/math'
import { ENV_CONFIG } from 'common/envs/constants'
import { useContract } from 'web/hooks/use-contracts'

export function ContractCard(props: {
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
  } = props
  const contract = useContract(props.contract.id) ?? props.contract
  const { question, outcomeType } = contract
  const { resolution } = contract

  const user = useUser()

  const marketClosed =
    (contract.closeTime || Infinity) < Date.now() || !!resolution

  const showQuickBet =
    user &&
    !marketClosed &&
    (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') &&
    !hideQuickBet

  return (
    <Card
      className={clsx(
        'font-readex-pro group relative flex leading-normal',
        className
      )}
    >
      <Col className="relative flex-1 gap-1 py-2">
        <AvatarDetails
          contract={contract}
          className={'pl-2'}
          noLink={noLinkAvatar}
        />
        {contract.coverImageUrl && showImage && (
          <div className="relative">
            <img
              className="h-80 w-full object-cover "
              src={contract.coverImageUrl}
            />
            <div className="absolute bottom-0">
              <div
                className={clsx(
                  'break-anywhere bg-gradient-to-t from-slate-900 px-2 pb-2 pt-12 text-xl font-semibold text-white',
                  questionClass
                )}
              >
                {question}
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 px-4">
          {(!contract.coverImageUrl || !showImage) && (
            <div
              className={clsx(
                'break-anywhere pb-2 font-semibold text-indigo-700 group-hover:underline group-hover:decoration-indigo-400 group-hover:decoration-2',
                questionClass
              )}
            >
              {question}
            </div>
          )}
          {showQuickBet ? (
            <QuickBet contract={contract} user={user} className="z-10" />
          ) : (
            <div className="relative z-10">
              <QuickOutcomeView contract={contract} />
            </div>
          )}
        </div>
        <Row
          className={clsx(
            'gap-2 truncate px-2 md:gap-0'
            // showQuickBet ? 'w-[85%]' : 'w-full'
          )}
        >
          <MiscDetails
            contract={contract}
            showTime={showTime}
            hideGroupLink={hideGroupLink}
          />
        </Row>
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
        <Link href={contractPath(contract)}>
          <a
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
        </Link>
      )}
    </Card>
  )
}

export function BinaryResolutionOrChance(props: {
  contract: BinaryContract
  large?: boolean
  className?: string
  probAfter?: number // 0 to 1
}) {
  const { contract, large, className, probAfter } = props
  const { resolution } = contract
  const textColor = `text-${getTextColor(contract)}`

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
  const textColor = `text-${getTextColor(contract)}`

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
  const textColor = `text-${getTextColor(contract)}`

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

export function ContractCardProbChange(props: {
  contract: CPMMContract
  noLinkAvatar?: boolean
  showPosition?: boolean
  className?: string
  showImage?: boolean
}) {
  const { noLinkAvatar, showPosition, className, showImage } = props
  const yesOutcomeLabel =
    props.contract.outcomeType === 'PSEUDO_NUMERIC' ? 'HIGHER' : 'YES'
  const noOutcomeLabel =
    props.contract.outcomeType === 'PSEUDO_NUMERIC' ? 'LOWER' : 'NO'

  const contract = (useContract(props.contract.id) ??
    props.contract) as CPMMBinaryContract

  const user = useUser()
  const metrics = useUserContractMetrics(user?.id, contract.id)
  const dayMetrics = metrics && metrics.from && metrics.from.day
  const binaryOutcome =
    metrics && floatingEqual(metrics.totalShares.NO ?? 0, 0) ? 'YES' : 'NO'

  const displayedProfit = dayMetrics
    ? ENV_CONFIG.moneyMoniker + dayMetrics.profit.toFixed(0)
    : undefined

  return (
    <Card className={clsx(className, 'mb-4')}>
      <AvatarDetails
        contract={contract}
        className={'px-2 pt-4'}
        noLink={noLinkAvatar}
      />
      {contract.coverImageUrl && showImage && (
        <img
          className="mt-2 h-60 w-full object-cover "
          src={contract.coverImageUrl}
        />
      )}
      <Row className={clsx('items-start justify-between gap-4 ', className)}>
        <SiteLink
          className="pl-2 pr-2 pt-2 font-semibold text-indigo-700"
          href={contractPath(contract)}
        >
          <span className="line-clamp-3">{contract.question}</span>
        </SiteLink>
      </Row>
      <ProbOrNumericChange
        className="py-2 px-2"
        contract={contract}
        user={user}
      />
      {showPosition && metrics && metrics.hasShares && (
        <Row
          className={clsx(
            'items-center justify-between gap-4 bg-gray-100 pl-4 pr-4 pt-1 pb-2 text-sm'
          )}
        >
          <Col className="text-gray-400">
            <span> Your Position </span>
            <Row className="items-center justify-center gap-1">
              <span className="text-lg text-gray-500">
                {formatMoney(metrics.invested)}{' '}
              </span>
              on {binaryOutcome === 'YES' ? yesOutcomeLabel : noOutcomeLabel}
            </Row>
          </Col>
          <Col className="gap-1 text-gray-400">
            <span> Your Profit </span>
            <span
              className={clsx(
                'ml-1.5',
                dayMetrics && dayMetrics?.profit > 0
                  ? 'text-teal-500'
                  : 'text-red-500'
              )}
            >
              {displayedProfit} today
            </span>
          </Col>
        </Row>
      )}
    </Card>
  )
}
