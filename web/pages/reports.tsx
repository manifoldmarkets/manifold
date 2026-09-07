import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ControlledTabs } from 'web/components/layout/tabs'
import { SEO } from 'web/components/SEO'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { ModReport, ReportStatus } from 'common/mod-report'
import { useModReports, useReportPages } from 'web/hooks/use-mod-reports'
import ModReportItem from 'web/components/mod-report-item'
import UserReportItem from 'web/components/user-report-item'
import { Title } from 'web/components/widgets/title'
import { api } from 'web/lib/api/api'
import { useEffect, useMemo, useState } from 'react'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import {
  getReportBatch,
  LiteReport,
  ReportCursor,
} from 'web/pages/admin/reports'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import {
  FilterPill,
  FilterState,
  passesFilter,
} from 'web/components/widgets/filter-pill'

const USER_REPORTS_PAGE_SIZE = 10

type SortOrder = 'desc' | 'asc'

const SORT_CHOICES: { [label: string]: SortOrder } = {
  Newest: 'desc',
  Oldest: 'asc',
}

const MOD_REPORT_STATUSES: ReportStatus[] = [
  'new',
  'under review',
  'needs admin',
  'resolved',
]

const STATUS_LABELS: { [status in ReportStatus]: string } = {
  new: 'New',
  'under review': 'Under review',
  'needs admin': 'Needs admin',
  resolved: 'Resolved',
}

const USER_REPORT_TYPES = ['contract', 'comment', 'user', 'post']

type Filters<T extends string> = { [key in T]: FilterState }

function makeFilters<T extends string>(
  keys: readonly T[],
  overrides: Partial<Filters<T>> = {}
) {
  const filters = Object.fromEntries(
    keys.map((key) => [key, 'off'])
  ) as Filters<T>
  return { ...filters, ...overrides }
}

/** The keys left visible by a set of include/exclude pills: the explicitly
 * included ones, or everything that wasn't explicitly excluded. */
function includedKeys<T extends string>(
  keys: readonly T[],
  filters: Filters<T>
) {
  const included = keys.filter((key) => filters[key] === 'include')
  return included.length
    ? included
    : keys.filter((key) => filters[key] !== 'exclude')
}

const isDefault = <T extends string>(
  filters: Filters<T>,
  defaults: Filters<T>
) =>
  Object.keys(defaults).every((key) => filters[key as T] === defaults[key as T])

const DEFAULT_MOD_STATUS_FILTERS = makeFilters(MOD_REPORT_STATUSES, {
  resolved: 'exclude',
})

const DEFAULT_USER_TYPE_FILTERS = makeFilters(USER_REPORT_TYPES)

const updateModReport = async (
  reportId: number,
  updates: Partial<{ status: ReportStatus; mod_note: string }>
) => {
  const response = await api('update-mod-report', { reportId, updates })
  if (response.status === 'success') {
    return response.report
  } else {
    console.error('Error updating report:', response)
    return null
  }
}

