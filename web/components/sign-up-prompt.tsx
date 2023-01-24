import React from 'react'

import { useABTest } from 'web/hooks/use-ab-test'
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

  const text = useABTest('sign up prompt text', {
    started: 'Get started',
    updates: 'Get updates on this market',
    bet: 'Sign up to bet',
    predict: 'Add your prediction',
  })

  return user === null ? (
    <Button
      onClick={withTracking(firebaseLogin, 'sign up to bet')}
      className={className}
      size={size}
      color="gradient"
    >
      {label ?? text ?? ''}
    </Button>
  ) : null
}
