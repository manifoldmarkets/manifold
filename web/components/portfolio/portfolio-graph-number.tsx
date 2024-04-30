import clsx from 'clsx'
import { PortfolioMode } from './portfolio-value-graph'
import { PortfolioHoveredGraphType } from './portfolio-value-section'
import { CoinNumber } from '../widgets/manaCoinNumber'

export function PortfolioGraphNumber(props: {
  numberType: 'balance' | 'investment'
  descriptor: string
  portfolioFocus: PortfolioMode
  portfolioHoveredGraph: PortfolioHoveredGraphType
  displayedAmount: number | undefined
  color: string
  onClick: () => void
}) {
  const {
    portfolioFocus,
    numberType,
    descriptor,
    portfolioHoveredGraph,
    displayedAmount,
    color,
    onClick,
  } = props
  return (
    <div
      className={clsx(
        'group cursor-pointer',
        portfolioFocus !== 'all' &&
          portfolioFocus !== numberType &&
          'opacity-50'
      )}
      onClick={onClick}
    >
      <span>
        <CoinNumber
          amount={displayedAmount}
          className={clsx(
            'transition-all',
            (portfolioFocus == numberType ||
              portfolioHoveredGraph == numberType) &&
              'font-bold'
          )}
          isInline
          coinClassName="top-[0.1rem]"
          style={{
            color: color,
          }}
        />
        <span className="text-ink-400 text-base"> {descriptor}</span>
      </span>
    </div>
  )
}
