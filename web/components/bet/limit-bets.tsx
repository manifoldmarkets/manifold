import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import {
  CPMMBinaryContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
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
import {
  BinaryOutcomeLabel,
  NoLabel,
  PseudoNumericOutcomeLabel,
  YesLabel,
} from '../outcome-label'
import { Subtitle } from '../widgets/subtitle'
import { Table } from '../widgets/table'
import { Title } from '../widgets/title'
import { Tooltip } from '../widgets/tooltip'
import { InfoTooltip } from '../widgets/info-tooltip'
import { DepthChart } from '../charts/contract/depth-chart'

export function YourOrders(props: {
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

  if (yourBets.length === 0) return null

  return (
    <Col className={clsx(className, 'gap-2 overflow-hidden')}>
      <Row className="items-center justify-between">
        <Subtitle className="!my-0">Your orders</Subtitle>
      </Row>

      <OrderTable limitBets={yourBets} contract={contract} isYou={true} />
    </Col>
  )
}

export function OrderTable(props: {
  limitBets: LimitBet[]
  contract: CPMMBinaryContract | PseudoNumericContract | StonkContract
  isYou: boolean
  side?: 'YES' | 'NO'
}) {
  const { limitBets, contract, isYou, side } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const [isCancelling, setIsCancelling] = useState(false)
  const onCancel = () => {
    setIsCancelling(true)
    Promise.all(limitBets.map((bet) => cancelBet({ betId: bet.id }))).then(
      () => {
        setIsCancelling(false)
      }
    )
  }
  return (
    <Col>
      {side && (
        <Row className="ml-2">
          <span className="mr-2">Buy</span>{' '}
          {side === 'YES' ? <YesLabel /> : <NoLabel />}
        </Row>
      )}
      <Table className="rounded">
        <thead>
          {!side && (
            <tr>
              {!isYou && <th></th>}
              <th>Outcome</th>
              <th>{isPseudoNumeric ? 'Value' : 'Prob'}</th>
              <th>Amount</th>
              {isYou && limitBets.length > 1 && (
                <th>
                  <Button
                    loading={isCancelling}
                    size={'2xs'}
                    color={'gray-outline'}
                    onClick={onCancel}
                    className={'whitespace-normal'}
                  >
                    Cancel all
                  </Button>
                </th>
              )}
            </tr>
          )}
        </thead>
        <tbody>
          {limitBets.map((bet) => (
            <OrderRow
              key={bet.id}
              bet={bet}
              contract={contract}
              isYou={isYou}
              showOutcome={!side}
            />
          ))}
        </tbody>
      </Table>
    </Col>
  )
}

function OrderRow(props: {
  contract: CPMMBinaryContract | PseudoNumericContract | StonkContract
  bet: LimitBet
  isYou: boolean
  showOutcome?: boolean
}) {
  const { contract, bet, isYou, showOutcome } = props
  const { orderAmount, amount, limitProb, outcome } = bet
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [isCancelling, setIsCancelling] = useState(false)

  const onCancel = () => {
    setIsCancelling(true)
    cancelBet({ betId: bet.id }).then(() => {
      setIsCancelling(false)
    })
  }

  return (
    <tr>
      {!isYou && (
        <td>
          <a href={`/${bet.userUsername}`}>
            <Tooltip text={bet.userName}>
              <Avatar
                size={'sm'}
                avatarUrl={bet.userAvatarUrl}
                username={bet.userUsername}
                noLink={true}
              />
            </Tooltip>
          </a>
        </td>
      )}
      {showOutcome && (
        <td>
          <div className="pl-2">
            {isPseudoNumeric ? (
              <PseudoNumericOutcomeLabel outcome={outcome as 'YES' | 'NO'} />
            ) : (
              <BinaryOutcomeLabel outcome={outcome as 'YES' | 'NO'} />
            )}
          </div>
        </td>
      )}
      <td>
        {isPseudoNumeric
          ? getFormattedMappedValue(contract, limitProb)
          : formatPercent(limitProb)}
      </td>
      <td>{formatMoney(orderAmount - amount)}</td>
      {isYou && (
        <td>
          <Button
            loading={isCancelling}
            size="2xs"
            color="gray-outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
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
  const noBets = sortedBets.filter((bet) => bet.outcome === 'NO').reverse()

  return (
    <>
      <Button
        className={className}
        onClick={() => setOpen(true)}
        disabled={limitBets.length === 0}
        size="xs"
        color="indigo"
      >
        {limitBets.length} orders
      </Button>

      <Modal open={open} setOpen={setOpen} size="md">
        <Col className="bg-canvas-0 rounded p-4 py-6">
          <Title className="flex">
            Order book{' '}
            <InfoTooltip
              text="List of active limit orders by traders wishing to buy YES or NO at a given probability"
              className="ml-1 self-center"
            />
          </Title>
          <DepthChart contract={contract} yesBets={yesBets} noBets={noBets} />
          <Row className="mt-2 items-start justify-around gap-2">
            <OrderTable
              limitBets={yesBets}
              contract={contract}
              isYou={false}
              side="YES"
            />
            <OrderTable
              limitBets={noBets}
              contract={contract}
              isYou={false}
              side="NO"
            />
          </Row>
        </Col>
      </Modal>
    </>
  )
}
