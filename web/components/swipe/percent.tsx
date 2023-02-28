import clsx from 'clsx'
import CountUp from 'react-countup'

import { formatPercentNumber } from 'common/util/format'
import { Row } from '../layout/row'

export function Percent(props: {
  currPercent: number
  yesPercent: number
  noPercent: number
  outcome?: 'NO' | 'YES'
  className?: string
}) {
  const { currPercent, yesPercent, noPercent, outcome, className } = props
  return (
    <Row
      className={clsx(
        'transition-color items-center font-bold',
        !outcome && 'text-ink-1000',
        outcome === 'YES' && 'text-teal-100',
        outcome === 'NO' && 'text-scarlet-100',
        className
      )}
    >
      <div
        className={clsx(
          'text-5xl transition-all',
          !outcome && '[text-shadow:#4337c9_0_8px]',
          outcome === 'YES' &&
            '[text-shadow:#14b8a6_-6px_4px,#0f766e_-12px_8px]',
          outcome === 'NO' && '[text-shadow:#FF2400_6px_4px,#991600_12px_8px]'
        )}
      >
        {outcome === 'YES' && (
          <CountUp
            start={formatPercentNumber(currPercent)}
            end={formatPercentNumber(yesPercent)}
            duration={0.2}
          />
        )}
        {outcome === 'NO' && (
          <CountUp
            start={formatPercentNumber(currPercent)}
            end={formatPercentNumber(noPercent)}
            duration={0.2}
          />
        )}
        {!outcome && formatPercentNumber(currPercent)}
      </div>
      <div className="pt-2 text-2xl">%</div>
      <div className="ml-2 self-end text-2xl">chance</div>
    </Row>
  )
}
