import { useState } from 'react'
import { Row as rowFor } from 'common/supabase/utils'
import { Col } from 'web/components/layout/col'
import { getUserAndPrivateUser, User } from 'web/lib/firebase/users'
import { RequiredLoveUserForm } from 'love/components/required-lover-form'
import { OptionalLoveUserForm } from 'love/components/optional-lover-form'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { PrivateUser } from 'common/user'
import dayjs from 'dayjs'
import { useUser } from 'web/hooks/use-user'
import { getLoverRow, Lover } from 'common/love/lover'
import { db } from 'web/lib/supabase/db'

export const getServerSideProps = redirectIfLoggedOut('/', async (_, creds) => {
  const { user, privateUser } = await getUserAndPrivateUser(creds.uid)
  const loverRow = await getLoverRow(user.id, db)

  return { props: { auth: { user, privateUser }, loverRow } }
})
export default function ProfilePage(props: {
  auth: { user: User; privateUser: PrivateUser }
  loverRow: rowFor<'lovers'>
}) {
  const { auth, loverRow } = props
  const user = useUser() ?? auth.user
  const [lover, setLover] = useState<Lover>({
    ...loverRow,
    birthdate: dayjs(loverRow.birthdate).format('YYYY-MM-DD'),
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
          showAvatar={true}
        />
      </Col>
    </Col>
  )
}
