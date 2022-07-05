import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import { formatMoney, formatPercent } from 'common/util/format'
import { sortBy, sumBy } from 'lodash'
import { useState } from 'react'
import { cancelBet } from 'web/lib/firebase/api-call'
import { Col } from './layout/col'
import { LoadingIndicator } from './loading-indicator'
import { BinaryOutcomeLabel } from './outcome-label'

export function LimitBets(props: { bets: LimitBet[]; className?: string }) {
  const { bets, className } = props
  const recentBets = sortBy(bets, (bet) => bet.createdTime).reverse()

  return (
    <Col className={clsx(className, 'gap-2 rounded bg-white')}>
      <div className="px-6 py-3 text-xl">Limit bets</div>
      <table className="table-compact table w-full rounded text-gray-500">
        <tbody>
          {recentBets.map((bet) => (
            <LimitBet key={bet.id} bet={bet} />
          ))}
        </tbody>
      </table>
    </Col>
  )
}

function LimitBet(props: { bet: LimitBet }) {
  const { bet } = props
  const filledAmount = sumBy(bet.fills, (fill) => fill.amount)
  const [isCancelling, setIsCancelling] = useState(false)

  const onCancel = () => {
    cancelBet({ betId: bet.id })
    setIsCancelling(true)
  }

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
        {isCancelling ? (
          <LoadingIndicator />
        ) : (
          <button
            className="btn btn-xs btn-outline my-auto normal-case"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
  )
}
