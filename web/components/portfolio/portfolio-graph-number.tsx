import clsx from 'clsx'
import { PortfolioMode } from './portfolio-value-graph'
import { PortfolioHoveredGraphType } from './portfolio-value-section'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { Col } from '../layout/col'

export function PortfolioGraphNumber(props: {
  numberType: 'balance' | 'investment'
  descriptor: string
  portfolioFocus: PortfolioMode
  portfolioHoveredGraph: PortfolioHoveredGraphType
  displayedAmount: number | undefined
  color: string
  onClick: () => void
  className?: string
}) {
  const {
    portfolioFocus,
    numberType,
    descriptor,
    portfolioHoveredGraph,
    displayedAmount,
    color,
    onClick,
    className,
  } = props
  return (
    <div
      className={clsx(
        'group cursor-pointer select-none rounded px-2 py-1 transition-opacity',
        portfolioFocus == numberType || portfolioHoveredGraph == numberType
          ? 'opacity-100'
          : portfolioFocus !== 'all' && portfolioFocus !== numberType
          ? 'opacity-50 hover:opacity-100'
          : 'opacity-[0.85] hover:opacity-100 ',

        className
      )}
      style={{ backgroundColor: color }}
      onClick={onClick}
    >
      <Col>
        <CoinNumber
          amount={displayedAmount}
          className={clsx('font-bold text-white transition-all')}
        />
        <div
          className={clsx(
            'sm:sm -mt-1 text-xs text-gray-200 transition-all group-hover:text-gray-100'
          )}
        >
          {descriptor}
        </div>
      </Col>
    </div>
  )
}
