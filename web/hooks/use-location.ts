import {
  ENABLE_FAKE_CUSTOMER,
  FAKE_CUSTOMER_BODY,
  GPSData,
} from 'common/gidx/gidx'
import { postMessageToNative } from 'web/lib/native/post-message'
import { MINUTE_MS } from 'common/util/time'
import { useNativeMessages } from './use-native-messages'
import { useEvent } from './use-event'
import { useNativeInfo } from 'web/components/native-message-provider'
import { removeUndefinedProps } from 'common/util/object'

const MAX_RETRIES = 1 // Will try both high and low accuracy

export const useLocation = (
  setLocationError: (error: string | undefined) => void,
  setLoading: (loading: boolean) => void,
  onFinishPermissionCheck: (location?: GPSData) => void,
  onFinishLocationCheck?: (location?: GPSData) => void
) => {
  const { version, isNative } = useNativeInfo()
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

  const checkLocationPermission = useEvent(async () => {
    setLoading(true)
    // We added locationPermissionStatusRequested handling at the same time as native version capability
    if (isNative && version) {
      postMessageToNative('locationPermissionStatusRequested', {})
      return
    }
    if ('permissions' in navigator) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: 'geolocation',
        })
        switch (permissionStatus.state) {
          case 'granted':
            console.log('Location permission already granted')
            requestLocation(onFinishPermissionCheck)
            break
          case 'prompt':
            console.log('Location permission has not been requested yet')
            setLoading(false)
            onFinishPermissionCheck()
            break
          case 'denied':
            console.log('Location permission has been denied')
            setLoading(false)
            onFinishPermissionCheck()
            break
        }
      } catch (error) {
        console.error('Error checking geolocation permission:', error)
        setLoading(false)
        onFinishPermissionCheck()
      }
    } else {
      console.error('Permissions API not supported')
      setLoading(false)
      onFinishPermissionCheck()
    }
  })

  useNativeMessages(['locationPermissionStatus'], (type, data) => {
    const { status } = data
    console.log('Native location permission status', status)
    if (status === 'granted') {
      requestLocation(onFinishPermissionCheck)
    } else {
      onFinishPermissionCheck()
      setLoading(false)
    }
  })

  useNativeMessages(['location'], (type, data) => {
    console.log('Native location', data)
    if ('error' in data) {
      setLoading(false)
      setLocationError(data.error)
      onFinishLocationCheck?.()
    } else {
      setLoading(false)
      onFinishLocationCheck?.(data as GPSData)
    }
  })

  const getCurrentPosition = useEvent(
    (
      options: PositionOptions,
      onSuccess: (position: GeolocationPosition) => void,
      onError: (error: GeolocationPositionError) => void
    ) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(onSuccess, onError, options)
      } else {
        onError({
          code: 2,
          message: 'Geolocation is not supported by your browser.',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        })
      }
    }
  )

  const requestLocation = useEvent(
    (overrideOnFinishCallback?: (location?: GPSData) => void) => {
      const onFinish = overrideOnFinishCallback ?? onFinishLocationCheck
      setLocationError(undefined)
      setLoading(true)

      if (isNative) {
        console.log('requesting location from native')
        postMessageToNative('locationRequested', {})
        return
      }

      const handleSuccess = (position: GeolocationPosition) => {
        const { coords } = position
        const location = {
          Latitude: coords.latitude,
          Longitude: coords.longitude,
          Radius: coords.accuracy,
          Altitude: coords.altitude ?? 0,
          Speed: coords.speed ?? 0,
          DateTime: new Date().toISOString(),
        }
        setLoading(false)
        onFinish?.(
          ENABLE_FAKE_CUSTOMER ? FAKE_CUSTOMER_BODY.DeviceGPS : location
        )
      }

      const handleError = (
        error: GeolocationPositionError,
        retryCount: number = 0,
        wasHighAccuracy: boolean = true
      ) => {
        console.error(
          `Error requesting location (attempt ${
            retryCount + 1
          }, highAccuracy: ${wasHighAccuracy})`,
          error
        )

        // If this is a timeout or position unavailable error and we haven't exceeded retries
        if (
          retryCount < MAX_RETRIES &&
          (error.code === 2 || error.code === 3)
        ) {
          // Toggle high accuracy for next attempt
          const nextHighAccuracy = !wasHighAccuracy
          const timeout = isSafari
            ? nextHighAccuracy
              ? 10000 // Shorter timeout for high accuracy
              : 60000 // Longer timeout for low accuracy
            : undefined

          console.log(
            `Retrying location request (attempt ${
              retryCount + 1
            } of ${MAX_RETRIES}) with` +
              ` high accuracy ${nextHighAccuracy ? 'enabled' : 'disabled'}`
          )

          // Keep loading state true during retry
          setLoading(true)
          getCurrentPosition(
            removeUndefinedProps({
              enableHighAccuracy: nextHighAccuracy,
              maximumAge: 20 * MINUTE_MS,
              timeout,
            }),
            handleSuccess,
            (retryError) =>
              handleError(retryError, retryCount + 1, nextHighAccuracy)
          )
          return
        }

        // If we've exhausted retries or got a non-retryable error
        if (error.message.includes('denied')) {
          setLocationError(
            'Location permission denied. Please enable location sharing in your browser settings.'
          )
        } else {
          switch (error.code) {
            case 1: // PERMISSION_DENIED
              setLocationError(
                'Location access was denied. Please enable location sharing in your browser settings.'
              )
              break
            case 2: // POSITION_UNAVAILABLE
              setLocationError(
                'Unable to determine your location. Please ensure location services are enabled in your system settings.'
              )
              break
            case 3: // TIMEOUT
              setLocationError(
                'Location request timed out. Please check your connection and try again.'
              )
              break
            default:
              setLocationError(error.message)
          }
        }
        // Only set loading to false after all retries are exhausted or on non-retryable error
        setLoading(false)
        onFinish?.()
      }

      // First attempt with high accuracy enabled
      setLoading(true) // Ensure loading is true at the start
      getCurrentPosition(
        removeUndefinedProps({
          enableHighAccuracy: true,
          maximumAge: 20 * MINUTE_MS,
          timeout: isSafari ? 10000 : undefined,
        }),
        handleSuccess,
        (error) => handleError(error, 0, true)
      )
    }
  )

  return { requestLocation, checkLocationPermission }
}
