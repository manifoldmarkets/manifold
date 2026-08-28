import { InformationCircleIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { ReactNode, useState } from 'react'

import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { PERP_MARKET_BADGE_CLASS } from './perp-market-badge'

export function PerpMarketExplainer(props: { className?: string }) {
  const { className } = props
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
            This market uses SAGE's latest accepted update from the source
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
          </ExplainerItem>

          <ExplainerItem title="Funding while you hold">
            At each funding interval, the more crowded side pays the other side.
            Funding can reduce or increase your margin; the current rate and
            next funding time are shown above the chart.
          </ExplainerItem>

          <ExplainerItem title="No expiry">
            Your position stays open until you close it, it is liquidated or
            auto-deleveraged, or SAGE settles the market.
          </ExplainerItem>

          <ExplainerItem title="Stale feeds">
            If the oracle is stale or unavailable, opening and closing pause
            until a fresh, valid update arrives.
          </ExplainerItem>

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

function ExplainerItem(props: { title: string; children: ReactNode }) {
  const { title, children } = props
  return (
    <div>
      <h3 className="text-ink-800 font-semibold">{title}</h3>
      <p className="text-ink-600 mt-0.5 text-sm">{children}</p>
    </div>
  )
}
