import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Lover, useLover } from 'love/hooks/use-lover'
import { RequiredLoveUserForm } from 'love/components/required-lover-form'
import { OptionalLoveUserForm } from 'love/components/optional-lover-form'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { GoogleSignInButton } from 'web/components/buttons/sign-up-button'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'

export default function SignupPage() {
  const [newLover, setNewLover] = useState<Lover>()
  const lover = useLover()
  const user = useUser()
  console.log(lover)
  return (
    <Col className="items-center">
      <Col className={'bg-canvas-0 w-full max-w-2xl px-6 py-4'}>
        {user === undefined ? (
          <LoadingIndicator />
        ) : user === null ? (
          <Col className={'h-[30rem] items-center justify-around gap-4'}>
            <Title className={''}>Bet on love</Title>
            <span className={clsx('text-8xl')}>❤️‍🔥</span>
            <Row>
              <GoogleSignInButton onClick={firebaseLogin} />
            </Row>
          </Col>
        ) : !newLover && lover === null ? (
          <RequiredLoveUserForm
            user={user}
            onSuccess={(lover) => setNewLover(lover)}
          />
        ) : newLover || lover ? (
          <OptionalLoveUserForm lover={(newLover || lover) as Lover} />
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Col>
  )
}
export const colClassName = 'items-start gap-2'
export const labelClassName = 'font-semibold text-lg'
