import Link from 'next/link'
import { keyBy, groupBy, mapValues, sortBy, partition, sumBy } from 'lodash'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'

import { Bet, MAX_USER_BETS_LOADED } from 'web/lib/firebase/bets'
import { User } from 'web/lib/firebase/users'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import {
  Contract,
  contractPath,
  getBinaryProbPercent,
  MAX_USER_BET_CONTRACTS_LOADED,
} from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { sellBet } from 'web/lib/firebase/api'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { OutcomeLabel } from '../outcome-label'
import { LoadingIndicator } from '../loading-indicator'
import { SiteLink } from '../site-link'
import {
  calculatePayout,
  calculateSaleAmount,
  getOutcomeProbability,
  getProbabilityAfterSale,
  getContractBetMetrics,
  resolvedPayout,
  getContractBetNullMetrics,
} from 'common/calculate'
import { NumericContract } from 'common/contract'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { useUser } from 'web/hooks/use-user'
import { useUserBets } from 'web/hooks/use-user-bets'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { LimitBet } from 'common/bet'
import { Pagination } from '../pagination'
import { LimitOrderTable } from './limit-bets'
import { UserLink } from 'web/components/user-link'
import { useUserBetContracts } from 'web/hooks/use-contracts'
import { BetsSummary } from './bet-summary'
import { ProfitBadge } from '../profit-badge'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { ExclamationIcon } from '@heroicons/react/outline'
import { Select } from '../select'
import { Table } from '../table'

type BetSort = 'newest' | 'profit' | 'closeTime' | 'value'
type BetFilter = 'open' | 'limit_bet' | 'sold' | 'closed' | 'resolved' | 'all'

const CONTRACTS_PER_PAGE = 50
const JUNE_1_2022 = new Date('2022-06-01T00:00:00.000Z').valueOf()

