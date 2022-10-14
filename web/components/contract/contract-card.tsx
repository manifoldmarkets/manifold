import clsx from 'clsx'
import Link from 'next/link'
import { Row } from '../layout/row'
import {
  formatLargeNumber,
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
import { getColor, ProbBar, QuickBet } from '../bet/quick-bet'
import { useContractWithPreload } from 'web/hooks/use-contract'
import { useUser, useUserContractMetrics } from 'web/hooks/use-user'
import { track } from '@amplitude/analytics-browser'
import { trackCallback } from 'web/lib/service/analytics'
import { getMappedValue } from 'common/pseudo-numeric'
import { Tooltip } from '../tooltip'
import { SiteLink } from '../site-link'
import { ProbOrNumericChange } from './prob-change-table'
import { Card } from '../card'
import { floatingEqual } from 'common/util/math'
import { ENV_CONFIG } from 'common/envs/constants'

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
  } = props
  const contract = useContractWithPreload(props.contract) ?? props.contract
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
    <Card className={clsx('group relative flex gap-3', className)}>
      <Col className="relative flex-1 gap-3 py-4 pb-12  pl-6">
        <AvatarDetails
          contract={contract}
          className={'hidden md:inline-flex'}
          noLink={noLinkAvatar}
        />
        <p
          className={clsx(
            'break-anywhere font-semibold text-indigo-700 group-hover:underline group-hover:decoration-indigo-400 group-hover:decoration-2',
            questionClass
          )}
        >
          {question}
        </p>

        {(outcomeType === 'FREE_RESPONSE' ||
          outcomeType === 'MULTIPLE_CHOICE') &&
          (resolution ? (
            <FreeResponseOutcomeLabel
              contract={contract}
              resolution={resolution}
              truncate={'long'}
            />
          ) : (
            <FreeResponseTopAnswer contract={contract} />
          ))}
      </Col>
      {showQuickBet ? (
        <QuickBet contract={contract} user={user} className="z-10" />
      ) : (
        <>
          {outcomeType === 'BINARY' && (
            <BinaryResolutionOrChance
              className="items-center self-center pr-5"
              contract={contract}
            />
          )}

          {outcomeType === 'PSEUDO_NUMERIC' && (
            <PseudoNumericResolutionOrExpectation
              className="items-center self-center pr-5"
              contract={contract}
            />
          )}

          {outcomeType === 'NUMERIC' && (
            <NumericResolutionOrExpectation
              className="items-center self-center pr-5"
              contract={contract}
            />
          )}

          {(outcomeType === 'FREE_RESPONSE' ||
            outcomeType === 'MULTIPLE_CHOICE') && (
            <FreeResponseResolutionOrChance
              className="items-center self-center pr-5 text-gray-600"
              contract={contract}
              truncate="long"
            />
          )}
          <ProbBar contract={contract} />
        </>
      )}
      <Row
        className={clsx(
          'absolute bottom-3 gap-2 truncate px-5 md:gap-0',
          showQuickBet ? 'w-[85%]' : 'w-full'
        )}
      >
        <AvatarDetails
          contract={contract}
          short={true}
          className="md:hidden"
          noLink={noLinkAvatar}
        />
        <MiscDetails
          contract={contract}
          showTime={showTime}
          hideGroupLink={hideGroupLink}
        />
      </Row>

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
  const textColor = `text-${getColor(contract)}`

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

function FreeResponseTopAnswer(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  className?: string
}) {
  const { contract } = props

  const topAnswer = getTopAnswer(contract)

  return topAnswer ? (
    <AnswerLabel
      className="!text-gray-600"
      answer={topAnswer}
      truncate="long"
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
  const textColor = `text-${getColor(contract)}`

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
  const textColor = `text-${getColor(contract)}`

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
}) {
  const { noLinkAvatar, showPosition, className } = props
  const yesOutcomeLabel =
    props.contract.outcomeType === 'PSEUDO_NUMERIC' ? 'HIGHER' : 'YES'
  const noOutcomeLabel =
    props.contract.outcomeType === 'PSEUDO_NUMERIC' ? 'LOWER' : 'NO'

  const contract = useContractWithPreload(props.contract) as CPMMBinaryContract

  const user = useUser()
  const metrics = useUserContractMetrics(user?.id, contract.id)
  const dayMetrics = metrics && metrics.from && metrics.from.day
  const binaryOutcome =
    metrics && floatingEqual(metrics.totalShares.NO ?? 0, 0) ? 'YES' : 'NO'

  const displayedProfit = dayMetrics
    ? ENV_CONFIG.moneyMoniker +
      (dayMetrics.profit > 0 ? '+' : '') +
      dayMetrics.profit.toFixed(0)
    : undefined

  return (
    <Card className={clsx(className, 'mb-4')}>
      <AvatarDetails
        contract={contract}
        className={'px-6 pt-4'}
        noLink={noLinkAvatar}
      />
      <Row className={clsx('items-start justify-between gap-4 ', className)}>
        <SiteLink
          className="pl-6 pr-0 pt-2 pb-4 font-semibold text-indigo-700"
          href={contractPath(contract)}
        >
          <span className="line-clamp-3">{contract.question}</span>
        </SiteLink>
        <ProbOrNumericChange className="py-2 pr-4" contract={contract} />
      </Row>
      {showPosition && metrics && metrics.hasShares && (
        <Row
          className={clsx(
            'items-center justify-between gap-4 pl-6 pr-4 pb-2 text-sm'
          )}
        >
          <Row className="gap-1 text-gray-400">
            You: {formatWithCommas(metrics.totalShares[binaryOutcome])}{' '}
            {binaryOutcome === 'YES' ? yesOutcomeLabel : noOutcomeLabel} shares
            <span className="ml-1.5">{displayedProfit} today</span>
          </Row>
        </Row>
      )}
    </Card>
  )
}
