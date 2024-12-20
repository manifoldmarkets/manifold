import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { ArrowUpIcon } from '@heroicons/react/solid'
import { User } from 'common/user'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { ContractMetric } from 'common/contract-metric'
import { ContractToken, CPMMContract, MarketContract } from 'common/contract'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { keyBy, partition, sortBy } from 'lodash'
import { ContractMention } from 'web/components/contract/contract-mention'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { Pagination } from 'web/components/widgets/pagination'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { Table } from '../widgets/table'
import { TRADE_TERM } from 'common/envs/constants'
import { api } from 'web/lib/api/api'
import { APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { CoinNumber } from '../widgets/coin-number'

const DAILY_PROFIT_CLICK_EVENT = 'click daily profit button'

export const DailyProfit = function DailyProfit(props: {
  user: User | null | undefined
  isCurrentUser?: boolean
}) {
  const { user } = props
  const [data, setData] = usePersistentInMemoryState<
    APIResponse<'get-daily-changed-metrics-and-contracts'> | undefined
  >(undefined, 'daily-profit-' + user?.id)

  useEffect(() => {
    if (!user) return
    api('get-daily-changed-metrics-and-contracts', {
      limit: 24,
      userId: user.id,
    }).then(setData)
  }, [user?.id])

  const manaProfit = data?.manaProfit ?? 0
  const cashProfit = data?.cashProfit ?? 0
  const manaInvestmentValue = data?.manaInvestmentValue ?? 0
  const cashInvestmentValue = data?.cashInvestmentValue ?? 0
  const manaNetWorth = manaInvestmentValue + (user?.balance ?? 0)
  const cashNetWorth = cashInvestmentValue + (user?.cashBalance ?? 0)

  const [openMana, setOpenMana] = useState(false)
  const [openCash, setOpenCash] = useState(false)
  useEffect(() => {
    if ((openMana || openCash) && !data && user) {
      api('get-daily-changed-metrics-and-contracts', {
        limit: 24,
        userId: user.id,
      }).then(setData)
    }
  }, [user?.id, openMana, openCash])

  return (
    <>
      <div className={clsx(dailyStatsClass)}>
        <Row className="gap-2">
          <button
            onClick={withTracking(() => {
              setOpenMana(true)
            }, DAILY_PROFIT_CLICK_EVENT)}
          >
            <Row>
              <CoinNumber
                amount={data ? manaNetWorth : undefined}
                numberType="short"
                isInline
              />

              {manaProfit !== 0 && (
                <span
                  className={clsx(
                    'ml-1 mt-1 text-xs',
                    manaProfit >= 0 ? 'text-teal-600' : 'text-scarlet-600'
                  )}
                >
                  {manaProfit >= 0 ? '+' : '-'}
                  {shortFormatNumber(Math.abs(manaProfit))}
                </span>
              )}
            </Row>
          </button>
          <button
            onClick={withTracking(() => {
              setOpenCash(true)
            }, DAILY_PROFIT_CLICK_EVENT)}
          >
            <Row>
              <CoinNumber
                amount={data ? cashNetWorth : undefined}
                numberType="short"
                coinType="sweepies"
                isInline
              />

              {cashProfit !== 0 && (
                <span
                  className={clsx(
                    'ml-1 mt-1 text-xs',
                    cashProfit >= 0 ? 'text-teal-600' : 'text-scarlet-600'
                  )}
                >
                  {cashProfit >= 0 ? '+' : '-'}
                  {shortFormatNumber(Math.abs(cashProfit))}
                </span>
              )}
            </Row>
          </button>
        </Row>
        <div className="text-ink-600 text-center text-xs ">Net worth</div>
      </div>

      <DailyProfitModal
        setOpen={setOpenMana}
        open={openMana}
        metrics={data?.manaMetrics}
        contracts={data?.contracts}
        dailyProfit={manaProfit}
        netWorth={manaNetWorth}
        token="MANA"
      />

      <DailyProfitModal
        setOpen={setOpenCash}
        open={openCash}
        metrics={data?.cashMetrics}
        contracts={data?.contracts}
        dailyProfit={cashProfit}
        netWorth={cashNetWorth}
        token="CASH"
      />
    </>
  )
}

export function DailyProfitModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  metrics?: ContractMetric[]
  contracts?: MarketContract[]
  dailyProfit: number
  netWorth: number
  token: ContractToken
}) {
  const { open, setOpen, metrics, contracts, dailyProfit, netWorth, token } =
    props

  return (
    <Modal open={open} setOpen={setOpen} className={MODAL_CLASS} size={'lg'}>
      <Row className={'mx-2 justify-between'}>
        <Col>
          <span className={'ml-1'}>Your net worth</span>
          <span className={'mb-1 text-2xl'}>
            {formatMoney(netWorth, token)}
          </span>
        </Col>
        <Col>
          <span className={'ml-1'}>Profit today</span>
          <span
            className={clsx(
              'mb-1 inline-flex items-center text-2xl',
              dailyProfit >= 0 ? 'text-teal-600' : 'text-ink-600'
            )}
          >
            {dailyProfit > 0 ? (
              <ArrowUpIcon className={'mr-1 h-4 w-4'} />
            ) : (
              <ArrowUpIcon className={'mr-1 h-4 w-4 rotate-180 transform'} />
            )}
            {formatMoney(dailyProfit, token)}
          </span>
        </Col>
      </Row>

      {!metrics || !contracts ? (
        <LoadingProfitRows />
      ) : (
        <ProfitChangeTable
          contracts={contracts}
          metrics={metrics}
          from={'day'}
          rowsPerSection={5}
          showPagination={true}
          token={token}
        />
      )}
    </Modal>
  )
}
function LoadingProfitRows() {
  return (
    <Col className=" w-full gap-2">
      <LoadingProfitRow />
      <LoadingProfitRow />
      <LoadingProfitRow />
      <LoadingProfitRow />
      <LoadingProfitRow />
    </Col>
  )
}

