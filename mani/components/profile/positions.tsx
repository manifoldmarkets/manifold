import { Contract } from 'common/contract'
import { Col } from 'components/layout/col'
import { PositionRow } from './position-row'
import { useAPIGetter } from 'hooks/use-api-getter'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Row } from 'components/layout/row'
import { useTokenMode } from 'hooks/use-token-mode'
import { orderBy } from 'lodash'
import { Pagination } from 'components/widgets/pagination'
import { PillButton } from 'components/buttons/pill-button'
import { User } from 'common/user'
import { groupBy } from 'lodash'
import { useColor } from 'hooks/use-color'

type BetFilter = 'open' | 'sold' | 'closed' | 'resolved' | 'all'
export function Positions(props: { user: User }) {
  const { user } = props
  const FILTERS: Record<BetFilter, (c: Contract) => boolean> = {
    resolved: (c) => !!c.resolutionTime,
    closed: (c) =>
      !FILTERS.resolved(c) && (c.closeTime ?? Infinity) < Date.now(),
    open: (c) => !(FILTERS.closed(c) || FILTERS.resolved(c)),
    all: () => true,
    sold: () => true,
  }

  const { token } = useTokenMode()

  // TODO; These don't update when selling
  const { data } = useAPIGetter('get-user-contract-metrics-with-contracts', {
    userId: user?.id ?? '_',
    limit: 5000,
    offset: 0,
    perAnswer: true,
    inMani: true,
  })
  const { metricsByContract, contracts } = data ?? {}
  const [filter, setFilter] = usePersistentInMemoryState<BetFilter>(
    'open',
    'bets-list-filter'
  )
  const [searchQuery, setSearchQuery] = usePersistentInMemoryState<string>(
    '',
    'bets-list-search'
  )
  const [currentPage, setCurrentPage] = usePersistentInMemoryState<number>(
    0,
    'bets-list-page'
  )

  const filteredContracts = contracts
    ?.filter((c) => c.token === token)
    ?.filter(FILTERS[filter])
    ?.filter((c) =>
      searchQuery
        ? c.question.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    )

  // First get all valid metrics with their contracts
  const validMetrics = orderBy(
    Object.values(metricsByContract ?? {})
      .flat()
      .filter((metric) => {
        const contract = filteredContracts?.find(
          (c) => c.id === metric.contractId
        )
        if (!contract) return false
        if (filter === 'all') return true
        const hasShares = metricsByContract?.[contract.id]?.some(
          (m) => m.hasShares
        )
        if (filter === 'sold') return !hasShares
        return hasShares
      }),
    (m) => m.lastBetTime,
    'desc'
  )

  const PAGE_SIZE = 50
  const startIndex = currentPage * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE

  const color = useColor()

  // Group metrics by contract before pagination
  const groupedMetricsByContract = groupBy(validMetrics, 'contractId')

  // Paginate the grouped contracts instead of individual metrics
  const paginatedContractIds = Object.keys(groupedMetricsByContract).slice(
    startIndex,
    endIndex
  )

  return (
    <Col>
      <Row style={{ gap: 4, marginTop: 12 }}>
        {(['all', 'open', 'sold', 'closed', 'resolved'] as BetFilter[]).map(
          (f) => (
            <PillButton
              key={f}
              selected={filter === f}
              onSelect={() => {
                setFilter(f)
                setCurrentPage(0) // Reset to first page when filter changes
              }}
            >
              {f === 'all'
                ? 'All'
                : f === 'sold'
                ? 'Sold'
                : f === 'closed'
                ? 'Closed'
                : f === 'resolved'
                ? 'Resolved'
                : 'Open'}
            </PillButton>
          )
        )}
      </Row>
      {(() => {
        return paginatedContractIds.map((contractId) => {
          const contractMetrics = groupedMetricsByContract[contractId]
          const contract = filteredContracts?.find((c) => c.id === contractId)
          if (!contract) return null
          return (
            <Col
              key={contractId}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: color.border,
              }}
            >
              {contractMetrics.map((metric) => {
                if (contract.mechanism === 'cpmm-multi-1' && !metric.answerId) {
                  return null
                }

                const { answerId } = metric
                const answer =
                  contract?.mechanism === 'cpmm-multi-1' && answerId
                    ? contract.answers.find((a) => a.id === answerId)
                    : undefined

                // Show question only for the first metric in each contract group
                const showQuestion = contractMetrics.indexOf(metric) === 0
                const isLastMetric =
                  contractMetrics.indexOf(metric) === contractMetrics.length - 1

                return (
                  <PositionRow
                    key={contract.id + answerId}
                    contract={contract as Contract}
                    metric={metric}
                    answer={answer}
                    showQuestion={showQuestion}
                  />
                )
              })}
            </Col>
          )
        })
      })()}
      <Pagination
        page={currentPage}
        pageSize={PAGE_SIZE}
        totalItems={Object.keys(groupedMetricsByContract).length}
        setPage={setCurrentPage}
      />
    </Col>
  )
}
