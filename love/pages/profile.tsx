import { useState, useEffect } from 'react'
import Router from 'next/router'

import { Row as rowFor } from 'common/supabase/utils'
import { Col } from 'web/components/layout/col'
import { RequiredLoveUserForm } from 'love/components/required-lover-form'
import { OptionalLoveUserForm } from 'love/components/optional-lover-form'
import { User } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { Lover } from 'common/love/lover'
import { useLover } from 'love/hooks/use-lover'

export default function ProfilePage() {
  const user = useUser()
  const lover = useLover()

  useEffect(() => {
    if (user === null || lover === null) {
      Router.replace('/')
    }
  }, [user])

  return user && lover && <ProfilePageInner user={user} lover={lover} />
}
function ProfilePageInner(props: { user: User; lover: Lover }) {
  const { user } = props

  const [lover, setLover] = useState<Lover>({
    ...props.lover,
    user,
  })

  const setLoverState = (key: keyof rowFor<'lovers'>, value: any) => {
    setLover((prevState) => ({ ...prevState, [key]: value }))
  }

  return (
    <Col className="items-center">
      <Col className={'bg-canvas-0 w-full max-w-2xl px-6 py-4'}>
        <RequiredLoveUserForm
          user={user}
          setLover={setLoverState}
          lover={lover}
          loverCreatedAlready={true}
        />
        <div className={'h-4'} />
        <OptionalLoveUserForm
          lover={lover}
          user={user}
          setLover={setLoverState}
          butonLabel={'Save'}
        />
      </Col>
    </Col>
  )
}