export default function ReportsPage() {
  const isAdminOrMod = useAdminOrMod()
  const [activeTab, setActiveTab] = useState('mod-reports')
  const [userTabOpened, setUserTabOpened] = useState(false)

  // Mod report sorting & filtering.
  const [modSort, setModSort] = useState<SortOrder>('desc')
  const [statusFilters, setStatusFilters] = useState(DEFAULT_MOD_STATUS_FILTERS)
  const [modNoteFilter, setModNoteFilter] = useState<FilterState>('off')
  const [modBannedFilter, setModBannedFilter] = useState<FilterState>('off')

  const selectedStatuses = useMemo(
    () => includedKeys(MOD_REPORT_STATUSES, statusFilters),
    [statusFilters]
  )

  const {
    reports: modReports,
    initialLoading,
    isLoading: modReportsLoading,
    error: modReportsError,
    hasMore: hasMoreModReports,
    loadMore: loadMoreModReports,
    reportStatuses,
    modNotes,
    setReportStatuses,
    setModNotes,
  } = useModReports(selectedStatuses, modSort, !!isAdminOrMod)

  const visibleModReports = useMemo(
    () =>
      (modReports ?? []).filter((report) => {
        const note = (
          modNotes[report.report_id] ??
          report.mod_note ??
          ''
        ).trim()
        return (
          passesFilter(modNoteFilter, !!note) &&
          passesFilter(modBannedFilter, !!report.owner_is_banned_from_posting)
        )
      }),
    [modReports, modNotes, modNoteFilter, modBannedFilter]
  )

  const modFiltersAreDefault =
    isDefault(statusFilters, DEFAULT_MOD_STATUS_FILTERS) &&
    modNoteFilter === 'off' &&
    modBannedFilter === 'off'

  const resetModFilters = () => {
    setStatusFilters(DEFAULT_MOD_STATUS_FILTERS)
    setModNoteFilter('off')
    setModBannedFilter('off')
  }

  // User report sorting & filtering.
  const [userSort, setUserSort] = useState<SortOrder>('desc')
  const [typeFilters, setTypeFilters] = useState(DEFAULT_USER_TYPE_FILTERS)
  const [userBannedFilter, setUserBannedFilter] =
    useState<FilterState>('exclude')
  const [userReasonFilter, setUserReasonFilter] = useState<FilterState>('off')
  const [bannedIds, setBannedIds] = useState<string[]>([])
  const {
    reports: allUserReports,
    error: userReportsError,
    isLoading: userReportsLoading,
    hasMore: hasMoreUserReports,
    loadMore: loadMoreUserReports,
  } = useReportPages<LiteReport, ReportCursor>(
    userSort,
    (after) =>
      getReportBatch({ limit: 50, ascending: userSort === 'asc', after }),
    !!isAdminOrMod && userTabOpened
  )

  const isBanned = (report: LiteReport) =>
    !!report.owner.isBannedFromPosting || bannedIds.includes(report.owner.id)

  const unbannedUserReports = allUserReports?.filter((r) => !isBanned(r))

  const visibleTypes = useMemo(
    () => includedKeys(USER_REPORT_TYPES, typeFilters),
    [typeFilters]
  )

  const visibleUserReports = useMemo(
    () =>
      allUserReports?.filter(
        (report) =>
          (!USER_REPORT_TYPES.includes(report.contentType) ||
            visibleTypes.includes(report.contentType)) &&
          passesFilter(userBannedFilter, isBanned(report)) &&
          passesFilter(userReasonFilter, !!report.reasonsDescription?.trim())
      ),
    [
      allUserReports,
      visibleTypes,
      userBannedFilter,
      userReasonFilter,
      bannedIds,
    ]
  )

  const userFiltersAreDefault =
    isDefault(typeFilters, DEFAULT_USER_TYPE_FILTERS) &&
    userBannedFilter === 'exclude' &&
    userReasonFilter === 'off'

  const resetUserFilters = () => {
    setTypeFilters(DEFAULT_USER_TYPE_FILTERS)
    setUserBannedFilter('exclude')
    setUserReasonFilter('off')
  }

  const handleStatusChange = async (
    reportId: number,
    newStatus: ReportStatus
  ) => {
    setReportStatuses((prevStatuses) => ({
      ...prevStatuses,
      [reportId]: newStatus,
    }))

    await updateModReport(reportId, { status: newStatus })
  }

  const handleNoteSave = async (reportId: number, newNote: string) => {
    setModNotes((prevNotes) => ({
      ...prevNotes,
      [reportId]: newNote,
    }))

    await updateModReport(reportId, { mod_note: newNote })
  }

  if (!isAdminOrMod)
    return (
      <Page trackPageView={'mod reports'}>
        <div className="mt-24 self-center">
          You must be a Mod or Admin to view this page.
        </div>
      </Page>
    )

  const renderReportList = (reportList: ModReport[]) => (
    <Col className="w-full">
      {reportList.length > 0 ? (
        reportList.map((report: ModReport) => (
          <ModReportItem
            key={report.report_id}
            report={report}
            reportStatuses={reportStatuses}
            modNotes={modNotes}
            handleStatusChange={handleStatusChange}
            handleNoteSave={handleNoteSave}
          />
        ))
      ) : (
        <div className="mt-8 text-center">
          No matching reports among the reports loaded so far.
        </div>
      )}
    </Col>
  )

  const renderModReportsContent = () => (
    <Col className="w-full">
      <FilterRow
        sort={modSort}
        setSort={setModSort}
        onReset={modFiltersAreDefault ? undefined : resetModFilters}
      >
        {MOD_REPORT_STATUSES.map((status) => (
          <FilterPill
            key={status}
            state={statusFilters[status]}
            onChange={(state) =>
              setStatusFilters((prev) => ({ ...prev, [status]: state }))
            }
          >
            {STATUS_LABELS[status]}
          </FilterPill>
        ))}
        <FilterPill state={modNoteFilter} onChange={setModNoteFilter}>
          Has mod note
        </FilterPill>
        <FilterPill state={modBannedFilter} onChange={setModBannedFilter}>
          Banned author
        </FilterPill>
      </FilterRow>

      {initialLoading ? (
        <div className="mt-8 text-center">Loading reports...</div>
      ) : modReports ? (
        <>
          <div className="text-ink-500 mb-2 text-sm">
            Showing {visibleModReports.length} of {modReports?.length ?? 0}{' '}
            loaded reports
          </div>
          {renderReportList(visibleModReports)}
        </>
      ) : null}
      <ReportLoadMore
        hasMore={hasMoreModReports}
        isLoading={modReportsLoading && !initialLoading}
        error={modReportsError}
        onLoadMore={loadMoreModReports}
      />
    </Col>
  )

  const renderUserReportsList = () => (
    <Col className="w-full">
      <FilterRow
        sort={userSort}
        setSort={setUserSort}
        onReset={userFiltersAreDefault ? undefined : resetUserFilters}
      >
        {USER_REPORT_TYPES.map((type) => (
          <FilterPill
            key={type}
            state={typeFilters[type]}
            onChange={(state) =>
              setTypeFilters((prev) => ({ ...prev, [type]: state }))
            }
          >
            {type[0].toUpperCase() + type.slice(1)}
          </FilterPill>
        ))}
        <FilterPill state={userBannedFilter} onChange={setUserBannedFilter}>
          Banned user
        </FilterPill>
        <FilterPill state={userReasonFilter} onChange={setUserReasonFilter}>
          Has reason
        </FilterPill>
      </FilterRow>
      {allUserReports && (
        <div className="text-ink-500 mb-2 text-sm">
          Showing {visibleUserReports?.length ?? 0} of {allUserReports.length}{' '}
          loaded reports
        </div>
      )}
      <UserReportsListInner
        reports={visibleUserReports}
        allReportsError={userReportsError}
        bannedIds={bannedIds}
        onBan={(userId) => setBannedIds((ids) => [...ids, userId])}
        filterKey={JSON.stringify([
          userSort,
          typeFilters,
          userBannedFilter,
          userReasonFilter,
        ])}
      />
      <ReportLoadMore
        hasMore={hasMoreUserReports}
        isLoading={userReportsLoading && !!allUserReports}
        error={userReportsError}
        onLoadMore={loadMoreUserReports}
      />
    </Col>
  )

  const tabs = [
    {
      title: 'Mod Reports',
      content: renderModReportsContent(),
      queryString: 'mod-reports',
    },
    {
      title: 'User Reports',
      content: renderUserReportsList(),
      queryString: 'user-reports',
      inlineTabIcon:
        unbannedUserReports && unbannedUserReports.length > 0 ? (
          <div className="text-ink-0 bg-primary-500 min-w-[15px] rounded-full p-[2px] text-center text-[10px] leading-3">
            {unbannedUserReports.length}
          </div>
        ) : null,
    },
  ]

  return (
    <Page trackPageView={'mod reports'}>
      <SEO
        title="Mod Reports"
        description="A page for mods to review reports and support tickets from users."
        url="/reports"
      />
      <Col className="p-4">
        <Title>Reports</Title>
        <ControlledTabs
          tabs={tabs}
          activeIndex={activeTab === 'user-reports' ? 1 : 0}
          trackingName="mod-reports-tabs"
          onClick={(title, index) => {
            if (index === 0) setActiveTab('mod-reports')
            else {
              setActiveTab('user-reports')
              setUserTabOpened(true)
            }
          }}
        />
      </Col>
    </Page>
  )
}

