import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  getBinaryMCProb,
  isBinaryMulti,
  MultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatPercent } from 'common/util/format'
import { groupBy, keyBy, sortBy, sumBy } from 'lodash'
import { useState } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useUser } from 'web/hooks/use-user'
import { useDisplayUserById, useUsers } from 'web/hooks/use-user-supabase'
import { api } from 'web/lib/api/api'
import { getCountdownString } from 'web/lib/util/time'
import { Button } from '../buttons/button'
import { DepthChart } from '../charts/contract/depth-chart'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import {
  BinaryOutcomeLabel,
  NoLabel,
  OutcomeLabel,
  PseudoNumericOutcomeLabel,
  YesLabel,
} from '../outcome-label'
import { SizedContainer } from '../sized-container'
import { UserHovercard } from '../user/user-hovercard'
import { Avatar } from '../widgets/avatar'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Subtitle } from '../widgets/subtitle'
import { Table } from '../widgets/table'
import { Tooltip } from '../widgets/tooltip'
import { MoneyDisplay } from './money-display'
import { MultipleOrSingleAvatars } from '../multiple-or-single-avatars'
import { DisplayUser } from 'common/api/user-types'
import { UserLink } from '../widgets/user-link'

export function YourOrders(props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | CPMMNumericContract
  bets: LimitBet[]
  deemphasizedHeader?: boolean
  className?: string
}) {
  const { contract, bets, deemphasizedHeader, className } = props
  const user = useUser()

  const yourBets = sortBy(
    bets.filter((bet) => bet.userId === user?.id),
    (bet) => -1 * bet.limitProb,
    (bet) => -1 * bet.createdTime
  )

  const maxShownNotExpanded = 3
  const [isExpanded, setIsExpanded] = usePersistentInMemoryState(
    false,
    `${contract.id}-your-orderbook-expanded`
  )

  if (yourBets.length === 0) return null

  const moreOrders = yourBets.length - maxShownNotExpanded

  return (
    <Col className={clsx(className, 'gap-2 overflow-x-auto')}>
      <Row className="items-center justify-between">
        {deemphasizedHeader ? (
          <div className="text-ink-700 text-lg">Your orders</div>
        ) : (
          <Subtitle className="!my-0 mx-2">Your orders</Subtitle>
        )}
      </Row>

      <OrderTable
        limitBets={yourBets.slice(
          0,
          isExpanded ? yourBets.length : maxShownNotExpanded
        )}
        contract={contract}
        isYou
      />

      {yourBets.length > maxShownNotExpanded && (
        <Button
          className="w-full"
          color="gray-white"
          onClick={() => setIsExpanded((b) => !b)}
        >
          {isExpanded ? (
            <ChevronUpIcon className="mr-1 h-4 w-4" />
          ) : (
            <ChevronDownIcon className="mr-1 h-4 w-4" />
          )}
          {isExpanded
            ? 'Show fewer orders'
            : `Show ${moreOrders} more order${moreOrders === 1 ? '' : 's'}`}
        </Button>
      )}
    </Col>
  )
}

