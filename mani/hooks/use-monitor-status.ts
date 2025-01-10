import { useState } from 'react'
import { api } from 'lib/api'
import { GPSData } from 'common/gidx/gidx'
import { User } from 'common/user'
import * as Location from 'expo-location'
import { useMonitorStatus as useMonitorStatusCommon } from 'client-common/hooks/use-monitor-status'

const useExpoLocation = (
  setLocationError: (error: string | undefined) => void,
  setLoading: (loading: boolean) => void,
  onFinishPermissionCheck: (location?: GPSData) => void,
  onFinishLocationCheck?: (location?: GPSData) => void
) => {
  const requestLocation = async (
    overrideOnFinishCallback?: (location?: GPSData) => void
  ) => {
    const onFinish = overrideOnFinishCallback ?? onFinishLocationCheck
    setLocationError(undefined)
    setLoading(true)

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocationError('Permission to access location was denied')
        setLoading(false)
        onFinish?.()
        return
      }

      const location = await Location.getCurrentPositionAsync({})
      const gpsData: GPSData = {
        Latitude: location.coords.latitude,
        Longitude: location.coords.longitude,
        Radius: location.coords.accuracy || 0,
        Altitude: location.coords.altitude || 0,
        Speed: location.coords.speed || 0,
        DateTime: new Date().toISOString(),
      }
      setLoading(false)
      onFinish?.(gpsData)
    } catch (error: any) {
      setLocationError(error.message)
      setLoading(false)
      onFinish?.()
    }
  }

  const checkLocationPermission = async () => {
    setLoading(true)
    try {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (status === 'granted') {
        requestLocation(onFinishPermissionCheck)
      } else {
        onFinishPermissionCheck()
      }
    } catch (error: any) {
      setLocationError(error.message)
      onFinishPermissionCheck()
    }
    setLoading(false)
  }

  return { requestLocation, checkLocationPermission }
}

export const useMonitorStatus = (
  polling: boolean,
  user: User | undefined | null,
  promptUserToShareLocation?: () => void,
  onFinishLocationRequest?: (location?: GPSData) => void
) => {
  const [loading, setLoading] = useState(false)

  const getMonitorStatus = async (location: GPSData) => {
    return api('get-monitor-status-gidx', {
      DeviceGPS: location,
    })
  }

  const setLocationError = (error: string | undefined) => {
    setMonitorStatus('error')
    setMonitorStatusMessage(error)
  }

  const { requestLocation, checkLocationPermission } = useExpoLocation(
    setLocationError,
    setLoading,
    (location?: GPSData) => {
      if (location) {
        getMonitorStatus(location)
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
        getMonitorStatus(location)
      }
      onFinishLocationRequest?.(location)
    }
  )

  const {
    monitorStatus,
    monitorStatusMessage,
    fetchMonitorStatus,
    setMonitorStatus,
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
