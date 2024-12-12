import { getProbability } from 'common/calculate'
import { StonkContract } from 'common/contract'
import { getMappedValue } from 'common/pseudo-numeric'
import { Row } from 'web/components/layout/row'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'
import { animated } from '@react-spring/web'
import { CoinNumber } from '../widgets/coin-number'
export function StonkPrice(props: {
  contract: StonkContract
  className?: string
}) {
  const { contract, className } = props

  const value = getMappedValue(contract, getProbability(contract))
  return (
    <Row
      className={clsx(
        'text-ink-1000 flex flex-row items-center font-mono',
        className
      )}
    >
      <CoinNumber
        amount={value}
        className="text-purple-600 dark:text-purple-300"
      />

      <div className="ml-1 font-sans text-sm text-gray-400"> per share</div>
    </Row>
  )
}