export function OrderTable(props: {
  limitBets: LimitBet[]
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | MultiContract
  isYou?: boolean
  side?: 'YES' | 'NO'
}) {
  const { limitBets, contract, isYou, side } = props
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const [isCancelling, setIsCancelling] = useState(false)
  const isBinaryMC = isBinaryMulti(contract)
  const onCancel = async () => {
    setIsCancelling(true)
    await Promise.all(
      limitBets.map((bet) => api('bet/cancel/:betId', { betId: bet.id }))
    )
    setIsCancelling(false)
  }
  return (
    <Col>
      {side && (
        <Row className="ml-2">
          <span className="mr-2">Buy</span>{' '}
          {isBinaryMC ? (
            <OutcomeLabel
              contract={contract}
              outcome={side}
              truncate={'short'}
            />
          ) : side === 'YES' ? (
            <YesLabel />
          ) : (
            <NoLabel />
          )}
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
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | MultiContract
  bet: LimitBet
  isYou: boolean
  showOutcome?: boolean
}) {
  const { contract, bet, isYou, showOutcome } = props
  const { orderAmount, amount, limitProb, outcome } = bet
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isBinaryMC = isBinaryMulti(contract)
  const user = useDisplayUserById(bet.userId)

  const [isCancelling, setIsCancelling] = useState(false)

  const onCancel = async () => {
    setIsCancelling(true)
    await api('bet/cancel/:betId', { betId: bet.id })
    setIsCancelling(false)
  }

  const isCashContract = contract.token === 'CASH'

  return (
    <tr>
      {!isYou && user && (
        <td>
          <a href={`/${user.username}`}>
            <UserHovercard userId={bet.userId}>
              <Avatar
                size={'sm'}
                avatarUrl={user.avatarUrl}
                username={user.username}
                noLink={true}
              />
            </UserHovercard>
          </a>
        </td>
      )}
      {showOutcome && (
        <td>
          <div className="pl-2">
            {isPseudoNumeric ? (
              <PseudoNumericOutcomeLabel outcome={outcome as 'YES' | 'NO'} />
            ) : isBinaryMC ? (
              <OutcomeLabel
                contract={contract}
                outcome={outcome}
                truncate={'short'}
              />
            ) : (
              <BinaryOutcomeLabel outcome={outcome as 'YES' | 'NO'} />
            )}
          </div>
        </td>
      )}
      <td>
        {isPseudoNumeric
          ? getFormattedMappedValue(contract, limitProb)
          : isBinaryMC
          ? formatPercent(getBinaryMCProb(limitProb, outcome))
          : formatPercent(limitProb)}
      </td>
      <td>
        <MoneyDisplay
          amount={orderAmount - amount}
          isCashContract={isCashContract}
        />
      </td>
      {isYou && (
        <td>
          <Row className={'justify-between gap-1 sm:justify-start'}>
            <Col className={'sm:flex-row sm:gap-1'}>
              <span>
                {bet.expiresAt ? (
                  <Tooltip
                    text={`${new Date(
                      bet.expiresAt
                    ).toLocaleDateString()} ${new Date(
                      bet.expiresAt
                    ).toLocaleTimeString()}`}
                  >
                    {getCountdownString(new Date(bet.expiresAt))}
                  </Tooltip>
                ) : (
                  'Never'
                )}
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

export function CollatedOrderTable(props: {
  limitBets: LimitBet[]
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | MultiContract
  side: 'YES' | 'NO'
  pseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: string
    }
    NO: {
      pseudonymName: string
      pseudonymColor: string
    }
  }
}) {
  const { limitBets, contract, side, pseudonym } = props
  const isBinaryMC = isBinaryMulti(contract)
  const groupedBets = groupBy(limitBets, (b) => b.limitProb)

  return (
    <div>
      <Row>
        <span className="mr-2">Buy</span>
        {isBinaryMC || !!pseudonym ? (
          <OutcomeLabel
            contract={contract}
            outcome={side}
            truncate={'short'}
            pseudonym={pseudonym}
          />
        ) : side === 'YES' ? (
          <YesLabel />
        ) : (
          <NoLabel />
        )}
      </Row>

      <div className="grid grid-cols-[32px_auto_1fr] gap-1">
        {Object.entries(groupedBets).map(([prob, bets]) => (
          <CollapsedOrderRow
            contract={contract}
            key={prob}
            limitProb={Number(prob)}
            bets={bets}
          />
        ))}
      </div>
    </div>
  )
}

function CollapsedOrderRow(props: {
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | MultiContract
  limitProb: number
  bets: LimitBet[]
}) {
  const { contract, limitProb, bets } = props
  const { outcome } = bets[0]
  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const isBinaryMC = isBinaryMulti(contract)

  const total = sumBy(bets, (b) => b.orderAmount - b.amount)

  const allUsers = useUsers(bets.map((b) => b.userId))?.filter(
    (a) => a != null
  ) as DisplayUser[] | undefined
  const usersById = keyBy(allUsers, (u) => u.id)

  // find 3 largest users
  const userBets = groupBy(bets, (b) => b.userId)
  const userSums = Object.entries(userBets).map(
    ([userId, bets]) =>
      [userId, sumBy(bets, (b) => b.orderAmount - b.amount)] as const
  )
  const largest = sortBy(userSums, ([, sum]) => -sum)
    .slice(0, 3)
    .map(([userId]) => usersById[userId])
    .filter((u) => u != null)
    .reverse()

  const [collapsed, setCollapsed] = useState(true)

  return (
    <>
      <div className="self-center">
        {isPseudoNumeric
          ? getFormattedMappedValue(contract, limitProb)
          : isBinaryMC
          ? formatPercent(getBinaryMCProb(limitProb, outcome))
          : formatPercent(limitProb)}
      </div>

      <div className="relative justify-start p-1">
        <MultipleOrSingleAvatars
          className="!items-end"
          avatars={largest}
          total={userSums.length}
          size="xs"
          spacing={0.3}
          startLeft={0.6}
          onClick={() => setCollapsed((c) => !c)}
        />
      </div>

      <div className="self-center pr-1 text-right">
        <MoneyDisplay
          amount={total}
          numberType="short"
          isCashContract={contract.token === 'CASH'}
        />
      </div>

      {!collapsed &&
        bets.map((b) => {
          const u = usersById[b.userId]
          return (
            <div
              className="bg-canvas-50 col-span-3 flex justify-between p-1"
              key={b.id}
            >
              <div className="flex items-center gap-2">
                <Avatar
                  avatarUrl={u.avatarUrl}
                  username={u.username}
                  size="xs"
                />
                <UserLink user={u} short />
              </div>
              <div className="text-right">
                <MoneyDisplay
                  amount={b.orderAmount - b.amount}
                  isCashContract={contract.token === 'CASH'}
                />
              </div>
            </div>
          )
        })}
    </>
  )
}

export function OrderBookButton(props: {
  limitBets: LimitBet[]
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | MultiContract
  answer?: Answer
  label?: React.ReactNode
}) {
  const { limitBets, contract, answer, label } = props
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={limitBets.length === 0}>
        {label || getOrderBookButtonLabel(limitBets)}
      </button>

      <Modal open={open} setOpen={setOpen} size="md">
        <Col className="bg-canvas-0">
          <OrderBookPanel
            limitBets={limitBets}
            contract={contract}
            answer={answer}
            showTitle
          />
        </Col>
      </Modal>
    </>
  )
}

export function getOrderBookButtonLabel(limitBets: LimitBet[]) {
  return `${limitBets.length === 0 ? 'Currently' : 'View'} ${
    limitBets.length
  } order${limitBets.length === 1 ? '' : 's'}`
}

export function OrderBookPanel(props: {
  limitBets: LimitBet[]
  contract:
    | BinaryContract
    | PseudoNumericContract
    | StonkContract
    | CPMMMultiContract
    | MultiContract
  answer?: Answer
  showTitle?: boolean
  pseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: string
    }
    NO: {
      pseudonymName: string
      pseudonymColor: string
    }
  }
}) {
  const { limitBets, contract, answer, showTitle, pseudonym } = props

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

  if (limitBets.length === 0) return <></>

  return (
    <Col className="text-ink-800 my-2 gap-2 rounded-lg bg-indigo-200/10 px-2 py-4 sm:px-4">
      <Subtitle className="!my-0">
        Order book{' '}
        <InfoTooltip
          text="List of active limit orders by traders wishing to buy YES or NO at a given probability"
          className="ml-1"
        />
      </Subtitle>

      {showTitle && isCPMMMulti && answer && <div>{answer.text}</div>}

      <Row className="items-start justify-around gap-4">
        <CollatedOrderTable
          limitBets={yesBets}
          contract={contract}
          side="YES"
          pseudonym={pseudonym}
        />
        <CollatedOrderTable
          limitBets={noBets}
          contract={contract}
          side="NO"
          pseudonym={pseudonym}
        />
      </Row>

      {!isPseudoNumeric && yesBets.length >= 2 && noBets.length >= 2 && (
        <>
          <h2 className="text-center text-sm">
            Cumulative shares vs probability
          </h2>
          <SizedContainer className="mb-6 h-[132px] w-full max-w-md self-center px-8 sm:h-[200px] sm:px-14">
            {(w, h) => (
              <DepthChart
                contract={contract as any}
                answer={answer}
                yesBets={yesBets}
                noBets={noBets}
                width={w}
                height={h}
                pseudonym={pseudonym}
              />
            )}
          </SizedContainer>
        </>
      )}
    </Col>
  )
}
