import { Col } from 'web/components/layout/col'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { firebaseLogout } from 'web/lib/firebase/users'

export default function SignInWaiting() {
  useRedirectIfSignedIn()
  const [showSignOutButton, setShowSignOutButton] = useState(false)

  // Allow user to sign out if they've arrived here erroneously
  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowSignOutButton(true)
    }, 5000)
    return () => clearTimeout(timeout)
  }, [])
  return (
    <Col className="h-[100vh] items-center justify-center">
      <img
        className="mb-6 block -scale-x-100 self-center"
        src="/logo-flapping-with-money.gif"
        width={200}
        height={200}
      />
      {showSignOutButton && (
        <Button color={'gray'} onClick={firebaseLogout}>
          Try again
        </Button>
      )}
    </Col>
  )
}
