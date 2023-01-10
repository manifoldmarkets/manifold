import { CertTxn } from 'common/txn'
import { User } from 'common/user'
import { formatLargeNumber } from 'common/util/format'
import { useUsersById } from 'web/hooks/use-user'
import { formatTimeShort } from 'web/lib/util/time'
import { UserAvatarAndBadge } from '../widgets/user-link'

type CertEntry = {
  id: string
  from: string
  to: string
  type: string
  token: string
  amount: string
  time: string
}

const titles = ['From', 'To', 'Type', 'Token', 'Amount', 'Time']
const keys = ['from', 'to', 'type', 'token', 'amount', 'time']

export default function CertTradesTable(props: { txns: CertTxn[] }) {
  const { txns } = props

  // Get all referenced userIds from the txns
  const userIds = new Set<string>()
  txns.forEach((txn) => {
    if (txn.fromType === 'USER') {
      userIds.add(txn.fromId)
    }
    if (txn.toType === 'USER') {
      userIds.add(txn.toId)
    }
  })

  // Populate a map of userId -> username
  const users = useUsersById(Array.from(userIds))
  const usersMap = new Map<string, User>()
  users.forEach((user) => {
    if (user) usersMap.set(user.id, user)
  })

  function formatWalletId(type: string, id: string) {
    if (type === 'CONTRACT') {
      return '-'
    } else if (type === 'BANK') {
      return 'Bank'
    } else if (type === 'USER') {
      const user = usersMap.get(id)
      if (!user) return 'Loading'
      return (
        <UserAvatarAndBadge
          name={user.name}
          username={user.username}
          avatarUrl={user.avatarUrl}
          className="!gap-1"
        />
      )
    }
  }

  // TODO: Condense PAY_MANA/TRANFER pairs into a single row
  const entries = txns.map((txn) => ({
    id: txn.id,
    from: formatWalletId(txn.fromType, txn.fromId),
    to: formatWalletId(txn.toType, txn.toId),
    type: txn.category.slice(5), // Remove 'CERT_' prefix
    token: txn.token,
    amount: formatLargeNumber(txn.amount),
    time: formatTimeShort(txn.createdTime),
  })) as CertEntry[]

  return (
    <div className="mt-8 flex flex-col">
      <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  {titles.map((title) => (
                    <th
                      scope="col"
                      className="whitespace-nowrap px-2 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {entries.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className={i % 2 === 0 ? undefined : 'bg-gray-100'}
                  >
                    {keys.map((key) => (
                      <td className="whitespace-nowrap px-2 py-0.5 text-sm text-gray-500">
                        {
                          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                          // @ts-ignore
                          entry[key]
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
