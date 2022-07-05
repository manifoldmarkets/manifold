import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import { formatPercent } from 'common/lib/util/format'
import { formatMoney } from 'common/util/format'
import { sortBy, sumBy } from 'lodash'
import { Col } from './layout/col'
import { BinaryOutcomeLabel } from './outcome-label'

export function OpenBets(props: { bets: LimitBet[]; className?: string }) {
  const { bets, className } = props
  const recentBets = sortBy(bets, (bet) => bet.createdTime).reverse()

  return (
    <Col className={clsx(className, 'gap-2 rounded bg-white')}>
      <div className="px-6 py-3 text-xl">Open bets</div>
      <table className="table-compact table w-full rounded text-gray-500">
        <tbody>
          {recentBets.map((bet) => (
            <LimitBet
              key={bet.id}
              bet={bet}
              onCancel={() => {
                console.log('Cancel', bet)
              }}
            />
          ))}
        </tbody>
      </table>
    </Col>
  )
}

function LimitBet(props: { bet: LimitBet; onCancel: () => void }) {
  const { bet, onCancel } = props
  const filledAmount = sumBy(bet.fills, (fill) => fill.amount)
  return (
    <tr>
      <td>
        <div className="pl-2">
          <BinaryOutcomeLabel outcome={bet.outcome as 'YES' | 'NO'} />
        </div>
      </td>
      <td>{formatMoney(bet.amount - filledAmount)}</td>
      <td>{formatPercent(bet.limitProb)}</td>
      <td>
        <button
          className="btn btn-xs btn-outline my-auto normal-case"
          onClick={onCancel}
        >
          Cancel
        </button>
      </td>
    </tr>
  )
}
