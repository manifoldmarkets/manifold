import { InformationCircleIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { PerpContract } from 'common/contract'
import { formatFeePct, perpFeeScheduleSummary } from 'common/perps/format'
import { formatNumber } from 'common/util/format'
import { ReactNode, useState } from 'react'
import { useUser } from 'web/hooks/use-user'

import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { PERP_MARKET_BADGE_CLASS } from './perp-market-badge'

export function PerpMarketExplainer(props: {
  // The explainer quotes THIS market's live settings (fees, leverage cap)
  // rather than only describing the mechanism — only admins can change them,
  // but every trader needs to be able to read them. Required: there is one
  // call site and it always has the contract, so an optional prop would only
  // buy an unreachable, fee-less rendering of the modal.
  contract: PerpContract
  className?: string
}) {
  const { contract, className } = props
  const [open, setOpen] = useState(false)
  const user = useUser()

  return (
    <>
      <button
        type="button"
        className={clsx(
          PERP_MARKET_BADGE_CLASS,
          'hover:bg-primary-200 focus-visible:ring-primary-500 dark:hover:bg-primary-900/70 h-7 cursor-pointer gap-1 px-2.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
          className
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="What are perpetual markets?"
        onClick={() => setOpen(true)}
      >
        Perpetual
        <InformationCircleIcon aria-hidden className="h-4 w-4" />
      </button>
      <Modal
        open={open}
        setOpen={setOpen}
        size="md"
        ariaLabel="How perpetual markets work"
      >
        <Col
          className={clsx(
            MODAL_CLASS,
            SCROLLABLE_MODAL_CLASS,
            '!items-stretch text-left'
          )}
        >
          <div>
            <h2 className="text-primary-700 text-xl font-semibold">
              How perpetual markets work
            </h2>
            <p className="text-ink-600 mt-1">
              Perpetual markets let you take a leveraged long or short position
              on a price or metric. Unlike a typical prediction market, they
              have no scheduled expiry.
            </p>
          </div>

          <ExplainerItem title="Oracle price">
            This market uses Manifold's latest accepted update from the source
            shown below the chart. Long positions benefit when the value rises;
            short positions benefit when it falls. Oracle updates can lag the
            source.
          </ExplainerItem>

          <ExplainerItem title="Leverage and liquidation">
            Leverage multiplies both gains and losses. For example, M$100 at 5×
            gives M$500 of exposure. If the oracle reaches your liquidation
            price, your position closes and you can lose all the margin you
            posted. Profitable positions may also be auto-deleveraged if market
            backing becomes insufficient.
            {Number.isFinite(contract.maxLeverage) && (
              <>
                {' '}
                This market allows up to{' '}
                {formatNumber(contract.maxLeverage, {
                  maximumFractionDigits: 2,
                })}
                × leverage.
              </>
            )}
          </ExplainerItem>

          <PerpFeesItem contract={contract} />

          <ExplainerItem title="Funding while you hold">
            At each funding interval, the more crowded side pays the other side.
            Funding can reduce or increase your margin; the current rate and
            next funding time are shown above the chart.
          </ExplainerItem>

          <ExplainerItem title="No expiry">
            Your position stays open until you close it, it is liquidated or
            auto-deleveraged, or Manifold settles the market.
          </ExplainerItem>

          <ExplainerItem title="Stale feeds">
            If the oracle is stale or unavailable, opening and closing pause
            until a fresh, valid update arrives.
          </ExplainerItem>

          <p className="text-ink-500 text-xs">
            Every setting for this market — leverage cap, funding cap, and fees
            — is set per market, and only Manifold admins can change them.
            {/* ContractInfoDialog is reachable ONLY through HeaderActions, and
                both of its containers are `!user && 'hidden md:flex'` — so a
                signed-out reader on a phone has no route to that panel at all.
                Point at it only under the exact condition that renders it;
                the sentence above is complete and true without this. */}
            <span className={clsx(!user && 'hidden md:inline')}>
              {' '}
              The full list is in the market info panel, under the ··· menu →
              See info.
            </span>
          </p>

          <div className="border-primary-200 bg-primary-50 text-ink-700 dark:border-primary-800 dark:bg-primary-900/20 rounded-md border p-3 text-sm">
            <span className="font-semibold">League scoring:</span> For now,
            perpetual-market profit and loss appear in your portfolio but do not
            count toward league standings.
          </div>
        </Col>
      </Modal>
    </>
  )
}

// The fee schedule in a trader's terms: what opening costs on the web and via
// the API, that closing is free, and — when the size term is on — what a
// pool-sized entry actually pays, so `takerFeeImpact` is never just a bare
// coefficient. Every figure comes from perpFeeScheduleSummary, which reads the
// same math the engine charges and is shared with the market info dialog.
function PerpFeesItem(props: { contract: PerpContract }) {
  const {
    baseBps,
    apiBps,
    apiDiffers,
    hasSizeTerm,
    poolSizedBps,
    fourTimesPoolBps,
    apiPoolSizedBps,
    apiFourTimesPoolBps,
  } = perpFeeScheduleSummary(props.contract)

  return (
    <ExplainerItem title="Fees" scope="this market only">
      In this market, opening a position costs {formatFeePct(baseBps)} of its
      notional (margin × leverage), paid into the market's backing pool rather
      than to Manifold. Closing is free.{' '}
      {/* The surcharge is selected by auth channel — the server checks
          `auth.creds.kind === 'key'`, not whether the caller is a bot — so
          session-authenticated automation pays the web rate and any API-key
          caller pays this one. Say what is actually true of the reader.
          Suppressed entirely when the two rates are equal: announcing a
          separate rate identical to the one just quoted reads as a bug. */}
      {apiDiffers && (
        <>Positions opened with an API key pay {formatFeePct(apiBps)}. </>
      )}
      {hasSizeTerm ? (
        <>
          Large positions pay more, like price impact on an exchange: one the
          size of this market's whole backing pool pays about{' '}
          {formatFeePct(poolSizedBps)}, and one four times the pool about{' '}
          {formatFeePct(fourTimesPoolBps)}.{' '}
          {/* The size term stacks on whichever base the CHANNEL selected, so
              the web figures understate an API open — on BTC at base 10 / API
              30 / impact 10 a pool-sized API entry pays 0.33%, not 0.13%. */}
          {apiDiffers && (
            <>
              Through the API those are {formatFeePct(apiPoolSizedBps)} and{' '}
              {formatFeePct(apiFourTimesPoolBps)}.{' '}
            </>
          )}
          Small positions pay just the base rate.{' '}
        </>
      ) : (
        <>The rate is flat — position size does not change it. </>
      )}
      The exact fee is quoted before you confirm a trade. Fees are set per
      market, so other perpetuals may differ.
    </ExplainerItem>
  )
}

function ExplainerItem(props: {
  title: string
  // Always-visible qualifier beside the heading (e.g. "this market only") for
  // sections whose figures are per-market, not platform rules. Inline rather
  // than a hover tooltip so it cannot be missed and exists on touch devices.
  scope?: string
  children: ReactNode
}) {
  const { title, scope, children } = props
  return (
    <div>
      <h3 className="text-ink-800 font-semibold">
        {title}
        {scope && (
          <span className="text-ink-500 ml-2 text-xs font-normal italic">
            — {scope}
          </span>
        )}
      </h3>
      <p className="text-ink-600 mt-0.5 text-sm">{children}</p>
    </div>
  )
}
