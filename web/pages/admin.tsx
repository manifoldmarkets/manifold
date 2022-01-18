import { Page } from '../components/page'
import { Grid } from 'gridjs-react'
import 'gridjs/dist/theme/mermaid.css'
import { html } from 'gridjs'
import dayjs from 'dayjs'
import { useUsers } from '../hooks/use-users'
import { useUser } from '../hooks/use-user'
import Custom404 from './404'
import { useContracts } from '../hooks/use-contracts'

function avatarHtml(avatarUrl: string) {
  return `<img
  class="h-10 w-10 rounded-full bg-gray-400 flex items-center justify-center"
  src="${avatarUrl}"
  alt=""
/>`
}

function UsersTable() {
  let users = useUsers()
  // Sort users by createdTime descending, by default
  users = users.sort((a, b) => b.createdTime - a.createdTime)

  return (
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
          formatter: (cell) =>
            html(
              `<span class="whitespace-nowrap">${dayjs(cell as number).format(
                'MMM D, h:mma'
              )}</span>`
            ),
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
  )
}

function ContractsTable() {
  let contracts = useContracts() ?? []
  // Sort users by createdTime descending, by default
  contracts.sort((a, b) => b.createdTime - a.createdTime)
  contracts = contracts.filter((contract) => !contract.isResolved)

  return (
    <Grid
      data={contracts}
      columns={[
        {
          id: 'creatorUsername',
          name: 'Username',
          formatter: (cell) =>
            html(`<a 
              class="hover:underline hover:decoration-indigo-400 hover:decoration-2"
              target="_blank"
              href="/${cell}">@${cell}</a>`),
        },
        {
          id: 'question',
          name: 'Question',
          formatter: (cell) => cell,
        },
        {
          id: 'volume24Hours',
          name: '24 hour vol',
          formatter: (cell) => (cell as number).toFixed(0),
        },
        {
          id: 'closeTime',
          name: 'Close time',
          formatter: (cell) =>
            html(
              `<span class="whitespace-nowrap">${dayjs(cell as number).format(
                'MMM D, h:mma'
              )}</span>`
            ),
        },
        {
          id: 'visibility',
          name: 'Visibility',
          formatter: (cell) => cell,
        },
        {
          id: 'id',
          name: 'ID',
          formatter: (cell) =>
            html(`<a
              class="hover:underline hover:decoration-indigo-400 hover:decoration-2"
              target="_blank"
              href="https://console.firebase.google.com/project/mantic-markets/firestore/data/~2Fcontracts~2F${cell}">${cell}</a>`),
        },
      ]}
      search={true}
      sort={true}
      pagination={{
        enabled: true,
        limit: 25,
      }}
    />
  )
}

export default function Admin() {
  const user = useUser()
  const adminIds = [
    'igi2zGXsfxYPgB0DJTXVJVmwCOr2', // Austin
    '5LZ4LgYuySdL1huCWe7bti02ghx2', // James
    'tlmGNz9kjXc2EteizMORes4qvWl2', // Stephen
  ]
  const isAdmin = adminIds.includes(user?.id || '')
  return isAdmin ? (
    <Page wide>
      <UsersTable />
      <ContractsTable />
    </Page>
  ) : (
    <Custom404 />
  )
}