export function BetsList(props: { user: User }) {
  const { user } = props

  const signedInUser = useUser()
  const isYourBets = user.id === signedInUser?.id
  const hideBetsBefore = isYourBets ? 0 : JUNE_1_2022
  const userBets = useUserBets(user.id)

  // Hide bets before 06-01-2022 if this isn't your own profile
  // NOTE: This means public profits also begin on 06-01-2022 as well.
  const bets = useMemo(
    () =>
      userBets?.filter(
        (bet) => !bet.isAnte && bet.createdTime >= (hideBetsBefore ?? 0)
      ),
    [userBets, hideBetsBefore]
  )

  const contractList = useUserBetContracts(user.id)
  const contractsById = useMemo(() => {
    return contractList ? keyBy(contractList, 'id') : undefined
  }, [contractList])

  const loadedPartialData =
    userBets?.length === MAX_USER_BETS_LOADED ||
    contractList?.length === MAX_USER_BET_CONTRACTS_LOADED

  const [sort, setSort] = usePersistentState<BetSort>('newest', {
    key: 'bets-list-sort',
    store: storageStore(safeLocalStorage()),
  })
  const [filter, setFilter] = usePersistentState<BetFilter>('all', {
    key: 'bets-list-filter',
    store: storageStore(safeLocalStorage()),
  })
  const [page, setPage] = useState(0)
  const start = page * CONTRACTS_PER_PAGE
  const end = start + CONTRACTS_PER_PAGE

  if (!bets || !contractsById) {
    return <LoadingIndicator />
  }
  if (bets.length === 0) return <NoBets user={user} />

  // Decending creation time.
  bets.sort((bet1, bet2) => bet2.createdTime - bet1.createdTime)
  const contractBets = groupBy(bets, 'contractId')

  // Keep only contracts that have bets.
  const contracts = Object.values(contractsById).filter(
    (c) => contractBets[c.id]
  )

  const contractsMetrics = mapValues(contractBets, (bets, contractId) => {
    const contract = contractsById[contractId]
    if (!contract) return getContractBetNullMetrics()
    return getContractBetMetrics(contract, bets)
  })

  const FILTERS: Record<BetFilter, (c: Contract) => boolean> = {
    resolved: (c) => !!c.resolutionTime,
    closed: (c) =>
      !FILTERS.resolved(c) && (c.closeTime ?? Infinity) < Date.now(),
    open: (c) => !(FILTERS.closed(c) || FILTERS.resolved(c)),
    all: () => true,
    sold: () => true,
    limit_bet: (c) => FILTERS.open(c),
  }
  const SORTS: Record<BetSort, (c: Contract) => number> = {
    profit: (c) => contractsMetrics[c.id].profit,
    value: (c) => contractsMetrics[c.id].payout,
    newest: (c) =>
      Math.max(...contractBets[c.id].map((bet) => bet.createdTime)),
    closeTime: (c) =>
      // This is in fact the intuitive sort direction.
      (filter === 'open' ? -1 : 1) *
      (c.resolutionTime ?? c.closeTime ?? Infinity),
  }
  const filteredContracts = sortBy(contracts, SORTS[sort])
    .reverse()
    .filter(FILTERS[filter])
    .filter((c) => {
      if (filter === 'all') return true

      const { hasShares } = contractsMetrics[c.id]

      if (filter === 'sold') return !hasShares
      if (filter === 'limit_bet')
        return (contractBets[c.id] ?? []).some(
          (b) => b.limitProb !== undefined && !b.isCancelled && !b.isFilled
        )
      return hasShares
    })
  const displayedContracts = filteredContracts.slice(start, end)

  const unsettled = contracts.filter(
    (c) => !c.isResolved && contractsMetrics[c.id].invested !== 0
  )

  const currentInvested = sumBy(
    unsettled,
    (c) => contractsMetrics[c.id].invested
  )
  const currentBetsValue = sumBy(
    unsettled,
    (c) => contractsMetrics[c.id].payout
  )
  const currentLoan = sumBy(unsettled, (c) => contractsMetrics[c.id].loan)

  const investedProfitPercent =
    ((currentBetsValue - currentInvested) / (currentInvested + 0.1)) * 100

  return (
    <Col>
      {loadedPartialData && (
        <Row className="my-4 items-center gap-2 self-start rounded bg-yellow-50 p-4">
          <ExclamationIcon className="h-5 w-5" />
          <div>Partial trade data only</div>
        </Row>
      )}

      <Col className="justify-between gap-4 sm:flex-row">
        <Row className="gap-4">
          <Col>
            <div className="text-greyscale-6 text-xs sm:text-sm">
              Investment value
            </div>
            <div className="text-lg">
              {formatMoney(currentBetsValue)}{' '}
              <ProfitBadge profitPercent={investedProfitPercent} />
            </div>
          </Col>
          <Col>
            <div className="text-greyscale-6 text-xs sm:text-sm">
              Total loans
            </div>
            <div className="text-lg">{formatMoney(currentLoan)}</div>
          </Col>
        </Row>

        <Row className="gap-2">
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as BetFilter)}
          >
            <option value="open">Active</option>
            <option value="limit_bet">Limit orders</option>
            <option value="sold">Sold</option>
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </Select>

          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as BetSort)}
          >
            <option value="newest">Recent</option>
            <option value="value">Value</option>
            <option value="profit">Profit</option>
            <option value="closeTime">Close date</option>
          </Select>
        </Row>
      </Col>

      <Col className="mt-6 divide-y">
        {displayedContracts.length === 0 ? (
          <NoMatchingBets />
        ) : (
          <>
            {displayedContracts.map((contract) => (
              <ContractBets
                key={contract.id}
                contract={contract}
                bets={contractBets[contract.id] ?? []}
                metric={sort === 'profit' ? 'profit' : 'value'}
                isYourBets={isYourBets}
              />
            ))}
            <Pagination
              page={page}
              itemsPerPage={CONTRACTS_PER_PAGE}
              totalItems={filteredContracts.length}
              setPage={setPage}
            />
          </>
        )}
      </Col>
    </Col>
  )
}

