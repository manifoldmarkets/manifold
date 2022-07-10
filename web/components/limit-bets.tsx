import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatMoney, formatPercent } from 'common/util/format'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { cancelBet } from 'web/lib/firebase/api-call'
import { Col } from './layout/col'
import { LoadingIndicator } from './loading-indicator'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from './outcome-label'

export function LimitBets(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  bets: LimitBet[]
  className?: string
}) {
  const { contract, bets, className } = props
  const recentBets = sortBy(
    bets,
    (bet) => -1 * bet.limitProb,
    (bet) => -1 * bet.createdTime
  )

  return (
    <Col
      className={clsx(className, 'gap-2 overflow-hidden rounded bg-white py-3')}
    >
      <div className="px-6 py-3 text-xl">Your limit bets</div>
      <div className="px-4">
        <table className="table-compact table w-full rounded text-gray-500">
          <tbody>
            {recentBets.map((bet) => (
              <LimitBet key={bet.id} bet={bet} contract={contract} />
            ))}
          </tbody>
        </table>
      </div>
    </Col>
  )
}

function LimitBet(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  bet: LimitBet
}) {
  const { contract, bet } = props
  const { orderAmount, amount, limitProb, outcome } = bet
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [isCancelling, setIsCancelling] = useState(false)

  const onCancel = () => {
    cancelBet({ betId: bet.id })
    setIsCancelling(true)
  }

  return (
    <tr>
      <td>
        <div className="pl-2">
          {isPseudoNumeric ? (
            <PseudoNumericOutcomeLabel outcome={outcome as 'YES' | 'NO'} />
          ) : (
            <BinaryOutcomeLabel outcome={outcome as 'YES' | 'NO'} />
          )}
        </div>
      </td>
      <td>{formatMoney(orderAmount - amount)}</td>
      <td>
        {isPseudoNumeric
          ? getFormattedMappedValue(contract)(limitProb)
          : formatPercent(limitProb)}
      </td>
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
