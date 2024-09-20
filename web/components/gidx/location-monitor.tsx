import { Button } from 'web/components/buttons/button'
import { useMonitorStatus } from 'web/hooks/use-monitor-status'
import { User } from 'common/user'
import { Col } from '../layout/col'
import { Contract } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'

export const LocationMonitor = (props: {
  contract: Contract
  user: User | undefined | null
  setShowPanel: (isOpen: boolean) => void
  showPanel: boolean
}) => {
  const { user, contract, setShowPanel, showPanel } = props

  const {
    fetchMonitorStatus,
    requestLocation,
    loading,
    monitorStatus,
    monitorStatusMessage,
  } = useMonitorStatus(
    contract.token === 'CASH',
    user,
    () => setShowPanel(true),
    (location) => {
      if (location) {
        fetchMonitorStatus(location)
        setShowPanel(false)
      }
    }
  )
  if (!user || !showPanel || !user.idVerified) {
    return null
  }
  return (
    <Col className="py-2">
      <span className="text-xl font-semibold">
        Location required to participate in sweepstakes
      </span>
      <div className="mt-2 flex">
        <Button size="xl" loading={loading} onClick={() => requestLocation()}>
          Share location to {TRADE_TERM}
        </Button>
      </div>
      {monitorStatus === 'error' && (
        <span className="mt-2 text-red-500">{monitorStatusMessage}</span>
      )}
    </Col>
  )
}