function LoadingProfitRow() {
  // You can add any UI inside Loading, including a Skeleton.
  return (
    <div className="border-ink-200 flex w-full animate-pulse border-b p-2 last:border-none sm:rounded-md sm:border-none">
      <Row className="w-full  justify-between gap-1 sm:gap-4">
        <Row className={clsx('sm:w-[calc(100%-12rem] w-full gap-2 sm:gap-4')}>
          <div className="h-5 w-2/3 rounded-full bg-gray-500" />
        </Row>
        <div className="">
          <div className="h-5 w-12 rounded-full bg-gray-500" />
        </div>
      </Row>
    </div>
  )
}

export function ProfitChangeTable(props: {
  contracts: MarketContract[]
  metrics: ContractMetric[]
  from: 'day' | 'week' | 'month'
  rowsPerSection: number
  showPagination: boolean
  token: ContractToken
}) {
  const { metrics, from, rowsPerSection, showPagination, token } = props
  const [page, setPage] = useState(0)
  const currentSlice = page * rowsPerSection

  const metricsByContractId = keyBy(metrics, (m) => m.contractId)
  const [nonZeroProfitMetrics, _] = partition(
    metrics,
    (m) => Math.floor(Math.abs(m.from?.[from].profit ?? 0)) !== 0
  )
  const contracts = props.contracts.filter((c) =>
    nonZeroProfitMetrics.some((m) => m.contractId === c.id)
  )
  const [positive, negative] = partition(
    contracts,
    (c) => (metricsByContractId[c.id].from?.[from].profit ?? 0) > 0
  )
  const rows = [
    ...sortBy(
      positive,
      (c) => -(metricsByContractId[c.id].from?.[from].profit ?? 0)
    )
      .map((c) => [c, metricsByContractId[c.id].from?.[from].profit ?? 0])
      .slice(currentSlice, currentSlice + rowsPerSection),
    ...sortBy(
      negative,
      (c) => metricsByContractId[c.id].from?.[from].profit ?? 0
    )
      .map((c) => [c, metricsByContractId[c.id].from?.[from].profit ?? 0])
      .slice(currentSlice, currentSlice + rowsPerSection),
  ] as [CPMMContract, number][]

  if (positive.length === 0 && negative.length === 0)
    return (
      <div className="text-ink-500 px-4">
        No profit changes found. Return later after making a few {TRADE_TERM}s.
      </div>
    )

  return (
    <Col className="mb-4 flex-1 gap-4">
      <Table>
        <thead>
          <tr>
            <th>Question</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([contract, profit]) => (
            <tr key={contract.id + 'mention'}>
              <MarketCell contract={contract} from={from} />
              <ProfitCell profit={profit} token={token} />
            </tr>
          ))}
        </tbody>
      </Table>
      {showPagination && (
        <Pagination
          page={page}
          pageSize={rowsPerSection * 2}
          totalItems={contracts.length}
          setPage={setPage}
        />
      )}
    </Col>
  )
}

const MarketCell = (props: {
  contract: CPMMContract
  from: 'day' | 'week' | 'month'
}) => {
  const c = props.contract
  let change: undefined | string
  if (c.probChanges?.[props.from]) {
    const probChange = c.probChanges[props.from]
    change =
      (probChange > 0 ? '+' : '') +
      getFormattedMappedValue(c, probChange).replace('%', '')
  }

  return (
    <td>
      <ContractMention
        contract={c}
        probChange={change}
        className={'line-clamp-6 !whitespace-normal sm:line-clamp-4'}
      />
    </td>
  )
}

const ProfitCell = (props: { profit: number; token: ContractToken }) => (
  <td
    className={clsx(
      'mx-2 min-w-[2rem] text-right',
      props.profit > 0 ? 'text-teal-600' : 'text-ink-600'
    )}
  >
    {formatMoney(props.profit, props.token)}
  </td>
)
