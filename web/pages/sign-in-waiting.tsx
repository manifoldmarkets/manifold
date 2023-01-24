import { Col } from 'web/components/layout/col'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'

export default function SignInWaiting() {
  useRedirectIfSignedIn()
  return (
    <Col className="h-[100vh] items-center justify-center">
      <img
        className="mb-6 block -scale-x-100 self-center"
        src="/logo-flapping-with-money.gif"
        width={200}
        height={200}
      />
    </Col>
  )
}
