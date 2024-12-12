import clsx from 'clsx'
import { getProbability } from 'common/calculate'
import { StonkContract } from 'common/contract'
import { getMappedValue } from 'common/pseudo-numeric'
import { Row } from 'web/components/layout/row'
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
      <CoinNumber amount={value} />

      <div className="ml-1 font-sans text-sm text-gray-400"> per share</div>
    </Row>
  )
}
