import { InformationCircleIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { PerpContract } from 'common/contract'
import {
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeBps,
  getPerpTakerFeeImpact,
  perpFreshPositionFeeBps,
} from 'common/perps/fees'
import { formatFeePct } from 'common/perps/format'
import { formatWithCommas } from 'common/util/format'
import { ReactNode, useState } from 'react'

import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { PERP_MARKET_BADGE_CLASS } from './perp-market-badge'

export function PerpMarketExplainer(props: {
  // When given, the explainer quotes THIS market's live settings (fees,
  // leverage cap) instead of only describing the mechanism — only admins can
  // change them, but every trader needs to be able to read them.
  contract?: PerpContract
  className?: string
}) {
  const { contract, className } = props
  const [open, setOpen] = useState(false)

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
            {contract && Number.isFinite(contract.maxLeverage) && (
              <>
                {' '}
                This market allows up to{' '}
                {formatWithCommas(contract.maxLeverage)}× leverage.
              </>
            )}
          </ExplainerItem>

          {contract && <PerpFeesItem contract={contract} />}

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

          {contract && (
            <p className="text-ink-500 text-xs">
              Every setting for this market — leverage cap, funding cap, and
              fees — is listed under the ··· menu → See info. Only Manifold
              admins can change them.
            </p>
          )}

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
// coefficient. Worked numbers come from perpFreshPositionFeeBps, which reads
// the same math the engine charges.
function PerpFeesItem(props: { contract: PerpContract }) {
  const { contract } = props
  const baseBps = getPerpTakerFeeBps(contract)
  const apiBps = getPerpEffectiveTakerFeeBps(contract, true)
  const impact = getPerpTakerFeeImpact(contract)
  const poolSizedFee = formatFeePct(
    perpFreshPositionFeeBps({ baseBps, impact, poolShare: 1 })
  )
  const fourTimesPoolFee = formatFeePct(
    perpFreshPositionFeeBps({ baseBps, impact, poolShare: 4 })
  )

  return (
    <ExplainerItem title="Fees">
      Opening a position costs {formatFeePct(baseBps)} of its notional (margin ×
      leverage), paid into this market's backing pool rather than to Manifold.
      Closing is free. Positions opened through the API — bots — pay{' '}
      {formatFeePct(apiBps)} to open.{' '}
      {impact > 0 ? (
        <>
          Large positions pay more, like price impact on an exchange: one the
          size of this market's whole backing pool pays about {poolSizedFee},
          and one four times the pool about {fourTimesPoolFee}. Small positions
          pay just the base rate.{' '}
        </>
      ) : (
        <>The rate is flat — position size does not change it. </>
      )}
      The exact fee is quoted before you confirm a trade.
    </ExplainerItem>
  )
}

function ExplainerItem(props: { title: string; children: ReactNode }) {
  const { title, children } = props
  return (
    <div>
      <h3 className="text-ink-800 font-semibold">{title}</h3>
      <p className="text-ink-600 mt-0.5 text-sm">{children}</p>
    </div>
  )
}
