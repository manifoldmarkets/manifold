import { useEffect, useState, useRef } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { SEO } from 'web/components/SEO'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { Avatar } from 'web/components/widgets/avatar'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Title } from 'web/components/widgets/title'
import { BannedBadge, UserLink } from 'web/components/widgets/user-link'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { getUserById } from 'web/lib/supabase/users'
import { api } from 'web/lib/firebase/api'
import { Report, ReportStatus } from 'common/api/report-types'

const updateReportStatus = async (
  reportId: number,
  newStatus: ReportStatus
) => {
  const response = await api('update-report-status', { reportId, newStatus })
  if (response.status === 'success') {
    return response.data
  } else {
    console.error('Error updating report status:', response)
    return null
  }
}

const App = () => {
  const isAdminOrMod = useAdminOrMod()
  const [reports, setReports] = useState<Report[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [owner, setOwner] = useState<{ [key: string]: any }>({})
  const [reportStatuses, setReportStatuses] = useState<{
    [key: number]: ReportStatus
  }>({})

  const initialLoadRef = useRef(true) // Ref to track the initial load

  const getReports = async () => {
    const response = await api('get-reports', {})
    if (response && response.status === 'success') {
      const newReports = response.data

      // Only update the state if the new reports are different from the current ones
      if (JSON.stringify(newReports) !== JSON.stringify(reports)) {
        setReports(newReports)
        const initialStatuses = newReports.reduce(
          (acc: any, report: Report) => {
            acc[report.report_id] = report.status
            return acc
          },
          {} as { [key: number]: ReportStatus }
        )
        setReportStatuses(initialStatuses)
      }
    } else {
      console.error('Failed to fetch reports:', response)
    }

    if (initialLoadRef.current) {
      setInitialLoading(false)
      initialLoadRef.current = false
    }
  }

  useEffect(() => {
    getReports()

    const intervalId = setInterval(() => {
      getReports()
    }, 1000) // Adjust the interval time as needed (e.g., 1000 ms = 1 second)

    return () => clearInterval(intervalId) // Cleanup the interval on component unmount
  }, [])

  const handleStatusChange = async (
    reportId: number,
    newStatus: ReportStatus
  ) => {
    // Optimistic update
    setReportStatuses((prevStatuses) => ({
      ...prevStatuses,
      [reportId]: newStatus,
    }))

    const result = await updateReportStatus(reportId, newStatus)

    if (!result) {
      // Revert back to the previous status if the update fails
      setReportStatuses((prevStatuses) => ({
        ...prevStatuses,
        [reportId]:
          reports.find((report) => report.report_id === reportId)?.status ||
          prevStatuses[reportId],
      }))
    }
  }

  useEffect(() => {
    const fetchOwner = async () => {
      const ownerData: { [key: string]: any } = {}
      for (const report of reports) {
        const user = await getUserById(report.user_id)
        ownerData[report.user_id] = user
      }
      setOwner(ownerData)
    }

    if (reports.length > 0) {
      fetchOwner()
    }
  }, [reports])

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

  const unresolvedReports = reports.filter(
    (report) =>
      report.status === 'new' ||
      report.status === 'under review' ||
      report.status === 'needs admin'
  )

  const resolvedReports = reports.filter(
    (report) => report.status === 'resolved'
  )

  const renderReportList = (reportList: Report[]) => (
    <Col className="w-full">
      {reportList.map((report: Report) => (
        <Row key={report.report_id} className="p-4">
          <Col className="w-full gap-1">
            <Row className="flex w-full items-center justify-between">
              <div className="flex items-center">
                {owner[report.user_id] && (
                  <UserHovercard userId={report.user_id}>
                    <div className="flex items-center">
                      <Avatar
                        username={owner[report.user_id]?.username || ''}
                        avatarUrl={owner[report.user_id]?.avatarUrl || ''}
                        size="sm"
                      />
                      <UserLink
                        user={owner[report.user_id]}
                        className="text-ink-800 ml-2"
                      />
                      {owner[report.user_id]?.isBannedFromPosting && (
                        <BannedBadge />
                      )}
                    </div>
                  </UserHovercard>
                )}
                <div className="ml-2">needs help with this comment.</div>
              </div>
              {report.created_time && (
                <RelativeTimestamp
                  time={new Date(report.created_time ?? new Date()).getTime()}
                  className="ml-4"
                />
              )}
            </Row>

            <Row>Contract ID: {report.contract_id}</Row>
            <Row>Comment ID: {report.comment_id}</Row>
            <Row className="items-center">
              <div className="pr-2"> Status: </div>
              <ChoicesToggleGroup
                currentChoice={reportStatuses[report.report_id] || 'new'}
                choicesMap={{
                  New: 'new',
                  'Under Review': 'under review',
                  Resolved: 'resolved',
                  'Needs Admin': 'needs admin',
                }}
                setChoice={(val) =>
                  handleStatusChange(report.report_id, val as ReportStatus)
                }
              />
            </Row>
          </Col>
        </Row>
      ))}
    </Col>
  )

  const tabs = [
    {
      title: 'Unresolved',
      content:
        unresolvedReports.length > 0 ? (
          renderReportList(unresolvedReports)
        ) : (
          <div
            className="mt-8
           text-center"
          >
            All reports have been resolved, great job! Keep it up and one day
            you'll get a payrise :D
          </div>
        ),
      queryString: 'unresolved',
    },
    {
      title: 'Resolved',
      content: renderReportList(resolvedReports),
      queryString: 'resolved',
    },
  ]

  return (
    <Page trackPageView={'mod reports'}>
      <SEO
        title="Mod Reports"
        description="A page for mods to review reports and support tickets from users."
        url="/reports"
      />
      <Title>Reports</Title>
      <QueryUncontrolledTabs
        tabs={tabs}
        defaultIndex={0}
        scrollToTop={true}
        trackingName="mod-reports-tabs"
      />
    </Page>
  )
}

export default App
