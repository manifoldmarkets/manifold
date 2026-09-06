import clsx from 'clsx'
import { Contract } from 'common/contract'
import { getPerpTicker } from 'common/perps/ticker'

// Light mode is a soft tinted chip; dark mode mirrors that cleanliness as a
// solid filled chip (translucent washes read muddy on dark canvases).
export const PERP_MARKET_BADGE_CLASS =
  'border-primary-300 bg-primary-100 text-primary-700 dark:border-transparent dark:bg-primary-600 dark:text-white inline-flex h-5 shrink-0 items-center justify-center rounded-md border px-1.5 font-mono text-[11px] font-bold leading-none'

// The chip in front of a perp's title. It shows the market's ticker ("BTC",
// "TRUMP") — the same handle the /perps hub labels rows with — rather than
// the word "Perpetual": the type is identical across every one of them, the
// ticker is what tells them apart. The type survives as the hover title.
export function PerpTickerBadge(props: { ticker: string; className?: string }) {
  const { ticker, className } = props

  return (
    <span
      className={clsx(PERP_MARKET_BADGE_CLASS, className)}
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
