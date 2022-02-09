import { Page } from '../components/page'
import { Grid } from 'gridjs-react'
import 'gridjs/dist/theme/mermaid.css'
import { html } from 'gridjs'
import dayjs from 'dayjs'
import { usePrivateUsers, useUsers } from '../hooks/use-users'
import { useUser } from '../hooks/use-user'
import Custom404 from './404'
import { useContracts } from '../hooks/use-contracts'
import _ from 'lodash'
import { useAdmin } from '../hooks/use-admin'

function avatarHtml(avatarUrl: string) {
  return `<img
  class="h-10 w-10 rounded-full bg-gray-400 flex items-center justify-center"
  src="${avatarUrl}"
  alt=""
/>`
}

function UsersTable() {
  let users = useUsers()
  let privateUsers = usePrivateUsers()

  // Map private users by user id
  const privateUsersById = _.mapKeys(privateUsers, 'id')
  console.log('private users by id', privateUsersById)

  // For each user, set their email from the PrivateUser
  users = users.map((user) => {
    // @ts-ignore
    user.email = privateUsersById[user.id]?.email
    return user
  })

  // Sort users by createdTime descending, by default
  users = users.sort((a, b) => b.createdTime - a.createdTime)

  function exportCsv() {
    const csv = users
      // @ts-ignore
      .map((u) => [u.email, u.name].join(', '))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'manifold-users.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
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
      <button className="btn" onClick={exportCsv}>
        Export emails to CSV
      </button>
    </>
  )
}

function ContractsTable() {
  let contracts = useContracts() ?? []
  // Sort users by createdTime descending, by default
  contracts.sort((a, b) => b.createdTime - a.createdTime)

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
          formatter: (cell) => html(`<div class="w-60">${cell}</div>`),
        },
        {
          id: 'volume24Hours',
          name: '24h vol',
          formatter: (cell) => (cell as number).toFixed(0),
        },
        {
          id: 'createdTime',
          name: 'Created time',
          formatter: (cell) =>
            html(
              `<span class="whitespace-nowrap">${dayjs(cell as number).format(
                'MMM D, h:mma'
              )}</span>`
            ),
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
          id: 'resolvedTime',
          name: 'Resolved time',
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
  return useAdmin() ? (
    <Page wide>
      <UsersTable />
      <ContractsTable />
    </Page>
  ) : (
    <Custom404 />
  )
}
