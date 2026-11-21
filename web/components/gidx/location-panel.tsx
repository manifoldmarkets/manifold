/**
 * @fileoverview DEPRECATED - GIDX location verification panel
 *
 * This component is being replaced by idenfy for identity verification.
 */

import { GPSData } from 'common/gidx/gidx'
import { Button } from 'web/components/buttons/button'
import { BottomRow } from './register-component-helpers'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'
import { useLocation } from 'web/hooks/use-location'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { useEffect } from 'react'
import { useNativeInfo } from '../native-message-provider'
import { FirefoxWarning, useShowAfterLoadingTime } from './location-monitor'
import { Col } from '../layout/col'

export const LocationPanel = (props: {
  setLocation: (data: GPSData) => void
  setLocationError: (error: string | undefined) => void
  setLoading: (loading: boolean) => void
  loading: boolean
  locationError: string | undefined
  back: () => void
}) => {
  const {
    setLocation,
    setLocationError,
    setLoading,
    loading,
    locationError,
    back,
  } = props
  const { isNative } = useNativeInfo()
  const showLoadingNote = useShowAfterLoadingTime(loading, 5)

  const { requestLocation, checkLocationPermission } = useLocation(
    setLocationError,
    setLoading,
    (location) => {
      if (location) setLocation(location)
    },
    (location) => {
      if (location) setLocation(location)
    }
  )

  useEffect(() => {
    checkLocationPermission()
  }, [])

  if (loading) {
    return (
      <Col>
        <LoadingIndicator />
        <FirefoxWarning />
        {showLoadingNote && (
          <span className="text-warning mt-2">
            Loading location may take a while, hold on!
          </span>
        )}
      </Col>
    )
  }

  return (
    <>
      <LocationBlockedIcon height={40} className="fill-ink-700 mx-auto" />
      <span className={'mx-auto text-2xl'}>Location required</span>
      <span className="text-ink-700">
        You must allow location sharing to verify that you're in a participating
        municipality.
      </span>
      <FirefoxWarning />
      <BottomRow>
        <Button color={'gray-white'} onClick={back}>
          Back
        </Button>
        <Button
          loading={loading}
          disabled={loading}
          onClick={() => requestLocation()}
        >
          Share location
        </Button>
      </BottomRow>
      {locationError && (
        <span className={'text-error'}>
          {locationError}
          {isNative ? ' Please enable location sharing in your settings.' : ''}
        </span>
      )}
    </>
  )
}
