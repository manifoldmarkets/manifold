import { LimitBet } from 'common/bet'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatMoney, formatPercent } from 'common/util/format'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { useUser, useUserById } from 'web/hooks/use-user'
import { cancelBet } from 'web/lib/firebase/api'
import { Avatar } from './avatar'
import { Button } from './button'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Row } from './layout/row'
import { LoadingIndicator } from './loading-indicator'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from './outcome-label'
import { Subtitle } from './subtitle'
import { Title } from './title'

export function LimitBets(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  bets: LimitBet[]
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
    <Col className={className}>
      {yourBets.length === 0 && (
        <OrderBookButton
          className="self-end"
          limitBets={sortedBets}
          contract={contract}
        />
      )}

      {yourBets.length > 0 && (
        <Col
          className={'mt-4 gap-2 overflow-hidden rounded bg-white px-4 py-3'}
        >
          <Row className="mt-2 mb-4 items-center justify-between">
            <Subtitle className="!mt-0 !mb-0" text="Your orders" />

            <OrderBookButton
              className="self-end"
              limitBets={sortedBets}
              contract={contract}
            />
          </Row>

          <LimitOrderTable
            limitBets={yourBets}
            contract={contract}
            isYou={true}
          />
        </Col>
      )}
    </Col>
  )
}

export function LimitOrderTable(props: {
  limitBets: LimitBet[]
  contract: CPMMBinaryContract | PseudoNumericContract
  isYou: boolean
}) {
  const { limitBets, contract, isYou } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  return (
    <table className="table-compact table w-full rounded text-gray-500">
      <thead>
        {!isYou && <th></th>}
        <th>Outcome</th>
        <th>Amount</th>
        <th>{isPseudoNumeric ? 'Value' : 'Prob'}</th>
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

export function OrderBookButton(props: {
  limitBets: LimitBet[]
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
}) {
  const { limitBets, contract, className } = props
  const [open, setOpen] = useState(false)

  const yesBets = limitBets.filter((bet) => bet.outcome === 'YES')
  const noBets = limitBets.filter((bet) => bet.outcome === 'NO').reverse()

  return (
    <>
      <Button
        className={className}
        onClick={() => setOpen(true)}
        size="xs"
        color="blue"
      >
        Order book
      </Button>

      <Modal open={open} setOpen={setOpen} size="lg">
        <Col className="rounded bg-white p-4 py-6">
          <Title className="!mt-0" text="Order book" />
          <Row className="hidden items-start justify-start gap-2 md:flex">
            <LimitOrderTable
              limitBets={yesBets}
              contract={contract}
              isYou={false}
            />
            <LimitOrderTable
              limitBets={noBets}
              contract={contract}
              isYou={false}
            />
          </Row>
          <Col className="md:hidden">
            <LimitOrderTable
              limitBets={limitBets}
              contract={contract}
              isYou={false}
            />
          </Col>
        </Col>
      </Modal>
    </>
  )
}
