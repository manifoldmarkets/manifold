'use client'
import { useState, useMemo, useEffect } from 'react'
import clsx from 'clsx'
import { groupBy, maxBy, sortBy, uniqBy } from 'lodash'
import { BiCaretDown, BiCaretUp, BiRefresh } from 'react-icons/bi'
import { contractPath, MarketContract } from 'common/contract'
import { LimitBet } from 'common/bet'
import { formatPercent } from 'common/util/format'
import Link from 'next/link'
import { Col } from '../layout/col'
import { Button, IconButton } from '../buttons/button'
import { Avatar } from '../widgets/avatar'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Tooltip } from '../widgets/tooltip'
import { api } from 'web/lib/api/api'
import { User } from 'web/lib/firebase/users'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { OrderTable } from './order-book'
import { OutcomeLabel } from '../outcome-label'
import { RelativeTimestamp } from '../relative-timestamp'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { BetFilter, LoadingMetricRow } from './user-bets-table'
import LimitOrderPanel from './limit-order-panel'
import {
  listenToUserOrders,
  useUnfilledBetsAndBalanceByUserId,
} from 'client-common/hooks/use-bets'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { Row } from '../layout/row'
import { PencilIcon } from '@heroicons/react/solid'
import { useLiveContract } from 'web/hooks/use-contract'
import { getContracts } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { ContractStatusLabel } from '../contract/contracts-table'
import { linkClass } from '../widgets/site-link'

type LimitOrderSort =
  | 'createTime'
  | 'expiryTime'
  | 'updateTime'
  | 'remainingAmount'
  | 'priceDiff'

