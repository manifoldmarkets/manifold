import { Button } from 'web/components/buttons/button'
import { useMonitorStatus } from 'web/hooks/use-monitor-status'
import { useEvent } from 'web/hooks/use-event'
import { User } from 'common/user'
import { Col } from '../layout/col'
import { Contract } from 'common/contract'

export const LocationMonitor = (props: {
  contract: Contract
  user: User | undefined | null
  setIsOpen: (isOpen: boolean) => void
  isOpen: boolean
}) => {
  const { user, contract, setIsOpen, isOpen } = props

  const {
    fetchMonitorStatus,
    requestLocation,
    loading,
    monitorStatus,
    monitorStatusMessage,
  } = useMonitorStatus(contract.token === 'CASH', user, () => setIsOpen(true))
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
  if (!user || !isOpen || !user.idVerified) {
    return null
  }
  return (
    <Col className="gap-2 p-2">
      <span className="text-xl font-semibold">Location Required</span>
      <p>
        You must share your location to participate in sweepstakes. Please allow
        location sharing.
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
  )
}
