import clsx from 'clsx'

import { GslSlot, GslView } from 'common/esports/types'
import { Col } from 'web/components/layout/col'
import { EsportsMarkets } from 'web/hooks/use-esports-tournaments'
import { SeriesTile } from './series-tile'

// Wide enough, the five series sit as the format runs: the two openers, then
// the winners' and elimination series, then the decider. Narrower, a list.
const PLACE: Record<GslSlot, string> = {
  'opening-1': '@md:col-start-1 @md:row-start-1',
  'opening-2': '@md:col-start-1 @md:row-start-2',
  winners: '@md:col-start-2 @md:row-start-1',
  elimination: '@md:col-start-2 @md:row-start-2',
  decider: '@md:col-start-3 @md:row-span-2 @md:row-start-1 @md:self-center',
}

/**
 * A four-team GSL group: five fixed series. A series the provider hasn't
 * reported yet is an empty slot, never a guess at who will play it.
 */
export function GslGroup(props: { view: GslView; markets: EsportsMarkets }) {
  const { view, markets } = props
  return (
    <div className="@container">
      <div className="@md:grid-cols-3 grid gap-x-4 gap-y-2">
        {view.slots.map(({ slot, label, series }) => (
          <Col key={slot} className={clsx('min-w-0 gap-1', PLACE[slot])}>
            <span className="text-ink-500 truncate text-[10px] font-bold uppercase tracking-wider">
              {label}
            </span>
            <SeriesTile
              series={series}
              market={series ? markets[series.id] : undefined}
            />
          </Col>
        ))}
      </div>
    </div>
  )
}
