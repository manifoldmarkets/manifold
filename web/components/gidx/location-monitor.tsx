import { Button } from 'web/components/buttons/button'
import { useMonitorStatus } from 'web/hooks/use-monitor-status'
import { User } from 'common/user'
import { Col } from '../layout/col'
import { Contract } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { useState, useEffect } from 'react'

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

  const showLoadingNote = useShowAfterLoadingTime(loading, 5)

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
      {showLoadingNote && (
        <span className="text-warning mt-2">
          Loading location may take a while, hold on!
        </span>
      )}
      {monitorStatus !== 'success' && (
        <span className="mt-2 text-red-500">{monitorStatusMessage}</span>
      )}
    </Col>
  )
}

export const useShowAfterLoadingTime = (
  loading: boolean,
  thresholdMS: number
) => {
  const [loadingTime, setLoadingTime] = useState(0)
  const [showLoadingNote, setShowLoadingNote] = useState(false)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (loading) {
      timer = setInterval(() => {
        setLoadingTime((prev) => prev + 1)
      }, 1000)
    } else {
      setLoadingTime(0)
      setShowLoadingNote(false)
    }

    if (loadingTime > thresholdMS) {
      setShowLoadingNote(true)
    }

    return () => clearInterval(timer)
  }, [loading, loadingTime, thresholdMS])

  return showLoadingNote
}
