import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ControlledTabs } from 'web/components/layout/tabs'
import { SEO } from 'web/components/SEO'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { ModReport, ReportStatus } from 'common/src/mod-report'
import Link from 'next/link'
import { useModReports } from 'web/hooks/use-mod-reports'
import ModReportItem from 'web/components/mod-report-item'
import UserReportItem from 'web/components/user-report-item'
import { Title } from 'web/components/widgets/title'
import { api } from 'web/lib/api/api'
import { useEffect, useState } from 'react'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import { getReports, LiteReport } from 'web/pages/admin/reports'
import { Select } from 'web/components/widgets/select'
import { Row } from 'web/components/layout/row'

const USER_REPORTS_PAGE_SIZE = 10

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
  const [selectedStatuses, setSelectedStatuses] = useState<ReportStatus[]>([
    'new',
    'under review',
    'needs admin',
  ])
  const {
    reports: modReports,
    userReports,
    initialLoading,
    reportStatuses,
    modNotes,
    setReportStatuses,
    setModNotes,
  } = useModReports(selectedStatuses)
  const [showBannedUsers, setShowBannedUsers] = useState(false)

  const userReportCount = userReports?.filter(
    (r) => !r.owner.isBannedFromPosting
  ).length

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

  const handleStatusFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value

    if (value === 'all') {
      setSelectedStatuses(['new', 'under review', 'needs admin', 'resolved'])
    } else if (value === 'unresolved') {
      setSelectedStatuses(['new', 'under review', 'needs admin'])
    } else {
      setSelectedStatuses([value as ReportStatus])
    }
  }

  if (!isAdminOrMod)
    return (
      <Page trackPageView={'mod reports'}>
        <div className="mt-24 self-center">
          You must be a Mod or Admin to view this page.
        </div>
      </Page>
    )

  if (initialLoading)
    return (
      <Page trackPageView={'mod reports'}>
        <div className="mt-24 self-center">Loading reports...</div>
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
          No reports found with the selected filter.
        </div>
      )}
    </Col>
  )

  const renderUserReportsList = () => (
    <Col className="w-full">
      <Row className="mb-4 mt-2 justify-end">
        <Select
          className="max-w-xs"
          onChange={(e) => setShowBannedUsers(e.target.value === 'all')}
          value={showBannedUsers ? 'all' : 'hide-banned'}
        >
          <option value="all">Show All Users</option>
          <option value="hide-banned">Hide Banned Users</option>
        </Select>
      </Row>
      <UserReportsListInner
        key={String(showBannedUsers)}
        hideBanned={!showBannedUsers}
      />
    </Col>
  )

  const renderModReportsContent = () => (
    <Col className="w-full">
      <Row className="mb-4 mt-2 justify-end">
        <Select
          className="max-w-xs"
          onChange={handleStatusFilterChange}
          value={
            selectedStatuses.length === 4
              ? 'all'
              : selectedStatuses.length === 3 &&
                selectedStatuses.includes('new') &&
                selectedStatuses.includes('under review') &&
                selectedStatuses.includes('needs admin')
              ? 'unresolved'
              : selectedStatuses.length === 1
              ? selectedStatuses[0]
              : 'custom'
          }
        >
          <option value="all">All Statuses</option>
          <option value="unresolved">Unresolved</option>
          <option value="new">New</option>
          <option value="under review">Under Review</option>
          <option value="needs admin">Needs Admin</option>
          <option value="resolved">Resolved</option>
        </Select>
      </Row>
      {renderReportList(modReports ?? [])}

      <div className="mt-4 text-center">
        <Link
          href="/admin/reports"
          className="text-primary-700 hover:text-primary-500 hover:underline"
        >
          View additional reports...
        </Link>
      </div>
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
        userReportCount && userReportCount > 0 ? (
          <div className="text-ink-0 bg-primary-500 min-w-[15px] rounded-full p-[2px] text-center text-[10px] leading-3">
            {userReportCount}
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
            else setActiveTab('user-reports')
          }}
        />
      </Col>
    </Page>
  )
}

function UserReportsListInner(props: { hideBanned: boolean }) {
  const { hideBanned } = props
  const [allReports, setAllReports] = useState<LiteReport[] | undefined>()
  const [bannedIds, setBannedIds] = useState<string[]>([])
  const [page, setPage] = useState(0)

  useEffect(() => {
    getReports({ limit: 100 }).then(setAllReports)
  }, [])

  const filtered = allReports?.filter((r) => {
    if (!hideBanned) return true
    return !r.owner.isBannedFromPosting && !bannedIds.includes(r.owner.id)
  })

  const pageStart = page * USER_REPORTS_PAGE_SIZE
  const pageItems = filtered?.slice(pageStart, pageStart + USER_REPORTS_PAGE_SIZE)
  const isStart = page === 0
  const isEnd = filtered
    ? pageStart + USER_REPORTS_PAGE_SIZE >= filtered.length
    : true

  return (
    <>
      <PaginationNextPrev
        className="mb-4"
        isStart={isStart}
        isEnd={isEnd}
        isLoading={!allReports}
        isComplete={!!allReports}
        getPrev={() => setPage((p) => Math.max(0, p - 1))}
        getNext={() => setPage((p) => p + 1)}
      />

      {!allReports ? (
        <div className="my-8 text-center">Loading user reports...</div>
      ) : pageItems && pageItems.length > 0 ? (
        pageItems.map((report) => (
          <UserReportItem
            key={report.id}
            report={report}
            bannedIds={bannedIds}
            onBan={(userId) => setBannedIds((ids) => [...ids, userId])}
          />
        ))
      ) : (
        <div className="my-8 text-center">No user reports found.</div>
      )}

      <PaginationNextPrev
        className="mt-4"
        isStart={isStart}
        isEnd={isEnd}
        isLoading={!allReports}
        isComplete={!!allReports}
        getPrev={() => setPage((p) => Math.max(0, p - 1))}
        getNext={() => setPage((p) => p + 1)}
      />
    </>
  )
}
