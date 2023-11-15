import {
  BinaryContract,
  NumericContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import {
  BinaryContractOutcomeLabel,
  CancelLabel,
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

export function BinaryResolutionOrChance(props: {
  contract: BinaryContract
  className?: string
  subtextClassName?: string
}) {
  const { contract, className, subtextClassName } = props
  const { resolution } = contract
  const textColor = getTextColor(contract)

  const spring = useAnimatedNumber(getDisplayProbability(contract))

  return (
    <Row
      className={clsx('items-baseline gap-2 text-2xl sm:text-3xl', className)}
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
    </Row>
  )
}

export function NumericResolutionOrExpectation(props: {
  contract: NumericContract
}) {
  const { contract } = props
  const { resolution, resolutionValue = NaN } = contract

  // All distributional numeric questions are resolved now
  return (
    <Row className="items-baseline gap-2 text-3xl">
      <div className={clsx('text-base')}>Resolved</div>
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
