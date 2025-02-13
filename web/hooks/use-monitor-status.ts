import { useState } from 'react'
import { api } from 'web/lib/api/api'
import { GPSData } from 'common/gidx/gidx'
import { User } from 'common/user'
import { useLocation } from './use-location'
import { useMonitorStatus as useMonitorStatusCommon } from 'client-common/hooks/use-monitor-status'

export const useMonitorStatus = (
  polling: boolean,
  user: User | undefined | null,
  promptUserToShareLocation?: () => void,
  onFinishLocationRequest?: (location?: GPSData) => void
) => {
  const [loading, setLoading] = useState(false)
  const setLocationError = (error: string | undefined) => {
    setMonitorStatus('error')
    setMonitorStatusMessage(error)
  }
  const getMonitorStatus = async (location: GPSData) => {
    return api('get-monitor-status-gidx', {
      DeviceGPS: location,
    })
  }

  const { requestLocation, checkLocationPermission } = useLocation(
    setLocationError,
    setLoading,
    (location?: GPSData) => {
      if (location) {
        fetchMonitorStatusWithLocation(location)
        return
      }
      if (promptUserToShareLocation) {
        promptUserToShareLocation()
      } else {
        requestLocation()
      }
    },
    (location?: GPSData) => {
      if (location) {
        fetchMonitorStatusWithLocation(location)
      }
      onFinishLocationRequest?.(location)
    }
  )

  const {
    monitorStatus,
    setMonitorStatus,
    monitorStatusMessage,
    fetchMonitorStatus,
    fetchMonitorStatusWithLocation,
    setMonitorStatusMessage,
  } = useMonitorStatusCommon(
    polling,
    user,
    checkLocationPermission,
    getMonitorStatus
  )

  return {
    monitorStatus,
    monitorStatusMessage,
    fetchMonitorStatus,
    loading,
    requestLocationThenFetchMonitorStatus: requestLocation,
  }
}
