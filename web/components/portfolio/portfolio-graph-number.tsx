import clsx from 'clsx'
import { PortfolioMode } from './portfolio-value-graph'
import { PortfolioHoveredGraphType } from './portfolio-value-section'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

export function PortfolioGraphNumber(props: {
  numberType: 'balance' | 'investment' | 'spice'
  descriptor: string
  portfolioFocus: PortfolioMode
  portfolioHoveredGraph: PortfolioHoveredGraphType
  setPortfolioHoveredGraph: (hovered: PortfolioHoveredGraphType) => void
  displayedAmount: number | undefined
  color: string
  onClick: () => void
  className?: string
  isSpice?: boolean
}) {
  const {
    portfolioFocus,
    numberType,
    descriptor,
    portfolioHoveredGraph,
    setPortfolioHoveredGraph,
    displayedAmount,
    color,
    onClick,
    className,
    isSpice,
  } = props
  return (
    <div
      className={clsx(
        'group cursor-pointer select-none rounded px-2 py-1 transition-opacity',
        portfolioFocus == numberType || portfolioHoveredGraph == numberType
          ? 'opacity-100'
          : portfolioFocus !== 'all' && portfolioFocus !== numberType
          ? 'opacity-50 hover:opacity-[0.85]'
          : 'opacity-[0.85]',

        className
      )}
      style={{ backgroundColor: color }}
      onClick={onClick}
      onMouseEnter={() => {
        if (portfolioFocus == 'all') {
          setPortfolioHoveredGraph(numberType)
        }
      }}
      onMouseLeave={() => setPortfolioHoveredGraph(undefined)}
    >
      <Col>
        <CoinNumber
          amount={displayedAmount}
          className={clsx('font-bold text-white transition-all')}
          isSpice={isSpice}
        />

        <div
          className={clsx(
            'sm:sm mx-auto -mt-1 text-xs text-white/80 transition-all group-hover:text-white'
          )}
        >
          {descriptor}
        </div>
      </Col>
    </div>
  )
}
