import React from 'react'
import { useAppStoreUrl } from 'web/hooks/use-app-store-url'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { Button, SizeType } from './buttons/button'

export function BetSignUpPrompt(props: {
  label?: string
  className?: string
  size?: SizeType
}) {
  const { label, className, size = 'lg' } = props

  const user = useUser()
  const isMobile = useIsMobile()
  const appStoreUrl = useAppStoreUrl()

  const text = label || (isMobile ? 'Get the app' : 'Sign up for updates')

  const callback = isMobile
    ? () => window.open(appStoreUrl)
    : withTracking(firebaseLogin, 'sign up to bet')

  return user === null ? (
    <Button
      onClick={callback}
      className={className}
      size={size}
      color="gradient"
    >
      {text}
    </Button>
  ) : null
}
