import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import {
  CPMMBinaryContract,
  CPMMMultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatMoney, formatPercent } from 'common/util/format'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
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
import { SizedContainer } from '../sized-container'
import { api } from 'web/lib/firebase/api'

export function YourOrders(props: {
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
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

      <OrderTable limitBets={yourBets} contract={contract} isYou />
    </Col>
  )
}

export function OrderTable(props: {
  limitBets: LimitBet[]
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  isYou?: boolean
  side?: 'YES' | 'NO'
}) {
  const { limitBets, contract, isYou, side } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const [isCancelling, setIsCancelling] = useState(false)
  const onCancel = async () => {
    setIsCancelling(true)
    await Promise.all(
      limitBets.map((bet) => api('cancel-bet', { betId: bet.id }))
    )
    setIsCancelling(false)
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
              <th>
                <Row className={'mt-1 justify-between gap-1 sm:justify-start'}>
                  Expires
                  {isYou && limitBets.length > 1 && (
                    <Button
                      loading={isCancelling}
                      size={'2xs'}
                      color={'gray-outline'}
                      onClick={onCancel}
                      className={'ml-1 whitespace-normal'}
                    >
                      Cancel all
                    </Button>
                  )}
                </Row>
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {limitBets.map((bet) => (
            <OrderRow
              key={bet.id}
              bet={bet}
              contract={contract}
              isYou={!!isYou}
              showOutcome={!side}
            />
          ))}
        </tbody>
      </Table>
    </Col>
  )
}

function OrderRow(props: {
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  bet: LimitBet
  isYou: boolean
  showOutcome?: boolean
}) {
  const { contract, bet, isYou, showOutcome } = props
  const { orderAmount, amount, limitProb, outcome } = bet
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  const [isCancelling, setIsCancelling] = useState(false)

  const onCancel = async () => {
    setIsCancelling(true)
    await api('cancel-bet', { betId: bet.id })
    setIsCancelling(false)
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
          <Row className={'justify-between gap-1 sm:justify-start'}>
            <Col className={'sm:flex-row sm:gap-1'}>
              <span>
                {bet.expiresAt
                  ? new Date(bet.expiresAt).toLocaleDateString()
                  : 'Never'}
              </span>
              <span>
                {bet.expiresAt
                  ? new Date(bet.expiresAt).toLocaleTimeString()
                  : ''}
              </span>
            </Col>
            <div>
              <Button
                loading={isCancelling}
                size="2xs"
                color="gray-outline"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </Row>
        </td>
      )}
    </tr>
  )
}

export function OrderBookButton(props: {
  limitBets: LimitBet[]
  contract:
    | CPMMBinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
  className?: string
}) {
  const { limitBets, contract, className } = props
  const [open, setOpen] = useState(false)

  const yesBets = sortBy(
    limitBets.filter((bet) => bet.outcome === 'YES'),
    (bet) => -1 * bet.limitProb,
    (bet) => bet.createdTime
  )
  const noBets = sortBy(
    limitBets.filter((bet) => bet.outcome === 'NO'),
    (bet) => bet.limitProb,
    (bet) => bet.createdTime
  )

  const isCPMMMulti = contract.mechanism === 'cpmm-multi-1'
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'

  return (
    <>
      <Button
        className={className}
        onClick={() => setOpen(true)}
        disabled={limitBets.length === 0}
        size="xs"
        color="indigo"
      >
        View {limitBets.length} order{limitBets.length === 1 ? '' : 's'}
      </Button>

      <Modal open={open} setOpen={setOpen} size="md">
        <Col className="bg-canvas-0 text-ink-800 rounded p-4 py-6">
          <Title className="flex items-center">
            Order book{' '}
            <InfoTooltip
              text="List of active limit orders by traders wishing to buy YES or NO at a given probability"
              className="ml-1"
            />
          </Title>

          <h2 className="mb-1 text-center">Cumulative shares vs probability</h2>
          {!isCPMMMulti && !isPseudoNumeric && (
            <SizedContainer className="mb-6 h-[132px] w-full max-w-md self-center px-8 sm:h-[200px] sm:px-14">
              {(w, h) => (
                <DepthChart
                  contract={contract as any}
                  yesBets={yesBets}
                  noBets={noBets}
                  width={w}
                  height={h}
                />
              )}
            </SizedContainer>
          )}
          {isCPMMMulti ? (
            contract.answers.map((answer) => {
              const answerYesBets = yesBets.filter(
                (bet) => bet.answerId === answer.id
              )
              const answerNoBets = noBets.filter(
                (bet) => bet.answerId === answer.id
              )
              if (answerYesBets.length === 0 && answerNoBets.length === 0) {
                return null
              }
              return (
                <Col key={answer.id} className="gap-2">
                  {answer.text}
                  <Row className="mt-2 items-start justify-around gap-2">
                    <OrderTable
                      limitBets={answerYesBets}
                      contract={contract}
                      side="YES"
                    />
                    <OrderTable
                      limitBets={answerNoBets}
                      contract={contract}
                      side="NO"
                    />
                  </Row>
                </Col>
              )
            })
          ) : (
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
          )}
        </Col>
      </Modal>
    </>
  )
}
