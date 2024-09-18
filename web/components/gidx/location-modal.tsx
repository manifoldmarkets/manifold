import { Button } from 'web/components/buttons/button'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { useState } from 'react'
import { useMonitorStatus } from 'web/hooks/use-monitor-status'
import { useEvent } from 'web/hooks/use-event'
import { User } from 'common/user'
import { Col } from '../layout/col'

export const LocationModal = (props: { user: User | undefined | null }) => {
  const { user } = props
  const [isOpen, setIsOpen] = useState(false)
  const {
    fetchMonitorStatus,
    requestLocation,
    loading,
    monitorStatus,
    monitorStatusMessage,
  } = useMonitorStatus(true, user, () => setIsOpen(true))
  const getLocation = useEvent(() => {
    requestLocation((location) => {
      if (!location) {
        return
      }
      // may need to pass location to fetchMonitorStatus
      fetchMonitorStatus()
      setIsOpen(false)
    })
  })
  return (
    <Modal className={MODAL_CLASS} open={isOpen}>
      <Col className="gap-2 p-2">
        <span className="text-xl font-semibold">Location Required</span>
        <p>
          You must share your location to participate in sweepstakes. Please
          allow location sharing.
        </p>
        <div className="mt-2 flex justify-end">
          <Button loading={loading} onClick={getLocation} className="ml-2">
            Share Location
          </Button>
        </div>
        {monitorStatus === 'error' && (
          <span className="mt-2 text-red-500">{monitorStatusMessage}</span>
        )}
      </Col>
    </Modal>
  )
}
