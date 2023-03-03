import { useUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { toast } from 'react-hot-toast'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import React, { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { capitalize } from 'lodash'
import { collection, doc, setDoc } from 'firebase/firestore'
import { Report } from 'common/report'
import { db } from 'web/lib/firebase/init'
import { removeUndefinedProps } from 'common/util/object'

export function ReportButton(props: {
  report: Omit<Report, 'id' | 'createdTime' | 'userId'>
}) {
  const { report } = props
  const { contentOwnerId, contentType } = report
  const currentUser = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const label = contentType === 'contract' ? 'market' : contentType
  if (!currentUser || currentUser.id === contentOwnerId) return <div />

  return (
    <>
      <Button
        size={'xs'}
        color={'yellow-outline'}
        onClick={() => {
          setIsModalOpen(true)
        }}
      >
        Report
      </Button>
      <ReportModal
        isModalOpen={isModalOpen}
        label={label}
        setIsModalOpen={setIsModalOpen}
        report={report}
      />
    </>
  )
}

export const reportContent = async (
  currentUserId: string,
  report: Omit<Report, 'id' | 'createdTime' | 'userId'>
) => {
  const {
    contentOwnerId,
    contentType,
    parentType,
    parentId,
    contentId,
    description,
  } = report
  const reportDoc = doc(collection(db, 'reports'))
  await setDoc(
    reportDoc,
    removeUndefinedProps({
      id: reportDoc.id,
      userId: currentUserId,
      createdTime: Date.now(),
      contentId,
      contentOwnerId,
      parentId,
      description,
      contentType,
      parentType,
    }) as Report
  )
}

export const ReportModal = (props: {
  isModalOpen: boolean
  setIsModalOpen: (isModalOpen: boolean) => void
  label: string
  report: Omit<Report, 'id' | 'createdTime' | 'userId'>
}) => {
  const { label, report, setIsModalOpen, isModalOpen } = props
  const currentUser = useUser()

  const [isReported, setIsReported] = useState(false)

  const onReport = async () => {
    if (!currentUser) return
    await toast.promise(reportContent(currentUser.id, report), {
      loading: 'Reporting...',
      success: `${capitalize(
        label
      )} reported! Admins will take a look within 24 hours.`,
      error: `Error reporting ${label}`,
    })
    setIsReported(true)
  }

  return (
    <Modal open={isModalOpen} setOpen={setIsModalOpen}>
      <Col className={'bg-canvas-0 rounded-md p-4'}>
        <Title>Report {label}</Title>
        <span className={'mb-4 text-sm'}>
          {isReported
            ? `You've reported this ${label}. Our team will take a look within 24 hours.`
            : `Report this ${label} for objectionable content that violates our Terms of Service.`}
        </span>
        <Row className={'items-center justify-between'}>
          <Button color={'gray-white'} onClick={() => setIsModalOpen(false)}>
            {isReported ? 'Done' : 'Cancel'}
          </Button>
          {!isReported && (
            <Button
              size="sm"
              color="red"
              className="my-auto"
              onClick={withTracking(onReport, 'block')}
            >
              Report {label}
            </Button>
          )}
        </Row>
      </Col>
    </Modal>
  )
}
