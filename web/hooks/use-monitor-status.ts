import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { GPSData } from 'common/gidx/gidx'
import { MINUTE_MS } from 'common/util/time'
import { User } from 'common/user'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useEvent } from 'web/hooks/use-event'

export const useMonitorStatus = (
  polling: boolean,
  user: User | undefined | null
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

  useNativeMessages(['location'], (type, data) => {
    if ('error' in data) {
      setMonitorStatus('error')
      setMonitorStatusMessage(data.error)
    } else {
      setLocation(data as GPSData)
    }
  })

  const requestLocation = () => {
    setMonitorStatusMessage(undefined)
    console.log('Requesting location')
    if (getIsNative()) {
      postMessageToNative('locationRequested', {})
    } else if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Got location:', position)
          const { coords } = position
          const loc = {
            Latitude: coords.latitude,
            Longitude: coords.longitude,
            Radius: coords.accuracy,
            Altitude: coords.altitude ?? 0,
            Speed: coords.speed ?? 0,
            DateTime: new Date().toISOString(),
          }
          setLocation(loc)
          fetchMonitorStatusWithLocation(loc)
        },
        (error) => {
          console.error('Error getting location:', error)
          setMonitorStatusMessage(error.message)
          setMonitorStatus('error')
        }
      )
    } else {
      setMonitorStatus('error')
      setMonitorStatusMessage('Geolocation is not supported by your browser.')
    }
  }

  const fetchMonitorStatus = useEvent(async () => {
    if (!user || user.idStatus !== 'verified') {
      setMonitorStatus('error')
      setMonitorStatusMessage('User not verified')
      return {
        status: 'error',
        message: 'User not verified',
      }
    }
    setMonitorStatusMessage(undefined)
    setLoading(true)
    if (!location) requestLocation()
    else return fetchMonitorStatusWithLocation(location)
  })

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
        return response
      } catch (error) {
        console.error('Error fetching monitor status:', error)
        setMonitorStatus('error')
        setMonitorStatusMessage('Failed to fetch monitor status')
        setLoading(false)
        return { status: 'error', message: error }
      }
    }
  )

  useEffect(() => {
    if (!polling) return
    fetchMonitorStatus()

    const interval = setInterval(fetchMonitorStatus, 20 * MINUTE_MS)
    return () => clearInterval(interval)
  }, [fetchMonitorStatus])

  return { monitorStatus, monitorStatusMessage, fetchMonitorStatus, loading }
}
