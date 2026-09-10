import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getPerpTicker } from 'common/perps/ticker'

// The ticker as the /perps hub prints it: bold blue monospace at the size of
// the text it sits in, no chip. In front of a title it reads as the first
// word of the line; on the market page it is also the explainer's trigger.
export const PERP_TICKER_CLASS =
  'text-primary-600 dark:text-primary-400 font-mono font-bold'

// "Badge" is historical — this is a plain label now — but every list and
// card that puts a ticker in front of a perp's question goes through here.
// The market type survives as the hover title.
export function PerpTickerBadge(props: { ticker: string; className?: string }) {
  const { ticker, className } = props

  return (
    <span
      className={clsx(PERP_TICKER_CLASS, className)}
      title="Perpetual market"
    >
      {ticker}
    </span>
  )
}

// Renders nothing for a non-perp, so a call site can hand over whatever
// contract it holds; the `isPerp` guard most of them keep is not load-bearing.
export function PerpMarketBadge(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props
  if (contract.mechanism !== 'perp') return null

  return (
    <PerpTickerBadge ticker={getPerpTicker(contract)} className={className} />
  )
}
