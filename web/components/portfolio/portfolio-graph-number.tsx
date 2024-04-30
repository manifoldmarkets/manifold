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
        'group cursor-pointer select-none  transition-opacity',
        portfolioFocus == numberType
          ? 'opacity-100'
          : portfolioFocus !== 'all' && portfolioFocus !== numberType
          ? 'opacity-50'
          : 'opacity-[0.85] hover:opacity-100'
      )}
      onClick={onClick}
    >
      <span>
        <CoinNumber
          amount={displayedAmount}
          className={clsx(
            'transition-all group-hover:font-bold',
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
        <span
          className={clsx(
            'text-ink-600 group-hover:text-ink-700 text-base transition-all'
          )}
        >
          {' '}
          {descriptor}
        </span>
      </span>
    </div>
  )
}
