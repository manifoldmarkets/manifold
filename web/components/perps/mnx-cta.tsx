import { ExternalLinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { MouseEvent, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PerpContract } from 'common/contract'
import { getMnxInstrument } from 'common/perps/mnx'
import {
  MNX_CLICK_EVENT,
  MnxLinkLocation,
  getMnxTradeTarget,
  mnxLinkUrl,
  mnxNavigationHref,
} from 'common/perps/mnx-cta'
import { getPerpTicker } from 'common/perps/ticker'
import { buttonClass } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { api } from 'web/lib/api/api'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { useNativeInfo } from 'web/components/native-message-provider'
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
export const useMnxLinkProps = (props: {
  url: string | undefined
  location: MnxLinkLocation | undefined
  feedId: string | undefined
  /** Lands in `user_events.contract_id`, so clicks group by market. */
  contractId?: string
}) => {
  const { url, location, feedId, contractId } = props
  const href = url && location ? mnxLinkUrl(url, location) : url
  const instrument = getMnxInstrument(feedId)
  const { isNative } = useNativeInfo()
  const authorized = useIsAuthorized()
  const user = useUser()
  const [attempt, setAttempt] = useState(0)
  const [invite, setInvite] = useState<{
    key: string
    url?: string
    failed?: boolean
  }>()
  // Scope results to both the account and destination. Never reuse a previous
  // user's token or a different market's link while a new request is pending.
  const requestKey = JSON.stringify([
    user?.id,
    user?.username,
    feedId,
    location,
  ])
  useEffect(() => {
    if (!isNative || !authorized || !instrument || !location) return
    let cancelled = false
    setInvite(undefined)
    api('get-mnx-invite-link', { feedId: instrument.feedId, location }).then(
      ({ url }) => {
        if (!cancelled) setInvite({ key: requestKey, url })
      },
      () => {
        if (!cancelled) setInvite({ key: requestKey, failed: true })
      }
    )
    return () => {
      cancelled = true
    }
  }, [isNative, authorized, instrument, location, requestKey, attempt])

  const currentInvite = invite?.key === requestKey ? invite : undefined
  const nativeInviteRequired = isNative && !!instrument && !!location
  const navigationHref = mnxNavigationHref({
    url: href,
    feedId,
    location,
    isNative,
    authorized,
    inviteUrl: currentInvite?.url,
  })
  const waitingForInvite = nativeInviteRequired && !navigationHref
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
    // Native's onOpenWindow ignores same-origin URLs. Give it the final
    // external URL synchronously on tap, signed with the WebView's session.
    // Browsers still resolve auth in a new tab for native anchor behavior.
    href: navigationHref,
    'aria-busy': waitingForInvite && !currentInvite?.failed,
    role: waitingForInvite ? ('link' as const) : undefined,
    tabIndex: waitingForInvite ? 0 : undefined,
    onKeyDown: (e: React.KeyboardEvent<HTMLAnchorElement>) => {
      if (waitingForInvite && e.key === 'Enter') {
        e.preventDefault()
        e.currentTarget.click()
      }
    },
    target: '_blank',
    rel: 'noopener noreferrer',
    // track() is fire-and-forget, which is safe here only because the link
    // opens a new tab: this page stays mounted, so the insert is not racing a
    // navigation that would cancel it.
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (waitingForInvite) {
        e.preventDefault()
        if (currentInvite?.failed) {
          toast.error(
            'Couldn’t create your MNX invite. Retrying—tap again shortly.'
          )
          setAttempt((value) => value + 1)
        } else toast('Preparing your MNX invite. Please tap again shortly.')
        return
      }
      record()
    },
    // A middle click opens a background tab and fires auxclick, not click —
    // without this, those read as zero. Middle button only: right-click fires
    // auxclick too, and opening a context menu is not a click-through.
    onAuxClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 1 && !waitingForInvite) record()
    },
  }
}

/**
 * The call to action on a market whose price comes from MNX: the same
 * instrument, tradable there with real money.
 *
 * Renders nothing for a market that isn't on an MNX feed, and nothing once it
 * has settled — see getMnxTradeTarget for why. Appears above the market
 * description, below the trading controls and position information.
 */
export const MnxTradeCta = (props: {
  contract: PerpContract
  location: MnxLinkLocation
  className?: string
}) => {
  const { contract, location, className } = props
  const instrument = getMnxTradeTarget(contract)
  const linkProps = useMnxLinkProps({
    url: instrument?.url,
    location,
    feedId: instrument ? contract.oracleFeedId : undefined,
    contractId: contract.id,
  })
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
        'relative items-center gap-x-3 gap-y-3 rounded-lg bg-slate-950 px-3 py-3 ring-1 ring-slate-800 sm:flex-wrap sm:gap-x-4 sm:px-4',
        className
      )}
    >
      {/* Cover the whole card on phones; the desktop button is a separate
          sibling link, so one activation only records one click. */}
      <a
        {...linkProps}
        aria-label={`Trade ${ticker} with real money on MNX (opens in a new tab)`}
        className="absolute inset-0 z-10 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:hidden"
      />
      <img
        src="/mnx-logo.svg"
        alt="MNX"
        width={300}
        height={103}
        className="h-4 w-auto shrink-0 sm:h-5"
      />
      <div aria-hidden className="w-px shrink-0 self-stretch bg-slate-700" />
      <Col className="min-w-0 flex-1 gap-0.5 sm:min-w-[12rem]">
        <div className="text-sm font-semibold text-white">
          Trade {ticker} with real{' '}
          <span className="whitespace-nowrap">
            money
            <ExternalLinkIcon
              aria-hidden
              className="ml-1 inline h-4 w-4 align-text-bottom sm:hidden"
            />
          </span>
        </div>
        <div className="text-xs text-slate-400">
          MNX's {derivative} on {instrument.name}
        </div>
      </Col>
      <a
        {...linkProps}
        className={clsx(
          buttonClass('sm', 'none'),
          'hidden gap-1.5 bg-white font-semibold text-slate-900 hover:bg-slate-200 sm:inline-flex sm:shrink-0'
        )}
      >
        Trade {ticker} on MNX
        <ExternalLinkIcon aria-hidden className="h-4 w-4 shrink-0" />
      </a>
    </Row>
  )
}
