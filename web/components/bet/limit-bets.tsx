import { LimitBet } from 'common/bet'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatMoney, formatPercent } from 'common/util/format'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { cancelBet } from 'web/lib/firebase/api'
import { Avatar } from '../widgets/avatar'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { BinaryOutcomeLabel, PseudoNumericOutcomeLabel } from '../outcome-label'
import { Subtitle } from '../widgets/subtitle'
import { Table } from '../widgets/table'
import { Title } from '../widgets/title'

export function LimitBets(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  bets: LimitBet[]
  className?: string
}) {
  const { contract, bets, className } = props
  const user = useUser()

  const yourBets = sortBy(
    bets.filter((bet) => bet.userId === user?.id),
    (bet) => -1 * bet.limitProb,
    (bet) => bet.createdTime
  )

  return (
    <Col className={className}>
      {yourBets.length === 0 && (
        <OrderBookButton
          className="self-end"
          limitBets={bets}
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
              limitBets={bets}
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
    <Table className="rounded">
      <thead>
        <tr>
          {!isYou && <th></th>}
          <th>Outcome</th>
          <th>{isPseudoNumeric ? 'Value' : 'Prob'}</th>
          <th>Amount</th>
          {isYou && <th></th>}
        </tr>
      </thead>
      <tbody>
        {limitBets.map((bet) => (
          <LimitBet key={bet.id} bet={bet} contract={contract} isYou={isYou} />
        ))}
      </tbody>
    </Table>
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
  const [isCancelled, setIsCancelled] = useState(false)

  const onCancel = () => {
    setIsCancelling(true)
    cancelBet({ betId: bet.id }).then(() => {
      setIsCancelled(false)
      setIsCancelled(true)
    })
  }

  if (isCancelled) return <></>

  return (
    <tr>
      {!isYou && (
        <td>
          <Avatar
            size={'sm'}
            avatarUrl={bet.userAvatarUrl}
            username={bet.userUsername}
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
      <td>
        {isPseudoNumeric
          ? getFormattedMappedValue(contract)(limitProb)
          : formatPercent(limitProb)}
      </td>
      <td>{formatMoney(orderAmount - amount)}</td>
      {isYou && (
        <td>
          {isCancelling ? (
            <LoadingIndicator />
          ) : (
            <Button size="2xs" color="gray-outline" onClick={onCancel}>
              Cancel
            </Button>
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

  const sortedBets = sortBy(
    limitBets,
    (bet) => -1 * bet.limitProb,
    (bet) => bet.createdTime
  )

  const yesBets = sortedBets.filter((bet) => bet.outcome === 'YES')
  const noBets = sortBy(
    sortedBets.filter((bet) => bet.outcome === 'NO'),
    (bet) => bet.limitProb,
    (bet) => bet.createdTime
  )

  return (
    <>
      <Button
        className={className}
        onClick={() => setOpen(true)}
        size="xs"
        color="blue"
      >
        Order book ({limitBets.length})
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
              limitBets={sortedBets}
              contract={contract}
              isYou={false}
            />
          </Col>
        </Col>
      </Modal>
    </>
  )
}
