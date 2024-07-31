import clsx from 'clsx'
import { PortfolioMode } from './portfolio-value-graph'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { Col } from '../layout/col'

export function PortfolioGraphNumber(props: {
  numberType: 'balance' | 'investment' | 'spice'
  descriptor: string
  portfolioFocus: PortfolioMode
  displayedAmount: number | undefined
  onClick: () => void
  className?: string
  isSpice?: boolean
}) {
  const {
    portfolioFocus,
    numberType,
    descriptor,
    displayedAmount,
    onClick,
    className,
    isSpice,
  } = props
  return (
    <div
      className={clsx(
        'group cursor-pointer select-none rounded px-2 py-1 transition-colors',
        portfolioFocus !== 'all' && portfolioFocus !== numberType
          ? 'opacity-50 hover:opacity-[0.75]'
          : portfolioFocus == numberType
          ? 'opacity-100'
          : 'opacity-[0.75] hover:opacity-100',
        className
      )}
      onClick={onClick}
    >
      <Col>
        <CoinNumber
          amount={displayedAmount}
          className={clsx('font-bold transition-all', className)}
          coinType={isSpice ? 'spice' : 'mana'}
        />

        <div
          className={clsx(
            portfolioFocus == numberType ? 'text-white/80' : 'text-ink-600',
            ' mx-auto -mt-1 text-xs transition-all'
          )}
        >
          {descriptor}
        </div>
      </Col>
    </div>
  )
}
