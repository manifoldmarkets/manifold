import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatMoney, formatPercent } from 'common/util/format'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { useUser, useUserById } from 'web/hooks/use-user'
import { cancelBet } from 'web/lib/firebase/api'
import { Avatar } from './avatar'
import { Col } from './layout/col'
import { Tabs } from './layout/tabs'
import { LoadingIndicator } from './loading-indicator'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from './outcome-label'

export function LimitBets(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  bets: LimitBet[]
  hideLabel?: boolean
  className?: string
}) {
  const { contract, bets, className } = props
  const sortedBets = sortBy(
    bets,
    (bet) => -1 * bet.limitProb,
    (bet) => -1 * bet.createdTime
  )
  const user = useUser()
  const yourBets = sortedBets.filter((bet) => bet.userId === user?.id)

  return (
    <Col
      className={clsx(
        className,
        'gap-2 overflow-hidden rounded bg-white px-4 py-3'
      )}
    >
      <Tabs
        tabs={[
          ...(yourBets.length > 0
            ? [
                {
                  title: 'Your limit orders',
                  content: (
                    <LimitOrderTable
                      limitBets={yourBets}
                      contract={contract}
                      isYou={true}
                    />
                  ),
                },
              ]
            : []),
          {
            title: 'All limit orders',
            content: (
              <LimitOrderTable
                limitBets={sortedBets}
                contract={contract}
                isYou={false}
              />
            ),
          },
        ]}
      />
    </Col>
  )
}

function LimitOrderTable(props: {
  limitBets: LimitBet[]
  contract: CPMMBinaryContract | PseudoNumericContract
  isYou: boolean
}) {
  const { limitBets, contract, isYou } = props

  return (
    <table className="table-compact table w-full rounded text-gray-500">
      <thead>
        {!isYou && <th>User</th>}
        <th>Outcome</th>
        <th>Amount</th>
        <th>Prob</th>
        {isYou && <th></th>}
      </thead>
      <tbody>
        {limitBets.map((bet) => (
          <LimitBet key={bet.id} bet={bet} contract={contract} isYou={isYou} />
        ))}
      </tbody>
    </table>
  )
}

function LimitBet(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  bet: LimitBet
  isYou: boolean
}) {
  const { contract, bet, isYou } = props
  const { orderAmount, amount, limitProb, outcome } = bet
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [isCancelling, setIsCancelling] = useState(false)

  const onCancel = () => {
    cancelBet({ betId: bet.id })
    setIsCancelling(true)
  }

  const user = useUserById(bet.userId)

  return (
    <tr>
      {!isYou && (
        <td>
          <Avatar
            size={'sm'}
            avatarUrl={user?.avatarUrl}
            username={user?.username}
          />
        </td>
      )}
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
      {isYou && (
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
      )}
    </tr>
  )
}
