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
    // MNX's own colours rather than Manifold's: their wordmark is white on
    // near-black (see the partner block on /jobs, which uses the same asset),
    // so the card is a black panel and the button inverts to white. It reads
    // as somewhere else — which is the point of a CTA that leaves the site —
    // and it is one treatment in both themes, so the white wordmark never
    // needs a second, inverted copy. slate-950 rather than the /jobs tile's
    // slate-900 because dark-mode canvas-0 IS roughly slate-900: at this size
    // the panel has to be darker than the page, not level with it.
    <Row
      className={clsx(
        'flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-slate-950 px-4 py-3 ring-1 ring-slate-800',
        className
      )}
    >
      <Row className="min-w-[13rem] flex-1 items-center gap-3">
        {/* Plain img, like the /jobs partner block: it is a fixed-size static
            asset, so next/image would add a request and a wrapper for nothing.
            alt is the brand name — the heading beside it deliberately doesn't
            repeat it. */}
        <img
          src="/mnx-logo.svg"
          alt="MNX"
          width={300}
          height={103}
          className="h-5 w-auto shrink-0"
        />
        <div aria-hidden className="w-px shrink-0 self-stretch bg-slate-700" />
        <Col className="min-w-0 gap-0.5">
          <div className="text-sm font-semibold text-white">
            Trade {ticker} with real money
          </div>
          {/* Two short sentences: what the price is, and that this market is
              not it. The wordmark, the button and the new tab say the rest —
              nobody needs a paragraph to be told they are leaving. */}
          <div className="text-xs text-slate-400">
            Tracks MNX's {derivative} on {instrument.name}. Positions here are
            in mana.
          </div>
        </Col>
      </Row>
      <a
        {...mnxLinkProps({
          url: instrument.url,
          location,
          feedId: contract.oracleFeedId,
          contractId: contract.id,
        })}
        className={clsx(
          buttonClass('sm', 'none'),
          'shrink-0 gap-1.5 bg-white font-semibold text-slate-900 hover:bg-slate-200'
        )}
      >
        Trade {ticker} on MNX
        <ExternalLinkIcon aria-hidden className="h-4 w-4" />
      </a>
    </Row>
  )
}