const NoBets = ({ user }: { user: User }) => {
  const me = useUser()
  return (
    <div className="mx-4 py-4 text-gray-500">
      {user.id === me?.id ? (
        <>
          You have not made any bets yet.{' '}
          <SiteLink href="/home" className="underline">
            Find a prediction market!
          </SiteLink>
        </>
      ) : (
        <>{user.name} has not made any public bets yet.</>
      )}
    </div>
  )
}
const NoMatchingBets = () => (
  <div className="mx-4 py-4 text-gray-500">
    No bets matching the current filter.
  </div>
)

function ContractBets(props: {
  contract: Contract
  bets: Bet[]
  metric: 'profit' | 'value'
  isYourBets: boolean
}) {
  const { bets, contract, metric, isYourBets } = props
  const { resolution, outcomeType } = contract

  const limitBets = bets.filter(
    (bet) => bet.limitProb !== undefined && !bet.isCancelled && !bet.isFilled
  ) as LimitBet[]
  const resolutionValue = (contract as NumericContract).resolutionValue

  const [collapsed, setCollapsed] = useState(true)

  const isBinary = outcomeType === 'BINARY'

  const { payout, profit, profitPercent } = getContractBetMetrics(
    contract,
    bets
  )
  return (
    <div tabIndex={0} className="relative bg-white p-4 pr-6">
      <Row
        className="cursor-pointer flex-wrap gap-2"
        onClick={() => setCollapsed((collapsed) => !collapsed)}
      >
        <Col className="flex-[2] gap-1">
          <Row className="mr-2 max-w-lg">
            <Link href={contractPath(contract)}>
              <a
                className="font-medium text-indigo-700 hover:underline hover:decoration-indigo-400 hover:decoration-2"
                onClick={(e) => e.stopPropagation()}
              >
                {contract.question}
              </a>
            </Link>

            {/* Show carrot for collapsing. Hack the positioning. */}
            {collapsed ? (
              <ChevronDownIcon className="absolute top-5 right-4 h-6 w-6" />
            ) : (
              <ChevronUpIcon className="absolute top-5 right-4 h-6 w-6" />
            )}
          </Row>

          <Row className="flex-1 items-center gap-2 text-sm text-gray-500">
            {resolution ? (
              <>
                <div>
                  Resolved{' '}
                  <OutcomeLabel
                    outcome={resolution}
                    value={resolutionValue}
                    contract={contract}
                    truncate="short"
                  />
                </div>
                <div>•</div>
              </>
            ) : isBinary ? (
              <>
                <div className="text-primary text-lg">
                  {getBinaryProbPercent(contract)}
                </div>
                <div>•</div>
              </>
            ) : null}
            <UserLink
              name={contract.creatorName}
              username={contract.creatorUsername}
            />
          </Row>
        </Col>

        <Col className="mr-5 sm:mr-8">
          <div className="whitespace-nowrap text-right text-lg">
            {formatMoney(metric === 'profit' ? profit : payout)}
          </div>
          <ProfitBadge className="text-right" profitPercent={profitPercent} />
        </Col>
      </Row>

      {!collapsed && (
        <div className="bg-white">
          <BetsSummary
            className="mt-8 mr-5 flex-1 sm:mr-8"
            contract={contract}
            userBets={bets}
          />

          {contract.mechanism === 'cpmm-1' && limitBets.length > 0 && (
            <div className="max-w-md">
              <div className="mt-4 bg-gray-50 px-4 py-2">Limit orders</div>
              <LimitOrderTable
                contract={contract}
                limitBets={limitBets}
                isYou={isYourBets}
              />
            </div>
          )}

          <div className="mt-4 bg-gray-50 px-4 py-2">Bets</div>
          <ContractBetsTable
            contract={contract}
            bets={bets}
            isYourBets={isYourBets}
          />
        </div>
      )}
    </div>
  )
}

