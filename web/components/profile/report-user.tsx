import { reportContent } from 'web/components/buttons/report-button'
import React from 'react'
import { PrivateUser, User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Checkbox } from 'web/components/widgets/checkbox'
import { Button } from 'web/components/buttons/button'
import Textarea from 'react-expanding-textarea'
import { toast } from 'react-hot-toast'

export const ReportUser = (props: {
  user: User
  currentUser: PrivateUser
  closeModal: () => void
}) => {
  const { user, currentUser, closeModal } = props
  const reportTypes = [
    'Spam',
    'Inappropriate or objectionable content',
    'Violence or threats',
    'Fraudulent activity',
    'Other',
  ]
  const [selectedReportTypes, setSelectedReportTypes] = React.useState<
    string[]
  >([])
  const [otherReportType, setOtherReportType] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [hasSubmitted, setHasSubmitted] = React.useState(false)
  const canSubmit =
    selectedReportTypes.length > 0 &&
    otherReportType.length > 0 &&
    !isSubmitting
  const reportUser = async () => {
    setIsSubmitting(true)
    await toast
      .promise(
        reportContent(currentUser.id, {
          contentType: 'user',
          contentId: user.id,
          contentOwnerId: user.id,
          description:
            'Reasons: ' + [...selectedReportTypes, otherReportType].join(', '),
        }),
        {
          loading: 'Reporting...',
          success: 'Reported',
          error: 'Error reporting user',
        }
      )
      .then(() => {
        setHasSubmitted(true)
      })
    setIsSubmitting(false)
  }

  return (
    <Col>
      {hasSubmitted ? (
        <Col className={'gap-2'}>
          <span>Thank you for your report.</span>
          <span>We'll review the user and take action if necessary.</span>
          <Row className={'mt-2 justify-end'}>
            <Button onClick={closeModal}>Close</Button>
          </Row>
        </Col>
      ) : (
        <>
          <Row className={'mb-4'}>
            <span>
              Please select the reason(s) for reporting this user and a link to
              the content.
            </span>
          </Row>
          <Col className={'mb-4 ml-4 gap-3'}>
            {reportTypes.map((reportType) => (
              <Checkbox
                key={reportType}
                label={reportType}
                checked={selectedReportTypes.includes(reportType)}
                toggle={(checked) => {
                  if (checked) {
                    setSelectedReportTypes([...selectedReportTypes, reportType])
                  } else {
                    setSelectedReportTypes(
                      selectedReportTypes.filter((t) => t !== reportType)
                    )
                  }
                }}
              />
            ))}

            <Textarea
              placeholder={
                'Add more context and/or provide a link to the content'
              }
              rows={2}
              className={
                'border-ink-300 bg-canvas-0 -ml-2 rounded-md border p-2'
              }
              value={otherReportType}
              onChange={(e) => setOtherReportType(e.target.value)}
            />
          </Col>
          <Row className={'justify-between'}>
            <Button color={'gray-white'} onClick={closeModal}>
              Cancel
            </Button>
            <Button disabled={!canSubmit} color={'red'} onClick={reportUser}>
              Report User
            </Button>
          </Row>
        </>
      )}
    </Col>
  )
}
