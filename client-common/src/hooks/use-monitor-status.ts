import { useEffect, useState } from 'react'
import { GPSData } from 'common/gidx/gidx'
import { MINUTE_MS } from 'common/util/time'
import { User } from 'common/user'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useEvent } from './use-event'

export type LocationHook = {
  requestLocation: (onFinishCallback?: (location?: GPSData) => void) => void
  checkLocationPermission: () => void
}

export const useMonitorStatus = (
  polling: boolean,
  user: User | undefined | null,
  checkLocationPermission: () => void,
  getMonitorStatus: (location: GPSData) => Promise<{
    status: string
    message?: string
  }>
) => {
  const [monitorStatus, setMonitorStatus] = usePersistentInMemoryState<
    string | undefined
  >(undefined, 'user-monitor-status')
  const [monitorStatusMessage, setMonitorStatusMessage] =
    usePersistentInMemoryState<string | undefined>(
      undefined,
      'user-monitor-status-error'
    )
  const [loading, setLoading] = useState(false)
  const [lastApiCallTime, setLastApiCallTime] =
    usePersistentInMemoryState<number>(0, 'user-monitor-last-api-call-time')

  const fetchMonitorStatus = useEvent(async (location?: GPSData) => {
    if (!user) {
      return
    }
    if (!user.idVerified) {
      setMonitorStatus('error')
      setMonitorStatusMessage('User not verified')
      return {
        status: 'error',
        message: 'User not verified',
      }
    }
    setMonitorStatusMessage(undefined)
    setLoading(true)
    if (!location) {
      checkLocationPermission()
    } else return fetchMonitorStatusWithLocation(location)
  })

  const fetchMonitorStatusWithLocation = useEvent(async (location: GPSData) => {
    try {
      setLoading(true)
      const response = await getMonitorStatus(location)
      const { status, message } = response
      setLoading(false)
      setMonitorStatus(status)
      setMonitorStatusMessage(message)
      setLastApiCallTime(Date.now())
      return response
    } catch (error) {
      setMonitorStatus('error')
      setMonitorStatusMessage('Failed to fetch monitor status')
      setLoading(false)
      return { status: 'error', message: error }
    }
  })

  useEffect(() => {
    if (!polling || !user) return

    const currentTime = Date.now()
    const timeSinceLastCall = currentTime - lastApiCallTime

    if (timeSinceLastCall > 20 * MINUTE_MS) {
      fetchMonitorStatus()
    }

    const interval = setInterval(fetchMonitorStatus, 20 * MINUTE_MS)
    return () => clearInterval(interval)
  }, [polling, user?.idVerified])

  return {
    setMonitorStatus,
    setMonitorStatusMessage,
    monitorStatus,
    monitorStatusMessage,
    fetchMonitorStatus,
    loading,
    fetchMonitorStatusWithLocation,
  }
}
