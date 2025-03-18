import {
  BinaryContract,
  CPMMNumericContract,
  MultiDateContract,
  MultiNumericContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import {
  BinaryContractOutcomeLabel,
  CancelLabel,
  MultiNumericValueLabel,
  NumericValueLabel,
} from 'web/components/outcome-label'
import { getMappedValue } from 'common/pseudo-numeric'
import { getDisplayProbability, getProbability } from 'common/calculate'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { ENV_CONFIG } from 'common/envs/constants'
import { animated } from '@react-spring/web'
import { getTextColor } from 'web/components/contract/text-color'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  formatNumberExpectedValue,
  getNumberExpectedValue,
  answerTextToRange,
} from 'common/src/number'
import { formatExpectedValue, getExpectedValue } from 'common/multi-numeric'
import { formatExpectedDate } from 'common/multi-date'
import { getExpectedDate } from 'common/multi-date'
import { Clock } from '../clock/clock'

export function BinaryResolutionOrChance(props: {
  contract: BinaryContract
  className?: string
  subtextClassName?: string
  isCol?: boolean
}) {
  const { contract, className, subtextClassName, isCol } = props
  const { resolution } = contract
  const textColor = getTextColor(contract)

  const spring = useAnimatedNumber(getDisplayProbability(contract))

  return (
    <div
      className={clsx(
        'flex items-baseline gap-2 text-2xl sm:text-3xl',
        isCol ? 'flex-col' : 'flex-row',
        className
      )}
    >
      {resolution ? (
        <>
          <div className={'text-ink-800 text-base'}>
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
          <animated.div className={textColor}>
            {spring.to((val) => formatPercent(val))}
          </animated.div>
          <div
            className={clsx(
              textColor,
              'text-ink-600 text-sm',
              subtextClassName
            )}
          >
            chance
          </div>
        </>
      )}
    </div>
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
  const spring = useAnimatedNumber(value)

  return (
    <Row className={clsx('items-baseline gap-2 text-3xl', className)}>
      {resolution ? (
        <>
          <div className="text-base">Resolved</div>
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
            <animated.div>
              {spring.to((val) => formatLargeNumber(val))}
            </animated.div>
          </Tooltip>
          <div className="text-base">expected</div>
        </>
      )}
    </Row>
  )
}

export function NumberResolutionOrExpectation(props: {
  contract: CPMMNumericContract
  className?: string
}) {
  const { contract, className } = props
  // TODO: display numeric resolutions
  const { resolution, resolutions } = contract

  const value = getNumberExpectedValue(contract)
  const formattedValue = formatNumberExpectedValue(value, contract)
  const spring = useAnimatedNumber(value)
  const resolutionBuckets = contract.answers
    .filter((a) => resolutions && resolutions[a.id])
    .map((a) => answerTextToRange(a.text))
  const smallestBucket = Math.min(...resolutionBuckets.map((b) => b[0]))
  const largestBucket = Math.max(...resolutionBuckets.map((b) => b[1]))

  return (
    <Row className={clsx('items-baseline gap-2 text-3xl', className)}>
      {resolution ? (
        <>
          <div className="text-base">Resolved</div>
          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <>
              <Tooltip text={formattedValue} placement="bottom">
                <MultiNumericValueLabel
                  formattedValue={
                    formatNumberExpectedValue(smallestBucket, contract) +
                    '-' +
                    formatNumberExpectedValue(largestBucket, contract)
                  }
                />
              </Tooltip>
            </>
          )}
        </>
      ) : (
        <>
          <Tooltip text={formattedValue} placement="bottom">
            <animated.div>
              {spring.to((val) => formatNumberExpectedValue(val, contract))}
            </animated.div>
          </Tooltip>
          <div className="text-base">expected</div>
        </>
      )}
    </Row>
  )
}

export function MultiNumericResolutionOrExpectation(props: {
  contract: MultiNumericContract
  className?: string
}) {
  const { contract, className } = props
  const { answers, resolution } = contract
  const resolvedAnswer = answers.find((a) => a.id === resolution)
  const value = getExpectedValue(contract)
  const formattedValue = formatExpectedValue(value, contract)
  const spring = useAnimatedNumber(value)

  return (
    <span
      className={clsx(
        'items-baseline text-2xl sm:inline-flex sm:text-3xl',
        className
      )}
    >
      {resolution ? (
        <>
          <div className="mr-2 text-base">Resolved</div>
          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <MultiNumericValueLabel
              formattedValue={resolvedAnswer?.text ?? formattedValue}
            />
          )}
        </>
      ) : (
        <>
          <animated.div className={'mr-2 inline-block'}>
            {spring.to((val) => formatExpectedValue(val, contract))}
          </animated.div>
          <span className="text-base">expected</span>
        </>
      )}
    </span>
  )
}
export function MultiDateResolutionOrExpectation(props: {
  contract: MultiDateContract
  className?: string
}) {
  const { contract, className } = props
  const { answers, resolution, timezone, display } = contract
  const resolvedAnswer = answers.find((a) => a.id === resolution)
  const value = getExpectedDate(contract)
  const formattedValue = formatExpectedDate(value, contract)
  const spring = useAnimatedNumber(value)

  return (
    <span
      className={clsx(
        'items-baseline text-2xl sm:inline-flex sm:text-3xl',
        className
      )}
    >
      {resolution ? (
        <>
          <div className="mr-2 text-base">Resolved</div>
          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <MultiNumericValueLabel
              formattedValue={resolvedAnswer?.text ?? formattedValue}
            />
          )}
        </>
      ) : display === 'clock' ? (
        <Tooltip text={`tz: ${timezone}`} placement="bottom">
          <Clock ms={value} size="sm" />
        </Tooltip>
      ) : (
        <Tooltip text={`tz: ${timezone}`} placement="bottom">
          <animated.div className={'mr-2 inline-block'}>
            {spring.to((val) => formatExpectedDate(val, contract))}
          </animated.div>
        </Tooltip>
      )}
    </span>
  )
}

export function StonkPrice(props: {
  contract: StonkContract
  className?: string
}) {
  const { contract, className } = props

  const value = getMappedValue(contract, getProbability(contract))
  const spring = useAnimatedNumber(value)
  return (
    <Row className={clsx('text-ink-1000 items-baseline text-3xl', className)}>
      <Row>
        {ENV_CONFIG.moneyMoniker}
        <animated.div>{spring.to((val) => Math.round(val))}</animated.div>
      </Row>
      <div className="ml-2 text-base">per share</div>
    </Row>
  )
}
