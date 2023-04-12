import {
  BinaryContract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import {
  BinaryContractOutcomeLabel,
  CancelLabel,
  FreeResponseOutcomeLabel,
  NumericValueLabel,
} from 'web/components/outcome-label'
import { getMappedValue } from 'common/pseudo-numeric'
import { getDisplayProbability, getProbability } from 'common/calculate'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { ENV_CONFIG } from 'common/envs/constants'
import { animated } from '@react-spring/web'
import { getTextColor } from 'web/components/bet/quick-bet'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import { Tooltip } from 'web/components/widgets/tooltip'
import { getValueFromBucket } from 'common/calculate-dpm'

export function BinaryResolutionOrChance(props: {
  contract: BinaryContract
  className?: string
}) {
  const { contract, className } = props
  const { resolution } = contract
  const textColor = getTextColor(contract)

  const spring = useAnimatedNumber(getDisplayProbability(contract))

  return (
    <Row className={clsx('items-baseline gap-2 text-3xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base')}>
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
          <div className={textColor}>
            <animated.div>
              {spring.to((val) => formatPercent(val))}
            </animated.div>
          </div>
          <div className={clsx(textColor, 'text-base')}>chance</div>
        </>
      )}
    </Row>
  )
}

export function FreeResponseResolution(props: {
  contract: FreeResponseContract | MultipleChoiceContract
}) {
  const { contract } = props
  const { resolution } = contract
  if (!(resolution === 'CANCEL' || resolution === 'MKT')) return null

  return (
    <Row className="gap-2 text-3xl">
      <div className={clsx('text-base')}>Resolved</div>

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
