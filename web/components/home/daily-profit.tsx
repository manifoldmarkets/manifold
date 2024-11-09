import { ArrowUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { APIResponse } from 'common/api/schema'
import { ContractToken, CPMMContract, MarketContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { SWEEPIES_NAME, TRADE_TERM } from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { User } from 'common/user'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { capitalize, keyBy, partition, sortBy } from 'lodash'
import { useEffect, useState } from 'react'
import { ContractMention } from 'web/components/contract/contract-mention'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { Col } from 'web/components/layout/col'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Pagination } from 'web/components/widgets/pagination'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { api } from 'web/lib/api/api'
import { withTracking } from 'web/lib/service/analytics'
import { UncontrolledTabs } from '../layout/tabs'
import { CoinNumber } from '../widgets/coin-number'
import { Table } from '../widgets/table'

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

  const [openModal, setOpenModal] = useState(false)
  useEffect(() => {
    if (openModal && !data && user) {
      api('get-daily-changed-metrics-and-contracts', {
        limit: 24,
        userId: user.id,
      }).then(setData)
    }
  }, [user?.id, openModal])

  return (
    <>
      <button
        className={clsx(dailyStatsClass)}
        onClick={withTracking(() => {
          setOpenModal(true)
        }, DAILY_PROFIT_CLICK_EVENT)}
      >
        <Row>
          <Col className="items-center">
            <Row className="gap-2">
              <Row>
                <CoinNumber
                  amount={!!data ? manaNetWorth : undefined}
                  coinType="mana"
                  coinClassName="top-[0.25rem] sm:top-[0.1rem]"
                  className="text-purple-700 dark:text-purple-300"
                  numberType="short"
                />
                {manaProfit !== 0 && (
                  <span
                    className={clsx(
                      'ml-0.5 mt-0.5 h-fit rounded-full px-1 py-0.5 text-xs',
                      manaProfit >= 0
                        ? 'bg-teal-600/10 text-teal-600'
                        : 'text-scarlet-600 bg-scarlet-600/10'
                    )}
                  >
                    {manaProfit >= 0 ? '+' : '-'}
                    {shortFormatNumber(Math.abs(manaProfit))}
                  </span>
                )}
              </Row>
              <Row>
                <div>
                  <CoinNumber
                    amount={!!data ? cashNetWorth : undefined}
                    coinType="CASH"
                    coinClassName="top-[0.25rem] sm:top-[0.1rem]"
                    className="text-amber-700 dark:text-amber-300"
                    numberType="short"
                  />
                </div>

                {cashProfit !== 0 && (
                  <span
                    className={clsx(
                      'ml-0.5 mt-1 h-fit rounded-full px-1 py-0.5 text-xs',
                      cashProfit >= 0
                        ? 'bg-teal-600/10 text-teal-600'
                        : 'text-scarlet-600 bg-scarlet-600/10'
                    )}
                  >
                    {cashProfit >= 0 ? '+' : '-'}
                    {shortFormatNumber(Math.abs(cashProfit))}
                  </span>
                )}
              </Row>
            </Row>
            <div className="text-ink-600 text-xs ">Net Worth</div>
          </Col>
        </Row>
      </button>
      <Modal
        open={openModal}
        setOpen={setOpenModal}
        className={clsx(MODAL_CLASS, 'min-h-[30rem]')}
        size={'lg'}
      >
        <UncontrolledTabs
          className="w-full"
          tabs={[
            {
              title: `Mana`,
              content: (
                <DailyProfitSection
                  metrics={data?.manaMetrics}
                  contracts={data?.contracts}
                  dailyProfit={manaProfit}
                  netWorth={manaNetWorth}
                  token="MANA"
                />
              ),
            },
            {
              title: `${capitalize(SWEEPIES_NAME)}`,
              content: (
                <DailyProfitSection
                  metrics={data?.cashMetrics}
                  contracts={data?.contracts}
                  dailyProfit={cashProfit}
                  netWorth={cashNetWorth}
                  token="CASH"
                />
              ),
            },
          ]}
        />
      </Modal>
    </>
  )
}

export function DailyProfitSection(props: {
  metrics?: ContractMetric[]
  contracts?: MarketContract[]
  dailyProfit: number
  netWorth: number
  token: ContractToken
}) {
  const { metrics, contracts, dailyProfit, netWorth, token } = props

  return (
    <>
      <Row className={'mb-2 mt-4 justify-between px-2'}>
        <Col>
          <span className={'ml-1'}>Your net worth</span>
          <span className={'mb-1 text-2xl'}>
            <CoinNumber amount={netWorth} coinType={token} />
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
            <CoinNumber amount={dailyProfit} coinType={token} />
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
    </>
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
