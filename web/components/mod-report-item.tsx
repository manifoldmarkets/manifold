import React from 'react'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { EditableModNote } from 'web/components/contract/editable-mod-note'
import { BannedBadge } from 'web/components/widgets/user-link'
import Link from 'next/link'
import { ModReport, ReportStatus } from 'common/mod-report'
import { Col } from './layout/col'
import { Row } from './layout/row'

interface ReportItemProps {
  report: ModReport
  reportStatuses: { [key: number]: ReportStatus }
  modNotes: { [key: number]: string | undefined }
  handleStatusChange: (
    reportId: number,
    newStatus: ReportStatus
  ) => Promise<void>
  handleNoteSave: (reportId: number, newNote: string) => Promise<void>
}

const ModReportItem: React.FC<ReportItemProps> = ({
  report,
  reportStatuses,
  modNotes,
  handleStatusChange,
  handleNoteSave,
}) => {

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

  return (
    <Row key={report.report_id} className="p-4">
      <Col className="w-full gap-1">
        <Row className="flex w-full items-center justify-between">
          <div className="flex items-center">
            <UserHovercard userId={report.user_id}>
              <div className="flex items-center">
                <Avatar
                  username={report.owner_username}
                  avatarUrl={report.owner_avatarUrl || ''}
                  size="sm"
                />
                <UserLink
                  user={{
                    id: report.user_id,
                    name: '',
                    username: report.owner_username,
                  }}
                  className="text-ink-800 ml-2"
                />
                {report.owner_isBannedFromPosting && <BannedBadge />}
              </div>
            </UserHovercard>
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
            {renderContent(report.comment_content)}
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
          Mod note: {''}
          <EditableModNote
            reportId={report.report_id}
            initialNote={modNotes[report.report_id] || ''}
            onSave={handleNoteSave}
          />
        </Row>
      </Col>
    </Row>
  )
}

export default ModReportItem
