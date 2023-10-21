import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Lover } from 'love/hooks/use-lover'
import { RequiredLoveUserForm } from 'love/components/required-lover-form'
import { OptionalLoveUserForm } from 'love/components/optional-lover-form'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { GoogleSignInButton } from 'web/components/buttons/sign-up-button'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { createLover } from 'web/lib/firebase/love/api'
import { useRouter } from 'next/router'
import { set } from 'lodash'
import { initialRequiredState, initialOptionalState } from 'common/love/lover'
import { Row as rowFor } from 'common/supabase/utils'

export default function SignupPage() {
  const [newLover, setNewLover] = useState<Lover>()
  const user = useUser()
  const router = useRouter()
  // Omit the id, created_time?
  const [loverForm, setLoverForm] = useState<rowFor<'lovers'>>({
    ...initialRequiredState,
    ...initialOptionalState,
  } as any)

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
        ) : !newLover ? (
          <RequiredLoveUserForm
            user={user}
            setLoverState={(key, value) => {
              setLoverForm((prevState) => set({ ...prevState }, key, value))
            }}
            loverState={loverForm}
            onSubmit={async () => {
              if (!loverForm.looking_for_matches) {
                router.push('profiles')
                return
              }
              const res = await createLover({
                ...loverForm,
              }).catch((e) => {
                console.error(e)
                return null
              })
              if (res && res.lover) {
                setNewLover({ ...res.lover, user } as Lover)
              }
            }}
          />
        ) : newLover ? (
          <OptionalLoveUserForm lover={newLover} />
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Col>
  )
}
export const colClassName = 'items-start gap-2'
export const labelClassName = 'font-semibold text-lg'
