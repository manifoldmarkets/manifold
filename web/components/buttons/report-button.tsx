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
import { getIsNative } from 'web/lib/native/is-native'

export function ReportButton(props: {
  userId: string
  label: 'user' | 'market' | 'comment'
  icon?: React.ReactNode
  name?: string
  noModal?: boolean
}) {
  const { userId, name, noModal, label, icon } = props
  const currentUser = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isReported, setIsReported] = useState(false)
  const isNative = getIsNative()
  if (!currentUser || currentUser.id === userId || !isNative) return null
  const report = async () => {
    // TODO: file report
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsReported(true)
  }

  const onReport = async () => {
    await toast.promise(report(), {
      loading: 'Reporting...',
      success: `${capitalize(label)} reported! Admins will take a look asap.`,
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
          <Title>Report {name ? name : label}</Title>
          <span className={'mb-4 text-sm'}>
            {isReported
              ? `You've reported this ${label}. Administrators wil take a look at them as soon as possible.`
              : `Report this ${label}`}
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
    </>
  )
}
