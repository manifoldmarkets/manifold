import { useUser } from 'web/hooks/use-user'
import { Button, IconButton } from 'web/components/buttons/button'
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
import { Tooltip } from 'web/components/widgets/tooltip'
import { FlagIcon } from '@heroicons/react/outline'
import { User } from 'common/user'

export function ReportButton(props: {
  iconButton?: boolean
  noModal?: boolean
  report: Omit<Report, 'id' | 'createdTime' | 'userId'>
}) {
  const { noModal, iconButton, report } = props
  const { contentOwnerId, contentType } = report
  const currentUser = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isReported, setIsReported] = useState(false)
  const label = contentType === 'contract' ? 'market' : contentType
  if (!currentUser || currentUser.id === contentOwnerId) return <div />

  const onReport = async () => {
    if (!currentUser) return
    await toast.promise(reportContent(currentUser, report), {
      loading: 'Reporting...',
      success: `${capitalize(
        label
      )} reported! Admins will take a look within 24 hours.`,
      error: `Error reporting ${label}`,
    })
    setIsReported(true)
  }
  return (
    <>
      {iconButton ? (
        <Tooltip text={`Report ${label}`}>
          <IconButton
            size={'2xs'}
            onClick={() => {
              noModal ? onReport() : setIsModalOpen(true)
            }}
          >
            <FlagIcon
              className={
                'h-5 w-5 text-gray-500 hover:text-gray-600 disabled:text-gray-200'
              }
            />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          color={'gray-white'}
          onClick={() => {
            noModal ? onReport() : setIsModalOpen(true)
          }}
        >
          {isReported ? 'Reported' : 'Report'}
        </Button>
      )}
      <ReportModal
        isModalOpen={isModalOpen}
        label={label}
        setIsModalOpen={setIsModalOpen}
        report={report}
      />
    </>
  )
}
const reportContent = async (
  currentUser: User,
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
  const reportDoc = await doc(collection(db, 'reports'))
  await setDoc(
    reportDoc,
    removeUndefinedProps({
      id: reportDoc.id,
      userId: currentUser.id,
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
    await toast.promise(reportContent(currentUser, report), {
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
      <Col className={'rounded-md bg-white p-4'}>
        <Title>Report {label}</Title>
        <span className={'mb-4 text-sm'}>
          {isReported
            ? `You've reported this ${label}. Our team will take a look within 24 hours.`
            : `Report this ${label} for objectionable content that violates our Terms of Service.`}
        </span>
        <Row className={'justify-between'}>
          <Button color={'gray-white'} onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          {isReported ? (
            <Button
              size="sm"
              color="gray-outline"
              className="my-auto"
              disabled={true}
            >
              Reported
            </Button>
          ) : (
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
