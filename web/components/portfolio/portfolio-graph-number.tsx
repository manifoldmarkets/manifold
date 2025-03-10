import clsx from 'clsx'
import { Col } from '../layout/col'
import { TokenNumber } from '../widgets/token-number'
import { PortfolioMode } from './portfolio-graph'

export const PortfolioGraphNumber = (props: {
  numberType: 'balance' | 'investment' | 'spice' | 'profit'
  descriptor: string
  portfolioFocus: PortfolioMode
  displayedAmount: number | undefined
  onClick: () => void
  className?: string
  isSpice?: boolean
  prefersPlay?: boolean
}) => {
  const {
    portfolioFocus,
    numberType,
    descriptor,
    displayedAmount,
    onClick,
    className,
    isSpice,
    prefersPlay,
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
        <TokenNumber
          amount={displayedAmount}
          className={clsx('font-bold transition-all', className)}
          coinType={isSpice ? 'spice' : prefersPlay ? 'mana' : 'sweepies'}
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
