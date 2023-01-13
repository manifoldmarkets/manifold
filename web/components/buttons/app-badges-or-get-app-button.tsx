import { isAndroid, isIOS } from 'web/lib/util/device'
import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { MobileAppsQRCodeButton } from 'web/components/buttons/mobile-apps-qr-code-button'
import React from 'react'
import { getNativePlatform } from 'web/lib/native/is-native'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'

export const AppBadgesOrGetAppButton = (props: {
  size?: 'lg' | 'md'
  className?: string
}) => {
  const { isNative } = getNativePlatform()
  if (isNative) return <div />

  const { size, className } = props
  return (
    <Col className={clsx('w-full', className)}>
      {isAndroid() ? (
        <a className="badge" href={GOOGLE_PLAY_APP_URL}>
          <img
            className={size === 'lg' ? 'w-44' : 'w-36'}
            alt="Get it on Google Play"
            src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
          />
        </a>
      ) : isIOS() ? (
        <a className="badge" href={APPLE_APP_URL}>
          <img
            className={size === 'lg' ? 'w-36' : 'w-26'}
            src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83&amp;releaseDate=1668902400&h=9016541b6bb4c335b714be9b2a57b4bf"
            alt="Download on the App Store"
          />
        </a>
      ) : (
        <MobileAppsQRCodeButton size={size} />
      )}
    </Col>
  )
}
