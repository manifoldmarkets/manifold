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
import Link from 'next/link'
import { EditableModNote } from 'web/components/contract/editable-mod-note'

const updateReport = async (
  reportId: number,
  updates: Partial<{ status: ReportStatus; mod_note: string }>
) => {
  const response = await api('update-report', { reportId, updates })
  if (response.status === 'success') {
    return response.data
  } else {
    console.error('Error updating report:', response)
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
  const [modNotes, setModNotes] = useState<{
    [key: number]: string | undefined
  }>({})
  const initialLoadRef = useRef(true)

  const getReports = async () => {
    const response = await api('get-reports', {})
    if (response && response.status === 'success') {
      const newReports = response.data

      if (JSON.stringify(newReports) !== JSON.stringify(reports)) {
        const sortedReports = newReports
          .filter((report: Report) => report.created_time)
          .sort(
            (a: Report, b: Report) =>
              new Date(b.created_time ?? 0).getTime() -
              new Date(a.created_time ?? 0).getTime()
          )

        setReports(sortedReports)
        const initialStatuses = sortedReports.reduce(
          (acc: any, report: Report) => {
            acc[report.report_id] = report.status
            return acc
          },
          {} as { [key: number]: ReportStatus }
        )
        const initialNotes = sortedReports.reduce(
          (acc: any, report: Report) => {
            acc[report.report_id] = report.mod_note
            return acc
          },
          {} as { [key: number]: string | undefined }
        )
        setReportStatuses(initialStatuses)
        setModNotes(initialNotes)
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
    }, 1000)

    return () => clearInterval(intervalId)
  }, [])

  const handleStatusChange = async (
    reportId: number,
    newStatus: ReportStatus
  ) => {
    setReportStatuses((prevStatuses) => ({
      ...prevStatuses,
      [reportId]: newStatus,
    }))

    await updateReport(reportId, { status: newStatus })
  }

  const handleNoteSave = async (reportId: number, newNote: string) => {
    setModNotes((prevNotes) => ({
      ...prevNotes,
      [reportId]: newNote,
    }))

    await updateReport(reportId, { mod_note: newNote })
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

  const renderContent = (content: any) => {
    if (typeof content === 'string') {
      return <span>{content}</span>
    } else if (Array.isArray(content)) {
      return content.map((item, index) => (
        <div key={index}>{renderContent(item)}</div>
      ))
    } else if (typeof content === 'object') {
      return (
        <div>
          {content.text && <span>{content.text}</span>}
          {content.content &&
            content.content.map((item: any, index: number) => (
              <div key={index}>{renderContent(item)}</div>
            ))}
        </div>
      )
    } else {
      return null
    }
  }

  const renderReportList = (reportList: Report[]) => (
    <Col className="w-full">
      {reportList.map((report: Report) => (
        <Row key={report.report_id} className="m-4 mb-8 ">
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
                <Row className="ml-2">commented:</Row>
              </div>
              {report.created_time && (
                <RelativeTimestamp
                  time={new Date(report.created_time!).getTime()}
                  className="ml-4"
                />
              )}
            </Row>
            <Row className="ml-10">
              <Link
                className="text-primary-700 hover:text-primary-500 hover:underline"
                href={`/${report.creator_username}/${report.contract_slug}#${report.comment_id}`}
              >
                {renderContent(report.content)}
              </Link>
            </Row>
            <Row className="mt-2">Market: {report.contract_question}</Row>

            <Row className="mt-1 items-center">
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
            <Row className="mt-2 items-center">
              Mod note: &nbsp;
              <EditableModNote
                reportId={report.report_id}
                initialNote={modNotes[report.report_id] || ''}
                onSave={handleNoteSave}
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
          <Col className="mt-8 text-center">
            All reports have been resolved, great job! Keep it up and one day
            you'll get a payrise :D
            <Link
              href="/admin/reports"
              className="text-primary-700 hover:text-primary-500 mt-3 text-center hover:underline"
            >
              Other reports...
            </Link>
          </Col>
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
      <Col className="p-4">
        <Title>Reports</Title>
        <QueryUncontrolledTabs
          tabs={tabs}
          defaultIndex={0}
          scrollToTop={true}
          trackingName="mod-reports-tabs"
        />
      </Col>
    </Page>
  )
}

export default App
