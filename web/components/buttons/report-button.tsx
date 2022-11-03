import { useUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { toast } from 'react-hot-toast'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { capitalize } from 'lodash'
import { collection, doc, setDoc } from 'firebase/firestore'
import { Report, ReportContentTypes } from 'common/report'
import { db } from 'web/lib/firebase/init'
import { removeUndefinedProps } from 'common/util/object'

export function ReportButton(props: {
  contentType: ReportContentTypes
  contentOwnerId: string
  contentId: string
  parentId?: string
  parentType?: 'post' | 'contract'
  description?: string
  contentName?: string
  icon?: React.ReactNode
  noModal?: boolean
}) {
  const {
    noModal,
    contentType,
    icon,
    contentOwnerId,
    contentId,
    parentId,
    description,
    contentName,
    parentType,
  } = props
  const currentUser = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isReported, setIsReported] = useState(false)
  const label = contentType === 'contract' ? 'market' : contentType
  if (!currentUser || currentUser.id === contentOwnerId) return <div />
  const report = async () => {
    // create the report doc in the db
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
    setIsReported(true)
  }

  const onReport = async () => {
    await toast.promise(report(), {
      loading: 'Reporting...',
      success: `${capitalize(
        label
      )} reported! Admins will take a look within 24 hours.`,
      error: `Error reporting ${label}`,
    })
  }

  return (
    <>
      <Button
        color={'gray-white'}
        onClick={() => {
          noModal ? onReport() : setIsModalOpen(true)
        }}
      >
        {icon ? icon : 'Report'}
      </Button>
      <Modal open={isModalOpen} setOpen={setIsModalOpen}>
        <Col className={'rounded-md bg-white p-4'}>
          <Title>Report {contentName ? contentName : label}</Title>
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
                Report {contentType}
              </Button>
            )}
          </Row>
        </Col>
      </Modal>
    </>
  )
}