function ReportLoadMore(props: {
  hasMore: boolean
  isLoading: boolean
  error: boolean
  onLoadMore: () => void
}) {
  const { hasMore, isLoading, error, onLoadMore } = props
  return (
    <Col className="mt-4 items-center gap-2">
      {error && (
        <div role="alert">Failed to load reports. Please try again.</div>
      )}
      {hasMore && (
        <div className="text-ink-500 text-center text-sm">
          Filters apply to loaded reports. More reports are available.
        </div>
      )}
      {(hasMore || error || isLoading) && (
        <Button color="gray-outline" disabled={isLoading} onClick={onLoadMore}>
          {isLoading
            ? 'Loading reports...'
            : error
            ? 'Retry'
            : 'Load 50 more reports'}
        </Button>
      )}
    </Col>
  )
}

/** Sort toggle plus a wrapping row of include/exclude filter pills. */
function FilterRow(props: {
  sort: SortOrder
  setSort: (sort: SortOrder) => void
  onReset?: () => void
  children: React.ReactNode
}) {
  const { sort, setSort, onReset, children } = props

  return (
    <Col className="mb-4 mt-2 gap-2">
      <Row className="items-center gap-2">
        <span className="text-ink-500 text-sm">Sort</span>
        <ChoicesToggleGroup
          currentChoice={sort}
          choicesMap={SORT_CHOICES}
          setChoice={(choice) => setSort(choice as SortOrder)}
          toggleClassName="!py-1"
        />
      </Row>
      <Row className="flex-wrap items-center gap-2">
        <span className="text-ink-500 text-sm">Filter</span>
        {children}
        {onReset && (
          <Button size="2xs" color="gray-white" onClick={onReset}>
            Reset
          </Button>
        )}
      </Row>
    </Col>
  )
}