export function ContractBetsTable(props: {
  contract: Contract
  bets: Bet[]
  isYourBets: boolean
}) {
  const { contract, isYourBets } = props

  const bets = sortBy(
    props.bets.filter((b) => !b.isAnte && b.amount !== 0),
    (bet) => bet.createdTime
  ).reverse()

  const [sales, buys] = partition(bets, (bet) => bet.sale)

  const salesDict = Object.fromEntries(
    sales.map((sale) => [sale.sale?.betId ?? '', sale])
  )

  const [redemptions, normalBets] = partition(
    contract.mechanism === 'cpmm-1' ? bets : buys,
    (b) => b.isRedemption
  )
  const amountRedeemed = Math.floor(-0.5 * sumBy(redemptions, (b) => b.shares))

  const amountLoaned = sumBy(
    bets.filter((bet) => !bet.isSold && !bet.sale),
    (bet) => bet.loanAmount ?? 0
  )

  const { isResolved, mechanism, outcomeType } = contract
  const isCPMM = mechanism === 'cpmm-1'
  const isNumeric = outcomeType === 'NUMERIC'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  return (
    <div className="overflow-x-auto">
      {amountRedeemed > 0 && (
        <>
          <div className="pl-2 text-sm text-gray-500">
            {amountRedeemed} {isPseudoNumeric ? 'HIGHER' : 'YES'} shares and{' '}
            {amountRedeemed} {isPseudoNumeric ? 'LOWER' : 'NO'} shares
            automatically redeemed for {formatMoney(amountRedeemed)}.
          </div>
          <Spacer h={4} />
        </>
      )}

      {!isResolved && amountLoaned > 0 && (
        <>
          <div className="pl-2 text-sm text-gray-500">
            You currently have a loan of {formatMoney(amountLoaned)}.
          </div>
          <Spacer h={4} />
        </>
      )}

      <Table>
        <thead>
          <tr className="p-2">
            <th></th>
            {isCPMM && <th>Type</th>}
            <th>Outcome</th>
            <th>Amount</th>
            {!isCPMM && !isNumeric && (
              <th>{isResolved ? <>Payout</> : <>Sale price</>}</th>
            )}
            {!isCPMM && !isResolved && <th>Payout if chosen</th>}
            <th>Shares</th>
            {!isPseudoNumeric && <th>Probability</th>}
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {normalBets.map((bet) => (
            <BetRow
              key={bet.id}
              bet={bet}
              saleBet={salesDict[bet.id]}
              contract={contract}
              isYourBet={isYourBets}
              unfilledBets={unfilledBets}
              balanceByUserId={balanceByUserId}
            />
          ))}
        </tbody>
      </Table>
    </div>
  )
}

