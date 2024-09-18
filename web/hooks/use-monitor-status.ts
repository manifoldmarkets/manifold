import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { GPSData } from 'common/gidx/gidx'
import { MINUTE_MS } from 'common/util/time'
import { User } from 'common/user'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useEvent } from 'web/hooks/use-event'
import { useLocation } from './use-location'

export const useMonitorStatus = (
  polling: boolean,
  user: User | undefined | null,
  promptUserToShareLocation?: () => void
) => {
  const [location, setLocation] = usePersistentInMemoryState<
    GPSData | undefined
  >(undefined, 'user-monitor-location')
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

  useNativeMessages(['location'], (type, data) => {
    if ('error' in data) {
      setMonitorStatus('error')
      setMonitorStatusMessage(data.error)
    } else {
      setLocation(data as GPSData)
    }
  })
  const setLocationError = (error: string | undefined) => {
    setMonitorStatus('error')
    setMonitorStatusMessage(error)
  }
  const { checkedPermissions, requestLocation, checkLocationPermission } =
    useLocation(setLocation, setLocationError, setLoading)

  const fetchMonitorStatus = useEvent(async () => {
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

  useEffect(() => {
    if (checkedPermissions && !location) {
      if (promptUserToShareLocation) {
        promptUserToShareLocation()
      } else {
        requestLocation()
      }
    } else if (checkedPermissions && location) {
      fetchMonitorStatusWithLocation(location)
    }
  }, [checkedPermissions, location])

  const fetchMonitorStatusWithLocation = useEvent(
    async (location: GPSData | undefined) => {
      if (!location) {
        setMonitorStatus('error')
        setMonitorStatusMessage(
          'Location not available, please enable and try again'
        )
        setLoading(false)
        return {
          status: 'error',
          message: 'Location not available',
        }
      }
      try {
        const response = await api('get-monitor-status-gidx', {
          DeviceGPS: location,
        })
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
    }
  )

  useEffect(() => {
    if (!polling || !user) return

    const currentTime = Date.now()
    const timeSinceLastCall = currentTime - lastApiCallTime

    if (timeSinceLastCall > 20 * MINUTE_MS) {
      fetchMonitorStatus()
    }

    const interval = setInterval(fetchMonitorStatus, 20 * MINUTE_MS)
    return () => clearInterval(interval)
  }, [polling, fetchMonitorStatus, lastApiCallTime, user?.idVerified])

  return {
    monitorStatus,
    monitorStatusMessage,
    fetchMonitorStatus,
    loading,
    requestLocation,
  }
}
