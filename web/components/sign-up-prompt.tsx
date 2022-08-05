import React from 'react'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from './button'

export function SignUpPrompt(props: { label?: string; className?: string }) {
  const { label, className } = props
  const user = useUser()

  return user === null ? (
    <Button
      onClick={withTracking(firebaseLogin, 'sign up to bet')}
      className={className}
      size="lg"
      color="gradient"
    >
      {label ?? 'Sign up to bet!'}
    </Button>
  ) : null
}