function UserReportsListInner(props: {
  reports: LiteReport[] | undefined
  allReportsError: boolean
  bannedIds: string[]
  onBan: (userId: string) => void
  filterKey: string
}) {
  const { reports, allReportsError, bannedIds, onBan, filterKey } = props
  const [page, setPage] = useState(0)

  useEffect(() => setPage(0), [filterKey])

  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil((reports?.length ?? 0) / USER_REPORTS_PAGE_SIZE) - 1)
  )
  const pageStart = currentPage * USER_REPORTS_PAGE_SIZE
  const pageItems = reports?.slice(
    pageStart,
    pageStart + USER_REPORTS_PAGE_SIZE
  )
  const isStart = currentPage === 0
  const isEnd = reports
    ? pageStart + USER_REPORTS_PAGE_SIZE >= reports.length
    : true

  if (allReportsError && !reports) return null

  return (
    <>
      <PaginationNextPrev
        className="mb-4"
        isStart={isStart}
        isEnd={isEnd}
        isLoading={!reports}
        isComplete={!!reports}
        getPrev={() => setPage(Math.max(0, currentPage - 1))}
        getNext={() => setPage(currentPage + 1)}
      />

      {!reports ? (
        <div className="my-8 text-center">Loading user reports...</div>
      ) : pageItems && pageItems.length > 0 ? (
        pageItems.map((report) => (
          <UserReportItem
            key={report.id}
            report={report}
            bannedIds={bannedIds}
            onBan={onBan}
          />
        ))
      ) : (
        <div className="my-8 text-center">
          No matching reports among the reports loaded so far.
        </div>
      )}

      <PaginationNextPrev
        className="mt-4"
        isStart={isStart}
        isEnd={isEnd}
        isLoading={!reports}
        isComplete={!!reports}
        getPrev={() => setPage(Math.max(0, currentPage - 1))}
        getNext={() => setPage(currentPage + 1)}
      />
    </>
  )
}
