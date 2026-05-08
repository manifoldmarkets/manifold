import clsx from 'clsx'
import { BOOST_COST_MANA } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { formatMoney, formatMoneyShort } from 'common/util/format'
import Link from 'next/link'
import { BsRocketTakeoff } from 'react-icons/bs'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

export function BoostSection(props: {
  enabled: boolean
  setEnabled: (value: boolean) => void
  visibility: 'public' | 'unlisted'
  marketCost: number
  balance: number
}) {
  const { enabled, setEnabled, visibility, marketCost, balance } = props
  const isUnlisted = visibility !== 'public'
  const on = enabled && !isUnlisted

  const requiredBoostBalance = marketCost + BOOST_COST_MANA
  const shortByForBoost = Math.max(0, requiredBoostBalance - balance)
  const insufficient = on && shortByForBoost > 0

  return (
    <Col className={clsx('gap-2', isUnlisted && 'opacity-60')}>
      <span className="text-ink-700 text-sm font-semibold">Boost</span>
      <div className="text-ink-600 text-sm">
        {isUnlisted ? (
          'Boosting is only available for publicly listed markets.'
        ) : (
          <>
            Feature on the homepage for 24 hours.{' '}
            <span className="text-ink-700">
              More traders means tighter pricing and more accurate forecasts.
            </span>
          </>
        )}
      </div>
      <Row className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isUnlisted}
          onClick={() => setEnabled(false)}
          className={clsx(
            'bg-canvas-50 text-ink-900 flex select-none items-center justify-center rounded px-4 py-2 text-sm font-semibold transition-colors',
            isUnlisted && 'cursor-not-allowed',
            !on
              ? 'ring-ink-400 ring-1'
              : 'text-ink-600 opacity-80 hover:opacity-100'
          )}
        >
          No boost
        </button>
        <button
          type="button"
          disabled={isUnlisted}
          onClick={() => setEnabled(true)}
          className={clsx(
            'flex select-none items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold transition-all',
            isUnlisted && 'cursor-not-allowed',
            on
              ? insufficient
                ? 'from-primary-500/60 bg-gradient-to-r to-blue-400/60 text-white ring-1 ring-red-500'
                : 'from-primary-500 bg-gradient-to-r to-blue-400 text-white shadow-md hover:saturate-150'
              : 'bg-canvas-50 text-ink-700 opacity-80 hover:opacity-100'
          )}
        >
          <BsRocketTakeoff className="h-4 w-4" />
          Boost for {formatMoneyShort(BOOST_COST_MANA)}
        </button>
      </Row>
      {insufficient && (
        <Row className="mt-1 flex-wrap items-center gap-2 text-xs font-medium tracking-wide">
          <span className="text-scarlet-500">
            Need {formatMoney(shortByForBoost)} more to boost.
          </span>
          <Link
            href="/checkout"
            className="rounded bg-teal-500 px-2 py-1 text-white hover:bg-teal-600"
          >
            Get {ENV_CONFIG.moneyMoniker}
          </Link>
        </Row>
      )}
    </Col>
  )
}
