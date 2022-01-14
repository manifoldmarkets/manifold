import { Page } from '../components/page'
import { Grid } from 'gridjs-react'
import 'gridjs/dist/theme/mermaid.css'
import { useEffect, useState } from 'react'
import { User } from '../../common/user'
import { listenForAllUsers } from '../lib/firebase/users'
import { html } from 'gridjs'
import dayjs from 'dayjs'

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    listenForAllUsers(setUsers)
  }, [])

  return users
}

function avatarHtml(avatarUrl: string) {
  return `<img
  class="h-10 w-10 rounded-full bg-gray-400 flex items-center justify-center"
  src="${avatarUrl}"
  alt=""
/>`
}

export default function Admin() {
  const users = useUsers()

  return (
    <Page wide>
      <Grid
        data={users}
        columns={[
          {
            id: 'avatarUrl',
            name: 'Avatar',
            formatter: (cell) => html(avatarHtml(cell as string)),
          },
          'Username',
          'Email',
          {
            id: 'createdTime',
            name: 'Created Time',
            formatter: (cell) => dayjs(cell as number).format('MMM D, h:mma'),
          },
          {
            id: 'balance',
            name: 'Balance',
            formatter: (cell) => (cell as number).toFixed(0),
          },
          'ID',
        ]}
        search={true}
        sort={true}
        pagination={{
          enabled: true,
          limit: 25,
        }}
      />
    </Page>
  )
}
