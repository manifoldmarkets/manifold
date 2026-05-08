import clsx from 'clsx'
import { BOOST_COST_MANA } from 'common/economy'
import { formatMoneyShort } from 'common/util/format'
import { BsRocketTakeoff } from 'react-icons/bs'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

export function BoostSection(props: {
  enabled: boolean
  setEnabled: (value: boolean) => void
  visibility: 'public' | 'unlisted'
}) {
  const { enabled, setEnabled, visibility } = props
  const isUnlisted = visibility !== 'public'
  const on = enabled && !isUnlisted

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
              ? 'from-primary-500 bg-gradient-to-r to-blue-400 text-white shadow-md hover:saturate-150'
              : 'bg-canvas-50 text-ink-700 opacity-80 hover:opacity-100'
          )}
        >
          <BsRocketTakeoff className="h-4 w-4" />
          Boost for {formatMoneyShort(BOOST_COST_MANA)}
        </button>
      </Row>
    </Col>
  )
}