function BetRow(props: {
  bet: Bet
  contract: Contract
  saleBet?: Bet
  isYourBet: boolean
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }
}) {
  const { bet, saleBet, contract, isYourBet, unfilledBets, balanceByUserId } =
    props
  const {
    amount,
    outcome,
    createdTime,
    probBefore,
    probAfter,
    shares,
    isSold,
    isAnte,
  } = bet

  const { isResolved, closeTime, mechanism, outcomeType } = contract

  const isClosed = closeTime && Date.now() > closeTime

  const isCPMM = mechanism === 'cpmm-1'
  const isNumeric = outcomeType === 'NUMERIC'
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  // calculateSaleAmount is very slow right now so that's why we memoized this
  const payout = useMemo(() => {
    const saleBetAmount = saleBet?.sale?.amount
    if (saleBetAmount) {
      return saleBetAmount
    } else if (contract.isResolved) {
      return resolvedPayout(contract, bet)
    } else {
      return calculateSaleAmount(contract, bet, unfilledBets, balanceByUserId)
    }
  }, [contract, bet, saleBet, unfilledBets, balanceByUserId])

  const saleDisplay = isAnte ? (
    'ANTE'
  ) : saleBet ? (
    <>{formatMoney(payout)} (sold)</>
  ) : (
    formatMoney(payout)
  )

  const payoutIfChosenDisplay =
    bet.isAnte && outcomeType === 'FREE_RESPONSE' && bet.outcome === '0'
      ? 'N/A'
      : formatMoney(calculatePayout(contract, bet, bet.outcome))

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const ofTotalAmount =
    bet.limitProb === undefined || bet.orderAmount === undefined
      ? ''
      : ` / ${formatMoney(bet.orderAmount)}`

  return (
    <tr>
      <td className="text-gray-700">
        {isYourBet &&
          !isCPMM &&
          !isResolved &&
          !isClosed &&
          !isSold &&
          !isAnte &&
          !isNumeric && (
            <SellButton
              contract={contract}
              bet={bet}
              unfilledBets={unfilledBets}
              balanceByUserId={balanceByUserId}
            />
          )}
      </td>
      {isCPMM && <td>{shares >= 0 ? 'BUY' : 'SELL'}</td>}
      <td>
        {bet.isAnte ? (
          'ANTE'
        ) : (
          <OutcomeLabel
            outcome={outcome}
            value={(bet as any).value}
            contract={contract}
            truncate="short"
          />
        )}
        {isPseudoNumeric &&
          ' than ' + formatNumericProbability(bet.probAfter, contract)}
      </td>
      <td>
        {formatMoney(Math.abs(amount))}
        {ofTotalAmount}
      </td>
      {!isCPMM && !isNumeric && <td>{saleDisplay}</td>}
      {!isCPMM && !isResolved && <td>{payoutIfChosenDisplay}</td>}
      <td>{formatWithCommas(Math.abs(shares))}</td>
      {!isPseudoNumeric && (
        <td>
          {outcomeType === 'FREE_RESPONSE' || hadPoolMatch ? (
            <>
              {formatPercent(probBefore)} → {formatPercent(probAfter)}
            </>
          ) : (
            formatPercent(bet.limitProb ?? 0)
          )}
        </td>
      )}
      <td>{dayjs(createdTime).format('MMM D, h:mma')}</td>
    </tr>
  )
}

function SellButton(props: {
  contract: Contract
  bet: Bet
  unfilledBets: LimitBet[]
  balanceByUserId: { [userId: string]: number }
}) {
  const { contract, bet, unfilledBets, balanceByUserId } = props
  const { outcome, shares, loanAmount } = bet

  const [isSubmitting, setIsSubmitting] = useState(false)

  const initialProb = getOutcomeProbability(
    contract,
    outcome === 'NO' ? 'YES' : outcome
  )

  const outcomeProb = getProbabilityAfterSale(
    contract,
    outcome,
    shares,
    unfilledBets,
    balanceByUserId
  )

  const saleAmount = calculateSaleAmount(
    contract,
    bet,
    unfilledBets,
    balanceByUserId
  )
  const profit = saleAmount - bet.amount

  return (
    <ConfirmationButton
      openModalBtn={{
        label: 'Sell',
        disabled: isSubmitting,
      }}
      submitBtn={{ label: 'Sell', color: 'green' }}
      onSubmit={async () => {
        setIsSubmitting(true)
        await sellBet({ contractId: contract.id, betId: bet.id })
        setIsSubmitting(false)
      }}
    >
      <div className="mb-4 text-xl">
        Sell {formatWithCommas(shares)} shares of{' '}
        <OutcomeLabel outcome={outcome} contract={contract} truncate="long" />{' '}
        for {formatMoney(saleAmount)}?
      </div>
      {!!loanAmount && (
        <div className="mt-2">
          You will also pay back {formatMoney(loanAmount)} of your loan, for a
          net of {formatMoney(saleAmount - loanAmount)}.
        </div>
      )}

      <div className="mt-2 mb-1 text-sm">
        {profit > 0 ? 'Profit' : 'Loss'}: {formatMoney(profit).replace('-', '')}
        <br />
        Market probability: {formatPercent(initialProb)} →{' '}
        {formatPercent(outcomeProb)}
      </div>
    </ConfirmationButton>
  )
}
