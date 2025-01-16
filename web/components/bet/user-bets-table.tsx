'use client'
import { ChevronUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { LimitBet } from 'common/bet'
import { getContractBetNullMetrics } from 'common/calculate'
import { Contract, contractPath, CPMMContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import {
  ENV_CONFIG,
  SWEEPIES_MARKET_TOOLTIP,
  TRADE_TERM,
} from 'common/envs/constants'
import { unauthedApi } from 'common/util/api'
import { buildArray } from 'common/util/array'
import {
  formatMoney,
  formatWithToken,
  maybePluralize,
  shortFormatNumber,
  SWEEPIES_MONIKER,
} from 'common/util/format'
import { searchInAny } from 'common/util/parse'
import { Dictionary, max, sortBy, sum, uniqBy, mapValues } from 'lodash'
import Link from 'next/link'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { BiCaretDown, BiCaretUp } from 'react-icons/bi'
import { BsThreeDotsVertical } from 'react-icons/bs'
import { BetsSummary } from 'web/components/bet/bet-summary'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { OrderTable } from 'web/components/bet/order-book'
import { Button, IconButton } from 'web/components/buttons/button'
import { PillButton } from 'web/components/buttons/pill-button'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { OutcomeLabel } from 'web/components/outcome-label'
import { ProfitBadge } from 'web/components/profit-badge'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Avatar } from 'web/components/widgets/avatar'
import { Carousel } from 'web/components/widgets/carousel'
import { Input } from 'web/components/widgets/input'
import { Pagination } from 'web/components/widgets/pagination'
import { useContractBets } from 'client-common/hooks/use-bets'
import { useEvent } from 'client-common/hooks/use-event'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { User } from 'web/lib/firebase/users'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import DropdownMenu from '../widgets/dropdown-menu'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { SweepsToggle } from '../sweeps/sweeps-toggle'
import { useSweepstakes } from '../sweepstakes-provider'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { linkClass } from '../widgets/site-link'
import { Tooltip } from '../widgets/tooltip'
import { floatingEqual } from 'common/util/math'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
type BetSort =
  | 'newest'
  | 'profit'
  | 'closeTime'
  | 'value'
  | 'day'
  | 'week'
  | 'probChangeDay'
  | 'profitPercent'
  | 'position'

type BetFilter = 'open' | 'limit_bet' | 'sold' | 'closed' | 'resolved' | 'all'

const JUNE_1_2022 = new Date('2022-06-01T00:00:00.000Z').valueOf()
export function UserBetsTable(props: { user: User }) {
  const { user } = props

  const signedInUser = useUser()
  const isAuth = useIsAuthorized()

  const isYou = user.id === signedInUser?.id

  const [metricsByContract, setMetricsByContract] = usePersistentInMemoryState<
    Dictionary<ContractMetric> | undefined
  >(undefined, `user-contract-metrics-${user.id}`)

  const [contracts, setContracts] = usePersistentInMemoryState<
    Contract[] | undefined
  >(undefined, `user-contract-metrics-contracts-${user.id}`)

  const [openLimitBetsByContract, setOpenLimitBetsByContract] =
    usePersistentInMemoryState<Dictionary<LimitBet[]> | undefined>(
      undefined,
      `user-open-limit-bets-${user.id}`
    )

  const getMetrics = useEvent(() =>
    api('get-user-contract-metrics-with-contracts', {
      userId: user.id,
      offset: 0,
      // Hack for Ziddletwix
      limit: user.id === 'Iua2KQvL6KYcfGLGNI6PVeGkseo1' ? 10000 : 5000,
    }).then((res) => {
      const { contracts, metricsByContract } = res
      setMetricsByContract(
        mapValues(metricsByContract, (metrics) => metrics[0])
      )
      setContracts((c) =>
        uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
      )
    })
  )

  useEffect(() => {
    if (isAuth !== undefined) {
      getMetrics()
    }
  }, [getMetrics, user.id, isAuth])

  useEffect(() => {
    unauthedApi('get-user-limit-orders-with-contracts', {
      userId: user.id,
      count: 5000,
    }).then((betsWithContracts) => {
      const { contracts, betsByContract } = betsWithContracts
      setOpenLimitBetsByContract(betsByContract)
      setContracts((c) =>
        uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
      )
    })
  }, [setContracts, setOpenLimitBetsByContract, user.id, isAuth])

  const [filter, setFilter] = usePersistentLocalState<BetFilter>(
    'open',
    'bets-list-filter'
  )

  const { prefersPlay, setPrefersPlay } = useSweepstakes()

  const [page, setPage] = usePersistentInMemoryState(0, 'portfolio-page')

  const [query, setQuery] = usePersistentQueryState('b', '')

  const onSetFilter = (f: BetFilter) => {
    setFilter(f)
    setPage(0)
  }

  const toggleTokenFilter = () => {
    setPrefersPlay(!prefersPlay)
    setPage(0)
  }

  const nullableMetricsByContract = useMemo(() => {
    if (!metricsByContract || !contracts) {
      return undefined
    }
    // check if we have any contracts that don't have contractMetrics, if so, add them in as getContractBetNullMetrics
    const missingContracts = contracts.filter((c) => !metricsByContract[c.id])
    const missingMetrics = Object.fromEntries(
      missingContracts.map((c) => [c.id, getContractBetNullMetrics()])
    )

    return {
      ...metricsByContract,
      ...missingMetrics,
    }
  }, [JSON.stringify(contracts), metricsByContract])

  const queriedContracts = query
    ? contracts?.filter((c) =>
        searchInAny(query, c.question, c.creatorName, c.creatorUsername)
      )
    : contracts

  const FILTERS: Record<BetFilter, (c: Contract) => boolean> = {
    resolved: (c) => !!c.resolutionTime,
    closed: (c) =>
      !FILTERS.resolved(c) && (c.closeTime ?? Infinity) < Date.now(),
    open: (c) => !(FILTERS.closed(c) || FILTERS.resolved(c)),
    all: () => true,
    sold: () => true,
    limit_bet: (c) => FILTERS.open(c),
  }
  const loaded =
    nullableMetricsByContract && openLimitBetsByContract && contracts

  const filteredContracts = loaded
    ? queriedContracts
        ?.filter(FILTERS[filter])
        .filter((c) => {
          if (filter === 'all') return true
          const { totalShares } = nullableMetricsByContract[c.id]
          // The hasShares wasn't properly set for null metrics for a while, so using totalShares instead
          const hasShares = Object.values(totalShares).some(
            (s) => !floatingEqual(s, 0)
          )
          if (filter === 'sold') return !hasShares
          if (filter === 'limit_bet')
            return openLimitBetsByContract[c.id]?.length > 0
          return hasShares
        })
        .filter((c) => {
          if (!prefersPlay) return c.token === 'CASH'
          else return c.token === 'MANA' || !c.token
        })
    : []
  return (
    <Col>
      <div className="flex flex-wrap justify-between gap-4 max-sm:flex-col">
        <Col className="w-full gap-2">
          <Input
            placeholder={isYou ? 'Search your trades' : 'Search trades'}
            className={'w-full min-w-[30px]'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Carousel labelsParentClassName={'gap-1'}>
            <SweepsToggle sweepsEnabled isSmall onClick={toggleTokenFilter} />
            {(
              [
                'all',
                'open',
                'limit_bet',
                'sold',
                'closed',
                'resolved',
              ] as BetFilter[]
            ).map((f) => (
              <PillButton
                key={f}
                selected={filter === f}
                onSelect={() => onSetFilter(f)}
              >
                {f === 'limit_bet'
                  ? 'Limit orders'
                  : f === 'all'
                  ? 'All'
                  : f === 'sold'
                  ? 'Sold'
                  : f === 'closed'
                  ? 'Closed'
                  : f === 'resolved'
                  ? 'Resolved'
                  : 'Open'}
              </PillButton>
            ))}
          </Carousel>
        </Col>
      </div>

      {!loaded ? (
        <Col className="divide-ink-300 mt-6 divide-y">
          <LoadingMetricRow />
          <LoadingMetricRow />
          <LoadingMetricRow />
        </Col>
      ) : Object.keys(nullableMetricsByContract).length === 0 ? (
        <NoBets user={user} />
      ) : (
        <BetsTable
          contracts={filteredContracts as CPMMContract[]}
          metricsByContractId={nullableMetricsByContract}
          openLimitBetsByContract={openLimitBetsByContract}
          page={page}
          user={user}
          setPage={setPage}
          filter={filter}
          signedInUser={signedInUser}
        />
      )}
    </Col>
  )
}

const NoBets = ({ user }: { user: User }) => {
  const me = useUser()
  return (
    <>
      {user.id === me?.id && (
        <Link href="/home" className="text-primary-500 mt-2 hover:underline">
          Find a question to trade on!
        </Link>
      )}
    </>
  )
}
const NoMatchingBets = () => (
  <div className="text-ink-700 py-4 text-center">
    No {TRADE_TERM}s match the current filter
  </div>
)

function BetsTable(props: {
  contracts: CPMMContract[]
  metricsByContractId: { [key: string]: ContractMetric }
  openLimitBetsByContract: { [key: string]: LimitBet[] }
  page: number
  setPage: (page: number) => void
  filter: BetFilter
  user: User
  signedInUser: User | null | undefined
}) {
  const {
    metricsByContractId,
    page,
    setPage,
    filter,
    openLimitBetsByContract,
    user,
    signedInUser,
  } = props
  const areYourBets = user.id === signedInUser?.id
  const [sort, setSort] = usePersistentInMemoryState<{
    field: BetSort
    direction: 'asc' | 'desc'
  }>({ field: 'newest', direction: 'desc' }, 'bets-list-sort')
  const onSetSort = (field: BetSort) => {
    if (sort.field === field) {
      setSort((prevSort) => ({
        ...prevSort,
        direction: prevSort.direction === 'asc' ? 'desc' : 'asc',
      }))
    } else {
      setSort({ field, direction: 'desc' })
    }
    setPage(0)
  }

  type ColumnHeader = {
    sort: BetSort
    label: string
    enabled: boolean
    altSort?: BetSort
    placeholder?: boolean
  }

  const [columns, setColumns] = usePersistentLocalState<ColumnHeader[]>(
    [
      { sort: 'newest', label: 'Time', enabled: true },
      { sort: 'value', label: 'Value', enabled: true },
      { sort: 'position', label: 'Position', enabled: false },
      { sort: 'profit', label: 'Profit', enabled: true },
      { sort: 'day', label: '1d', enabled: true },
      { sort: 'week', label: '1w', enabled: true },
      { sort: 'closeTime', label: 'Close', enabled: true },
    ],
    'user-bet-table-columns'
  )
  const isEnabled = (sort: BetSort) =>
    !isMobile || columns.find((col) => col.sort === sort)?.enabled

  const handleColumnToggle = (sort: BetSort) => {
    setColumns((prevConfigs) =>
      prevConfigs.map((config) =>
        config.sort === sort ? { ...config, enabled: !config.enabled } : config
      )
    )
  }
  const enabledColumnsCount = columns.filter((c) => c.enabled).length
  const [modalOpen, setModalOpen] = useState(false)

  // Most of these are descending sorts by default.
  const SORTS: Record<BetSort, (c: Contract) => number> = {
    position: (c) => -sum(Object.values(metricsByContractId[c.id].totalShares)),
    profit: (c) => -metricsByContractId[c.id].profit,
    profitPercent: (c) => -metricsByContractId[c.id].profitPercent,
    value: (c) =>
      -(
        metricsByContractId[c.id].payout +
        (filter === 'limit_bet'
          ? sum(openLimitBetsByContract[c.id].map((b) => b.orderAmount))
          : 0)
      ),
    newest: (c) =>
      -(
        metricsByContractId[c.id].lastBetTime ??
        max(openLimitBetsByContract[c.id]?.map((b) => b.createdTime)) ??
        0
      ),
    probChangeDay: (c) => {
      if (c.mechanism === 'cpmm-1') {
        return -(c as CPMMContract).probChanges.day
      }
      return 0
    },
    day: (c) => -(metricsByContractId[c.id].from?.day.profit ?? 0),
    week: (c) => -(metricsByContractId[c.id].from?.week.profit ?? 0),
    closeTime: (c) =>
      // This is in fact the intuitive sort direction.
      (filter === 'open' ? -1 : 1) *
      (c.resolutionTime ?? c.closeTime ?? Infinity),
  }
  const contracts =
    sort.direction === 'desc'
      ? sortBy(props.contracts, SORTS[sort.field])
      : sortBy(props.contracts, SORTS[sort.field]).reverse()
  const rowsPerSection = 50
  const currentSlice = page * rowsPerSection
  const isMobile = useIsMobile(600)

  const dataColumns: {
    header: ColumnHeader
    span: number
    renderCell: (c: Contract) => ReactNode
    headerBuddy?: ReactNode
  }[] = buildArray([
    {
      header: columns[0],
      span: isMobile ? 2 : 1,
      renderCell: (c: Contract) => (
        <Row className={'justify-start'}>
          <RelativeTimestamp
            time={metricsByContractId[c.id].lastBetTime}
            shortened
            className="text-ink-500 -ml-1"
          />
        </Row>
      ),
    },
    {
      header: columns[1],
      span: isMobile ? 3 : 2,
      renderCell: (c: Contract) => {
        const maxOutcome = metricsByContractId[c.id].maxSharesOutcome
        const showOutcome = maxOutcome && c.outcomeType === 'BINARY'
        return (
          <Row className={clsx('justify-end gap-1')}>
            {showOutcome && isMobile && (
              <OutcomeLabel
                contract={c}
                outcome={maxOutcome}
                truncate={'short'}
              />
            )}
            <Col className={'sm:min-w-[50px]'}>
              <NumberCell
                num={metricsByContractId[c.id].payout}
                isCashContract={c.token === 'CASH'}
              />
            </Col>
          </Row>
        )
      },
    },

    {
      header: columns[2],
      span: 3,
      renderCell: (c: Contract) => {
        const maxOutcome = metricsByContractId[c.id].maxSharesOutcome
        const showOutcome = maxOutcome && c.outcomeType === 'BINARY'
        return (
          <Row className={clsx('justify-end gap-1')}>
            {showOutcome &&
              ((isMobile && !isEnabled('value')) || !isMobile) && (
                <OutcomeLabel
                  contract={c}
                  outcome={maxOutcome}
                  truncate={'short'}
                />
              )}
            <Col className={'sm:min-w-[50px]'}>
              <NumberCell
                num={sum(Object.values(metricsByContractId[c.id].totalShares))}
                isCashContract={c.token === 'CASH'}
              />
            </Col>
          </Row>
        )
      },
      headerBuddy: isMobile && <div className="-mr-2" />,
    },
    {
      header: { ...columns[3], altSort: 'profitPercent' },
      span: isMobile ? 3 : 2,
      renderCell: (c: Contract) => {
        const cm = metricsByContractId[c.id]
        return (
          <Row className={'justify-end gap-1'}>
            <NumberCell
              num={cm.profit}
              change={true}
              isCashContract={c.token === 'CASH'}
            />
          </Row>
        )
      },
      headerBuddy: (
        <button
          className={'z-10'}
          onClick={() => {
            if (sort.field === 'profitPercent') {
              onSetSort('profit')
            } else {
              onSetSort('profitPercent')
            }
          }}
        >
          <div
            className={
              'text-ink-400 absolute -right-14 top-0 ml-1 hidden sm:inline-block'
            }
          >
            <span
              className={clsx(
                'hover:bg-ink-100 rounded-md border px-1',
                sort.field === 'profit' ? ' text-ink-1000  ' : ''
              )}
            >
              {ENV_CONFIG.moneyMoniker}
            </span>

            <span
              className={clsx(
                'hover:bg-ink-100 rounded-md border px-1',
                sort.field === 'profitPercent'
                  ? ' text-ink-1000 font-semibold '
                  : ''
              )}
            >
              %
            </span>
          </div>
        </button>
      ),
    },
    {
      header: {
        sort: 'profitPercent',
        label: '',
        placeholder: true,
        enabled: true,
      },
      span: 1,
      renderCell: (c: Contract) => {
        const cm = metricsByContractId[c.id]
        return (
          <span className={'flex-inline flex justify-end '}>
            <ProfitBadge
              className={'!px-1'}
              profitPercent={cm.profitPercent}
              round={true}
              grayColor={formatMoney(cm.profit ?? 0) === formatMoney(0)}
            />
          </span>
        )
      },
    },
    {
      header: columns[4],
      span: isMobile ? 3 : 2,
      renderCell: (c: Contract) => (
        <NumberCell
          num={metricsByContractId[c.id].from?.day.profit ?? 0}
          change={true}
          isCashContract={c.token === 'CASH'}
        />
      ),
    },
    {
      header: columns[5],
      span: isMobile ? 3 : 2,
      renderCell: (c: Contract) => (
        <NumberCell
          num={metricsByContractId[c.id].from?.week.profit ?? 0}
          change={true}
          isCashContract={c.token === 'CASH'}
        />
      ),
    },
    {
      header: columns[6],
      span: isMobile ? 3 : 2,
      renderCell: (c: Contract) => {
        const closeTime = c.resolutionTime ?? c.closeTime
        const date = new Date(closeTime ?? Infinity)
        const isThisYear = new Date().getFullYear() === date.getFullYear()
        const dateString = date.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: isThisYear ? undefined : '2-digit',
        })
        return (
          <Row className={'justify-end'}>
            <span className={'text-ink-500'}>
              {closeTime ? dateString : 'N/A'}
            </span>
          </Row>
        )
      },
    },
  ])
  const getColSpan = (i: number) =>
    i === 4
      ? 'col-span-4'
      : i === 3
      ? 'col-span-3'
      : i === 2
      ? 'col-span-2'
      : 'col-span-1'

  const [expandedIds, setExpandedIds] = useState<string[]>([])

  const setNewExpandedId = async (id: string) => {
    setExpandedIds((oldIds) =>
      oldIds.includes(id)
        ? oldIds.filter((oldId) => oldId !== id)
        : [...oldIds, id]
    )
  }

  const MAX_SHOWN_MOBILE = 5
  const columnsToDisplay = dataColumns
    .filter((c) => isEnabled(c.header.sort))
    .slice(0, isMobile ? MAX_SHOWN_MOBILE : 10)

  return (
    <Col className="mb-4 flex-1 gap-4">
      <Col className={'w-full'}>
        <div
          className={clsx(
            'grid-cols-15 bg-canvas-50 sticky z-10 grid w-full py-2 pr-1',
            isMobile ? 'top-12' : 'top-0' // Sets it below sticky user profile header on mobile
          )}
        >
          {columnsToDisplay.map((col) =>
            col.header.placeholder ? (
              <span key={col.header.label} />
            ) : (
              <span
                key={col.header.sort}
                className={clsx(
                  getColSpan(col.span),
                  'relative flex justify-end first:justify-start'
                )}
              >
                <Header
                  onClick={() =>
                    onSetSort(
                      (col.header.altSort && sort.field === col.header.altSort
                        ? col.header.altSort
                        : col.header.sort) as BetSort
                    )
                  }
                  up={
                    sort.field === col.header.sort ||
                    sort.field === col.header.altSort
                      ? sort.direction === 'asc'
                      : undefined
                  }
                >
                  {col.header.label}
                </Header>
                {col.headerBuddy ? col.headerBuddy : null}
              </span>
            )
          )}
          {isMobile && (
            <div className="absolute bottom-1.5 right-0">
              <DropdownMenu
                menuWidth="w-32"
                items={[
                  {
                    name: 'Edit Columns',
                    onClick: () => setModalOpen(true),
                  },
                ]}
                buttonContent={<BsThreeDotsVertical className="h-4" />}
              />
            </div>
          )}
        </div>
        {contracts
          .slice(currentSlice, currentSlice + rowsPerSection)
          .map((contract) => {
            return (
              <Row
                key={contract.id + 'bets-table-row'}
                className={
                  'border-ink-200 hover:bg-canvas-50 cursor-pointer border-b py-2'
                }
              >
                <Col className={'w-full gap-3 sm:gap-2'}>
                  {/* Contract title*/}
                  <Row className={'justify-between'}>
                    <Link
                      href={contractPath(contract)}
                      className={clsx(
                        linkClass,
                        'line-clamp-2 flex items-center pr-2 sm:pr-1'
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="mr-2 inline-flex items-center">
                        <Avatar
                          avatarUrl={contract.creatorAvatarUrl}
                          size={'2xs'}
                          className={''}
                        />
                      </span>
                      <span>
                        {contract.token == 'CASH' && (
                          <span>
                            <Tooltip
                              text={SWEEPIES_MARKET_TOOLTIP}
                              className=" relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
                            >
                              <SweepiesCoin className="absolute inset-0 top-[0.2em]" />
                            </Tooltip>
                          </span>
                        )}
                        {contract.question}
                      </span>
                      <span className={'ml-2 flex min-w-[40px] items-center'}>
                        <ContractStatusLabel
                          className={'font-semibold'}
                          contract={contract}
                        />
                      </span>
                    </Link>
                    <IconButton
                      size={'2xs'}
                      onClick={() => setNewExpandedId(contract.id)}
                    >
                      {expandedIds.includes(contract.id) ? (
                        <ChevronUpIcon className="h-4" />
                      ) : (
                        <ChevronUpIcon className="h-4 rotate-180" />
                      )}
                    </IconButton>
                  </Row>

                  {/* Contract Metrics details*/}
                  <div
                    className={'grid-cols-15 grid w-full'}
                    onClick={() => setNewExpandedId(contract.id)}
                  >
                    {columnsToDisplay.map((c) => (
                      <div
                        className={clsx(getColSpan(c.span))}
                        key={c.header.sort + contract.id + 'row'}
                      >
                        {c.renderCell(contract)}
                      </div>
                    ))}
                  </div>
                  <Col className={'-mt-2 w-full'}>
                    {expandedIds.includes(contract.id) && (
                      <ExpandedBetRow
                        contract={contract}
                        user={user}
                        signedInUser={signedInUser}
                        contractMetric={metricsByContractId[contract.id]}
                        areYourBets={areYourBets}
                      />
                    )}
                  </Col>
                </Col>
              </Row>
            )
          })}
      </Col>

      <Pagination
        page={page}
        pageSize={rowsPerSection}
        totalItems={contracts.length}
        setPage={setPage}
      />
      <Modal setOpen={setModalOpen} open={modalOpen}>
        <div className={MODAL_CLASS}>
          <span className="mb-4 text-lg font-bold">
            {enabledColumnsCount >= MAX_SHOWN_MOBILE
              ? `Unselect ${
                  MAX_SHOWN_MOBILE + 1 - enabledColumnsCount
                } column to select another`
              : `Select ${
                  MAX_SHOWN_MOBILE - enabledColumnsCount
                } more ${maybePluralize(
                  'column',
                  MAX_SHOWN_MOBILE - enabledColumnsCount
                )} (max 5)`}
          </span>
          {columns.map((col) => (
            <div key={col.sort}>
              <div className="mb-2 flex items-center">
                <input
                  type="checkbox"
                  disabled={
                    !col.enabled &&
                    columns.filter((c) => c.enabled).length >= MAX_SHOWN_MOBILE
                  }
                  checked={col.enabled}
                  onChange={() => handleColumnToggle(col.sort)}
                />
                <label className="ml-2">{col.label}</label>
              </div>
            </div>
          ))}
          <Button onClick={() => setModalOpen(false)}>Done</Button>
        </div>
      </Modal>
    </Col>
  )
}

const ExpandedBetRow = (props: {
  contract: Contract
  user: User
  signedInUser: User | null | undefined
  contractMetric: ContractMetric
  areYourBets: boolean
}) => {
  const { contract, user, signedInUser, contractMetric, areYourBets } = props
  const hideBetsBefore = areYourBets ? 0 : JUNE_1_2022
  const bets = useContractBets(
    contract.id,
    {
      userId: user.id,
      afterTime: hideBetsBefore,
    },
    useIsPageVisible,
    (params) => api('bets', params)
  )
  const limitBets = bets?.filter(
    (bet) => bet.limitProb !== undefined && !bet.isCancelled && !bet.isFilled
  ) as LimitBet[]

  const includeSellButtonForUser =
    areYourBets &&
    !contract.isResolved &&
    (contract.closeTime ?? 0) > Date.now() &&
    contract.mechanism === 'cpmm-1'
      ? signedInUser
      : undefined
  if (bets === undefined) {
    return (
      <Col className={'w-full items-center justify-center'}>
        <LoadingIndicator />
      </Col>
    )
  }
  return (
    <Col className={'mt-1 w-full gap-1'}>
      <BetsSummary
        className="!mb-6 mt-6 flex"
        contract={contract}
        metrics={contractMetric}
        hideTweet
        includeSellButton={includeSellButtonForUser}
        hideProfit={true}
        hideValue={true}
        areYourBets={areYourBets}
      />
      {contract.mechanism === 'cpmm-1' && limitBets.length > 0 && (
        <div className="max-w-md">
          <div className="bg-canvas-50 mt-4 p-2">Limit orders</div>
          <OrderTable
            contract={contract}
            limitBets={limitBets}
            isYou={areYourBets}
          />
        </div>
      )}
      <ContractBetsTable
        key={contract.id + 'bets-table'}
        contract={contract}
        bets={bets}
        isYourBets={areYourBets}
        contractMetric={contractMetric}
        paginate
      />
    </Col>
  )
}

const NumberCell = (props: {
  num: number
  change?: boolean
  isCashContract: boolean
}) => {
  const { num, change, isCashContract } = props
  const formattedNum =
    num < 1000 && num > -1000
      ? formatWithToken({ amount: num, token: isCashContract ? 'CASH' : 'M$' })
      : isCashContract
      ? SWEEPIES_MONIKER + shortFormatNumber(num)
      : ENV_CONFIG.moneyMoniker + shortFormatNumber(num)
  return (
    <Row className="items-start justify-end ">
      {change &&
      formattedNum !==
        formatWithToken({
          amount: 0,
          token: isCashContract ? 'CASH' : 'M$',
        }) ? (
        num > 0 ? (
          <span className="text-teal-500">{formattedNum}</span>
        ) : (
          <span className="text-scarlet-500">{formattedNum}</span>
        )
      ) : (
        <span>{formattedNum}</span>
      )}
    </Row>
  )
}

const Header = (props: {
  children: ReactNode
  onClick?: () => void
  up?: boolean
  className?: string
}) => {
  const { onClick, up, className, children } = props
  return (
    <Row className={clsx(className, 'cursor-pointer')} onClick={onClick}>
      {up != undefined ? (
        up ? (
          <BiCaretUp className=" h-4" />
        ) : (
          <BiCaretDown className="mt-1.5 h-4" />
        )
      ) : (
        <Col className={'items-center justify-center'}>
          <BiCaretUp className="text-ink-300 -mb-2 h-4" />
          <BiCaretDown className="text-ink-300 h-4" />
        </Col>
      )}
      <span>{children}</span>
    </Row>
  )
}

function LoadingMetricRow() {
  return (
    <div className="animate-pulse py-4">
      <Row className="mb-2 items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-200 sm:w-96" />
      </Row>

      <Row className="mt-2 justify-between gap-4">
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="h-4 w-16 rounded bg-gray-200" />
      </Row>
    </div>
  )
}
