import { ExternalLinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { MouseEvent } from 'react'
import { PerpContract } from 'common/contract'
import { getMnxInstrument } from 'common/perps/mnx'
import {
  MNX_CLICK_EVENT,
  MnxLinkLocation,
  getMnxTradeTarget,
  mnxLinkUrl,
} from 'common/perps/mnx-cta'
import { getPerpTicker } from 'common/perps/ticker'
import { buttonClass } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

/**
 * Everything an outbound MNX link needs — the tagged href, the new-tab
 * attributes and the click tracking — as one spreadable object.
 *
 * Deliberately not three things a call site remembers to do: the point of the
 * CTA is to learn how many people (and which people) leave for MNX, and a
 * placement that looks like the others but is counted by nobody is worse than
 * no placement at all, because it silently deflates the number we act on.
 */
export const mnxLinkProps = (props: {
  url: string
  location: MnxLinkLocation
  feedId: string | undefined
  /** Lands in `user_events.contract_id`, so clicks group by market. */
  contractId?: string
}) => {
  const { url, location, feedId, contractId } = props
  const href = mnxLinkUrl(url, location)
  const instrument = getMnxInstrument(feedId)
  const record = () =>
    track(MNX_CLICK_EVENT, {
      location,
      contractId,
      feedId,
      // The MNX-side identity of what they clicked through to, so a rename of
      // our ticker or question doesn't orphan the history.
      symbol: instrument?.symbol,
      instrument: instrument?.slug,
      url: href,
    })
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    // track() is fire-and-forget, which is safe here only because the link
    // opens a new tab: this page stays mounted, so the insert is not racing a
    // navigation that would cancel it.
    onClick: record,
    // A middle click opens a background tab and fires auxclick, not click —
    // without this, those read as zero. Middle button only: right-click fires
    // auxclick too, and opening a context menu is not a click-through.
    onAuxClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 1) record()
    },
  }
}

/**
 * The call to action on a market whose price comes from MNX: the same
 * instrument, tradable there with real money.
 *
 * Renders nothing for a market that isn't on an MNX feed, and nothing once it
 * has settled — see getMnxTradeTarget for why. Sits under the chart with the
 * source credit rather than above the bet panel: it belongs to the block that
 * explains where this price comes from, and Manifold's own trading controls
 * stay the page's primary action.
 */
export const MnxTradeCta = (props: {
  contract: PerpContract
  location: MnxLinkLocation
  className?: string
}) => {
  const { contract, location, className } = props
  const instrument = getMnxTradeTarget(contract)
  if (!instrument) return null

  const ticker = getPerpTicker(contract)
  // Valuation instruments are futures on a post-IPO market cap, not
  // perpetuals; calling them the wrong thing in a CTA is the kind of detail a
  // reader who trades on MNX notices immediately.
  const derivative =
    instrument.type === 'future' ? 'valuation future' : 'perpetual'

  return (
    <Row
      className={clsx(
        'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20 flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border px-4 py-3',
        className
      )}
    >
      <Col className="min-w-[14rem] flex-1 gap-0.5">
        <div className="text-ink-900 text-sm font-semibold">
          Trade {ticker} with real money on MNX
        </div>
        <div className="text-ink-600 text-xs">
          Positions here are in mana. This market tracks MNX's {derivative} on{' '}
          {instrument.name} — the instrument itself trades on MNX, a separate
          exchange.
        </div>
      </Col>
      <a
        {...mnxLinkProps({
          url: instrument.url,
          location,
          feedId: contract.oracleFeedId,
          contractId: contract.id,
        })}
        className={clsx(buttonClass('sm', 'indigo'), 'shrink-0 gap-1.5')}
      >
        Trade {ticker} on MNX
        <ExternalLinkIcon aria-hidden className="h-4 w-4" />
      </a>
    </Row>
  )
}
