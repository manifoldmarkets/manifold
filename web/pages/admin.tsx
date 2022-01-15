import { Page } from '../components/page'
import { Grid } from 'gridjs-react'
import 'gridjs/dist/theme/mermaid.css'
import { html } from 'gridjs'
import dayjs from 'dayjs'
import { useUsers } from '../hooks/use-users'

function avatarHtml(avatarUrl: string) {
  return `<img
  class="h-10 w-10 rounded-full bg-gray-400 flex items-center justify-center"
  src="${avatarUrl}"
  alt=""
/>`
}

export default function Admin() {
  let users = useUsers()
  // Sort users by createdTime descending, by default
  users = users.sort((a, b) => b.createdTime - a.createdTime)

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
          {
            id: 'username',
            name: 'Username',
            formatter: (cell) =>
              html(`<a 
              class="hover:underline hover:decoration-indigo-400 hover:decoration-2"
              href="/${cell}">@${cell}</a>`),
          },
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
          {
            id: 'id',
            name: 'ID',
            formatter: (cell) =>
              html(`<a
              class="hover:underline hover:decoration-indigo-400 hover:decoration-2"
              href="https://console.firebase.google.com/project/mantic-markets/firestore/data/~2Fusers~2F${cell}">${cell}</a>`),
          },
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
