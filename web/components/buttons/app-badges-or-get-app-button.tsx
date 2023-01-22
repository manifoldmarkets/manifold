import { isAndroid, isIOS } from 'web/lib/util/device'
import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { MobileAppsQRCodeButton } from 'web/components/buttons/mobile-apps-qr-code-button'
import React, { useEffect } from 'react'
import { getNativePlatform } from 'web/lib/native/is-native'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'

export const AppBadgesOrGetAppButton = (props: {
  size?: 'lg' | 'md'
  className?: string
  hideOnDesktop?: boolean
}) => {
  const { size, className, hideOnDesktop } = props
  const { isNative } = getNativePlatform()
  const [navigatorReady, setNavigatorReady] = React.useState(false)
  useEffect(() => {
    if (navigator) setNavigatorReady(true)
  }, [])

  if (isNative || !navigatorReady) return <div />

  const isIOSDevice = isIOS()
  const isAndroidDevice = isAndroid()
  return (
    <Col className={clsx('w-full', className)}>
      {isAndroidDevice ? (
        <a className="-ml-1" href={GOOGLE_PLAY_APP_URL}>
          <img
            className={size === 'lg' ? 'w-44' : 'w-36'}
            alt="Get it on Google Play"
            src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
          />
        </a>
      ) : isIOSDevice ? (
        <a className="ml-1" href={APPLE_APP_URL}>
          <img
            className={size === 'lg' ? 'w-36' : 'w-26'}
            src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83&amp;releaseDate=1668902400&h=9016541b6bb4c335b714be9b2a57b4bf"
            alt="Download on the App Store"
          />
        </a>
      ) : (
        !hideOnDesktop && <MobileAppsQRCodeButton size={size} />
      )}
    </Col>
  )
}