// Removed DismissedOrder type since we're removing dismiss functionality
type DetailedBet = LimitBet & {
  contract: MarketContract
  remainingAmount: number
  priceDiff: number
  timeToExpiry: number
  isExpired: boolean
}
// Function to toggle expired filter - will be exported to allow parent to use it
export function LimitOrdersTable(props: {
  query: string | undefined
  user: User
  isYourBets: boolean
  includeExpired: boolean
  includeFilled: boolean
  includeCancelled: boolean
  filter: BetFilter
  className?: string
}) {
  const {
    user,
    isYourBets,
    className,
    query,
    includeExpired,
    includeFilled,
    includeCancelled,
    filter,
  } = props

  const { data, loading } = useAPIGetter(
    'get-user-limit-orders-with-contracts',
    {
      userId: user.id,
      count: 5000,
      includeExpired,
      includeFilled,
      includeCancelled,
    }
  )
  const [limitUpdates, setLimitUpdates] = useState<LimitBet[]>([])
  listenToUserOrders(user.id, setLimitUpdates, true)
  const allLimitBets = uniqBy([...limitUpdates, ...(data?.bets ?? [])], 'id')
  const [missingContracts, setMissingContracts] = useState<MarketContract[]>([])
  const contracts = [...(data?.contracts ?? []), ...missingContracts]
  useEffect(() => {
    const missingContractIds = limitUpdates
      .map((b) => b.contractId)
      .filter((id) => !contracts.find((c) => c.id === id))
    if (missingContractIds.length > 0) {
      getContracts(db, missingContractIds).then((c) =>
        setMissingContracts(c as MarketContract[])
      )
    }
  }, [limitUpdates, data?.contracts])

  const FILTERS: Record<BetFilter, (b: DetailedBet) => boolean> = {
    resolved: (b) =>
      !!b.contract.resolutionTime ||
      !!(
        b.contract.mechanism === 'cpmm-multi-1' &&
        b.contract.answers.find((a) => a.id === b.answerId)?.resolutionTime
      ),
    closed: (b) =>
      !FILTERS.resolved(b) && (b.contract.closeTime ?? Infinity) < Date.now(),
    open: (c) => !(FILTERS.closed(c) || FILTERS.resolved(c)),
    all: () => true,
    sold: () => true,
    limit_bet: () => true,
  }

  // Removed dismissedOrders state and cleanup logic

  // Sorting state
  const [sort, setSort] = usePersistentInMemoryState<{
    field: LimitOrderSort
    direction: 'asc' | 'desc'
  }>({ field: 'createTime', direction: 'asc' }, 'limit-orders-sort')

  const onSetSort = (field: LimitOrderSort) => {
    if (sort.field === field) {
      setSort((prevSort) => ({
        ...prevSort,
        direction: prevSort.direction === 'asc' ? 'desc' : 'asc',
      }))
    } else {
      setSort({ field, direction: 'asc' })
    }
  }

  const currentProb = (bet: LimitBet & { contract: MarketContract }) => {
    const contract = bet.contract
    if (contract.mechanism === 'cpmm-1') {
      return contract.prob
    } else if (bet.answerId && 'answers' in contract) {
      const answer = contract.answers.find((a) => a.id === bet.answerId)
      return answer?.prob ?? 0
    }
    return 0
  }

  // Group bets by contract
  const betsByContract = useMemo(() => {
    return groupBy(allLimitBets, 'contractId')
  }, [allLimitBets])

  // Create map of contracts by id for easier lookup
  const contractsById = useMemo(() => {
    return Object.fromEntries(contracts.map((c) => [c.id, c]))
  }, [contracts])

  // Calculate remaining amount for each bet
  const betWithDetails = useMemo(() => {
    return allLimitBets
      .map((bet) => {
        const contract = contractsById[bet.contractId]
        if (!contract) return null

        // Calculate remaining amount
        const filledAmount = bet.fills.reduce(
          (sum, fill) => sum + fill.amount,
          0
        )
        const remainingAmount = bet.orderAmount - filledAmount

        const prob = currentProb({ ...bet, contract })
        const priceDiff = prob - bet.limitProb

        // Calculate time to expiry
        const expiryTime = bet.expiresAt ?? Infinity
        const timeToExpiry = expiryTime - Date.now()

        return {
          ...bet,
          contract,
          remainingAmount,
          priceDiff,
          timeToExpiry,
          isExpired: timeToExpiry <= 0 && isFinite(timeToExpiry),
        }
      })
      .filter(Boolean) as DetailedBet[]
  }, [allLimitBets, contractsById])

  const lastFillTime = (bet: LimitBet) => {
    return maxBy(bet.fills, 'timestamp')?.timestamp
  }

  // Filter bets by search query and expired status
  const filteredByQueryAndExpiredBets = useMemo(() => {
    let filtered = betWithDetails.filter((b) => FILTERS[filter](b))

    // Filter by search query
    if (query) {
      const lowerQuery = query.toLowerCase().trim()
      filtered = filtered.filter((bet) => {
        const contract = bet.contract
        // Search in contract question
        if (contract.question.toLowerCase().includes(lowerQuery)) return true
        // Search in creator name/username
        if (contract.creatorName?.toLowerCase().includes(lowerQuery))
          return true
        if (contract.creatorUsername?.toLowerCase().includes(lowerQuery))
          return true
        // Search in outcome/answer
        // Search in answer text for multiple choice
        if (bet.answerId && 'answers' in contract) {
          const answer = contract.answers.find((a) => a.id === bet.answerId)
          if (answer?.text.toLowerCase().includes(lowerQuery)) return true
        }
        return false
      })
    }

    return filtered
  }, [betWithDetails, query, filter])

  // Apply sorting
  const sortedBets = useMemo(() => {
    const sortFn = (bet: DetailedBet) => {
      switch (sort.field) {
        case 'createTime':
          return -bet.createdTime
        case 'expiryTime':
          return bet.expiresAt ?? Infinity
        case 'updateTime':
          return lastFillTime(bet) ? -lastFillTime(bet)! : Infinity
        case 'remainingAmount':
          return bet.remainingAmount
        case 'priceDiff':
          return bet.priceDiff
        default:
          return bet.createdTime
      }
    }

    return sort.direction === 'desc'
      ? sortBy(filteredByQueryAndExpiredBets, sortFn).reverse()
      : sortBy(filteredByQueryAndExpiredBets, sortFn)
  }, [filteredByQueryAndExpiredBets, sort, lastFillTime])
  const [showLimitModal, setShowLimitModal] = useState<LimitBet | null>(null)
  const [contractModalId, setContractModalId] = useState<string | null>(null)
  const openContractModal = (contractId: string) =>
    setContractModalId(contractId)
  const closeContractModal = () => setContractModalId(null)
  if (loading) {
    return (
      <Col className="divide-ink-300 mt-6 divide-y">
        <LoadingMetricRow />
        <LoadingMetricRow />
        <LoadingMetricRow />
      </Col>
    )
  }
  if (betWithDetails.length === 0) {
    return (
      <Col className={clsx(className, 'items-center justify-center p-4')}>
        <p className="text-ink-800">No limit orders found</p>
      </Col>
    )
  }

  if (filteredByQueryAndExpiredBets.length === 0) {
    return (
      <Col className={clsx(className, 'items-center justify-center p-4')}>
        <p className="text-ink-800">No limit orders match your criteria</p>
      </Col>
    )
  }

  return (
    <Col className={clsx(className, 'w-full')}>
      <div className="bg-canvas-0 grid-cols-16 sticky top-10 z-10 mb-1 grid gap-2 text-sm font-semibold sm:top-0">
        <div className="col-span-3">Price</div>
        <div
          className="col-span-2 mr-1 flex cursor-pointer items-center justify-end sm:mr-0 "
          onClick={() => onSetSort('createTime')}
        >
          Created
          {sort.field === 'createTime' &&
            (sort.direction === 'asc' ? <BiCaretUp /> : <BiCaretDown />)}
        </div>
        <div
          className="col-span-2 flex cursor-pointer items-center justify-end"
          onClick={() => onSetSort('expiryTime')}
        >
          Expires
          {sort.field === 'expiryTime' &&
            (sort.direction === 'asc' ? <BiCaretUp /> : <BiCaretDown />)}
        </div>
        <div
          className="col-span-2 flex cursor-pointer items-center justify-end"
          onClick={() => onSetSort('updateTime')}
        >
          Fill
          {sort.field === 'updateTime' &&
            (sort.direction === 'asc' ? <BiCaretUp /> : <BiCaretDown />)}
        </div>
        <div
          className="col-span-4 flex cursor-pointer items-center justify-end sm:col-span-2"
          onClick={() => onSetSort('remainingAmount')}
        >
          Remaining
          {sort.field === 'remainingAmount' &&
            (sort.direction === 'asc' ? <BiCaretUp /> : <BiCaretDown />)}
        </div>
        <div
          className="col-span-2 hidden cursor-pointer items-center justify-end sm:flex"
          onClick={() => onSetSort('priceDiff')}
        >
          Price ∆
          {sort.field === 'priceDiff' &&
            (sort.direction === 'asc' ? <BiCaretUp /> : <BiCaretDown />)}
        </div>
        <div className="col-span-3 flex justify-end sm:col-span-2"></div>
      </div>

      {sortedBets.map((bet) => {
        const contract = bet.contract
        const isOpen =
          !contract.isResolved && (contract.closeTime ?? Infinity) > Date.now()
        const isFilledOrCancelled = bet.isFilled || bet.isCancelled
        const isExpired = bet.isExpired

        return (
          <Col key={bet.id} className="border-ink-200 border-b pb-2 pt-3">
            {/* Contract title*/}
            <Row
              className={clsx(
                'justify-between',
                (isFilledOrCancelled || isExpired) && 'bg-canvas-50'
              )}
            >
              <Link
                href={contractPath(contract)}
                className={clsx(
                  linkClass,
                  'line-clamp-2 flex items-center pr-2 sm:pr-1'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <span className={'flex min-w-[40px] justify-start'}>
                  <ContractStatusLabel
                    className={'!text-ink-600 whitespace-nowrap font-semibold'}
                    contract={contract}
                  />
                </span>
                <span className="mr-2 inline-flex items-center">
                  <Avatar
                    avatarUrl={contract.creatorAvatarUrl}
                    size={'2xs'}
                    className={''}
                  />
                </span>
                <span className="text-ink-600 line-clamp-1">
                  {contract.token == 'CASH' && (
                    <SweepiesCoin className="absolute inset-0 top-[0.2em]" />
                  )}
                  {contract.question}
                </span>
              </Link>
            </Row>
            <div
              className={clsx(
                ' grid-cols-16 grid items-center gap-2 pt-2',
                (isFilledOrCancelled || isExpired) && 'bg-canvas-50'
              )}
            >
              <Col className="col-span-3 min-w-0 gap-1 ">
                <div className=" text-ink-800 text-sm sm:text-base">
                  {formatPercent(bet.limitProb)}{' '}
                  <OutcomeLabel
                    contract={contract}
                    outcome={bet.outcome}
                    truncate="short"
                    answer={
                      'answers' in contract
                        ? contract.answers.find((a) => a.id === bet.answerId)
                        : undefined
                    }
                  />
                </div>
              </Col>

              <div className="col-span-2 text-right">
                <Tooltip text={new Date(bet.createdTime).toLocaleString()}>
                  <span>
                    {RelativeTimestamp({
                      time: bet.createdTime,
                      shortened: true,
                      useUseClient: false,
                      className: 'text-ink-500',
                    })}
                  </span>
                </Tooltip>
              </div>

              <div className="col-span-2 text-right ">
                {bet.expiresAt ? (
                  <Tooltip text={new Date(bet.expiresAt).toLocaleString()}>
                    <span>
                      {bet.timeToExpiry <= 0
                        ? 'Expired'
                        : RelativeTimestamp({
                            time: bet.expiresAt,
                            shortened: true,
                            useUseClient: false,
                            className: 'text-ink-800',
                          })}
                    </span>
                  </Tooltip>
                ) : (
                  <span className="text-ink-800">-</span>
                )}
              </div>
              <div className="col-span-2 text-right">
                {lastFillTime(bet) ? (
                  <Tooltip text={new Date(lastFillTime(bet)!).toLocaleString()}>
                    <span>
                      {RelativeTimestamp({
                        time: lastFillTime(bet)!,
                        shortened: true,
                        useUseClient: false,
                        className: 'text-ink-800',
                      })}
                    </span>
                  </Tooltip>
                ) : (
                  <span className="text-ink-800">-</span>
                )}
              </div>

              <div className="text-ink-800 col-span-4 text-right sm:col-span-2">
                <div
                  className={clsx(
                    isFilledOrCancelled && 'text-ink-600',
                    bet.isCancelled && 'line-through'
                  )}
                >
                  {Math.floor(bet.remainingAmount)}/
                  {Math.floor(bet.orderAmount)}
                </div>
                {/* {isFilledOrCancelled && (
                  <div className="text-ink-800 text-xs">
                    {bet.isFilled ? 'Filled' : 'Cancelled'}
                  </div>
                )} */}
              </div>

              <div className="col-span-2 hidden text-right sm:block">
                <div
                  className={clsx(
                    'text-sm',
                    // For YES bets, profit when price goes up; for NO bets, profit when price goes down
                    (bet.outcome === 'YES' && bet.priceDiff > 0) ||
                      (bet.outcome === 'NO' && bet.priceDiff < 0)
                      ? 'text-teal-500'
                      : (bet.outcome === 'YES' && bet.priceDiff < 0) ||
                        (bet.outcome === 'NO' && bet.priceDiff > 0)
                      ? 'text-scarlet-500'
                      : 'text-ink-800'
                  )}
                >
                  {bet.priceDiff > 0 ? '+' : ''}
                  {Math.round(bet.priceDiff * 100)}
                </div>
              </div>

              <div className="col-span-3 flex justify-end sm:col-span-2 sm:gap-1">
                {isYourBets && (isFilledOrCancelled || isExpired) && isOpen && (
                  <IconButton size="2xs" onClick={() => setShowLimitModal(bet)}>
                    <Tooltip text="Reload order with same parameters">
                      <BiRefresh className="h-4 w-4" />
                    </Tooltip>
                  </IconButton>
                )}

                <IconButton
                  size="2xs"
                  onClick={() => openContractModal(contract.id)}
                >
                  <Tooltip text="Edit orders for this market">
                    <span className="text-xs">
                      <PencilIcon className="h-4 w-4" />
                    </span>
                  </Tooltip>
                </IconButton>
              </div>
              {showLimitModal?.id === bet.id && (
                <RefreshLimitOrderModal
                  bet={showLimitModal}
                  contract={contract}
                  user={user}
                  onClose={() => setShowLimitModal(null)}
                />
              )}
            </div>
          </Col>
        )
      })}

      {contractModalId && (
        <Modal open={!!contractModalId} setOpen={closeContractModal}>
          <div className={MODAL_CLASS}>
            <h3 className="mb-4 text-lg font-bold">All orders</h3>
            {contractModalId && contractsById[contractModalId] && (
              <OrderTable
                contract={contractsById[contractModalId]}
                limitBets={betsByContract[contractModalId] || []}
                isYou={isYourBets}
              />
            )}
            <Button className="mt-4" onClick={closeContractModal}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </Col>
  )
}

const RefreshLimitOrderModal = (props: {
  bet: LimitBet
  contract: MarketContract
  user: User
  onClose: () => void
}) => {
  const { bet, user, onClose } = props
  const { limitProb } = bet
  const contract = useLiveContract(props.contract)
  const answerId = bet.answerId
  const prob =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.answers.find((a) => a.id === answerId)?.prob ?? 0
      : contract.prob
  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(
      contract.id,
      (params) => api('bets', params),
      (params) => api('users/by-id/balance', params),
      useIsPageVisible
    )

  const unfilledBetsMatchingAnswer = allUnfilledBets.filter(
    (b) => b.answerId === answerId
  )

  return (
    <Modal open={true} setOpen={onClose}>
      <div className={MODAL_CLASS}>
        <Row className="mb-2 items-baseline justify-between gap-2 text-lg">
          <div className="">{contract.question}</div>
          <div className="font-bold">{formatPercent(prob)}</div>
        </Row>
        <LimitOrderPanel
          initialProb={limitProb}
          multiProps={
            contract.mechanism === 'cpmm-multi-1'
              ? {
                  answers: contract.answers,
                  answerToBuy: contract.answers.find((a) => a.id === answerId)!,
                }
              : undefined
          }
          contract={contract}
          user={user}
          unfilledBets={unfilledBetsMatchingAnswer}
          balanceByUserId={balanceByUserId}
          betAmount={bet.orderAmount}
          outcome={bet.outcome as 'YES' | 'NO'}
        />
      </div>
    </Modal>
  )
}

// A small component to toggle limit order view in UserBetsTable
export function LimitOrdersToggle(props: {
  showLimitOrders: boolean
  setShowLimitOrders: (show: boolean) => void
}) {
  const { showLimitOrders, setShowLimitOrders } = props

  return (
    <Col>
      <ChoicesToggleGroup
        currentChoice={showLimitOrders ? 'Orders' : 'Bets'}
        choicesMap={{
          Bets: 'Bets',
          Orders: 'Orders',
        }}
        setChoice={(choice) => setShowLimitOrders(choice === 'Orders')}
      />
    </Col>
  )
}
