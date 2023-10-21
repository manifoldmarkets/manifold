import { useState } from 'react'
import { Lover } from 'love/hooks/use-lover'
import { Row as rowFor } from 'common/supabase/utils'
import { Col } from 'web/components/layout/col'
import { getUserAndPrivateUser, User } from 'web/lib/firebase/users'
import { RequiredLoveUserForm } from 'love/components/required-lover-form'
import { OptionalLoveUserForm } from 'love/components/optional-lover-form'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { PrivateUser } from 'common/user'
import { getLoverRow } from 'love/lib/supabase/lovers'
import dayjs from 'dayjs'

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  const { user, privateUser } = await getUserAndPrivateUser(creds.uid)
  const loverRow = await getLoverRow(user.id)

  return { props: { auth: { user, privateUser }, loverRow } }
})
export default function ProfilePage(props: {
  auth: { user: User; privateUser: PrivateUser }
  loverRow: rowFor<'lovers'>
}) {
  const { auth, loverRow } = props
  const { user } = auth
  const [lover, setLover] = useState<Lover>({
    ...loverRow,
    birthdate: dayjs(loverRow.birthdate).format('YYYY-MM-DD'),
    user,
  })

  return (
    <Col className="items-center">
      <Col className={'bg-canvas-0 w-full max-w-2xl px-6 py-4'}>
        <RequiredLoveUserForm
          user={user}
          setLoverState={(key, value) => {
            setLover((prevState) => ({ ...prevState, [key]: value }))
          }}
          loverState={lover}
          loverCreatedAlready={true}
        />
        <div className={'h-4'} />
        <OptionalLoveUserForm lover={lover} butonLabel={'Save'} />
      </Col>
    </Col>
  )
}
