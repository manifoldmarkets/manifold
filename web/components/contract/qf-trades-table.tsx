import { QuadraticFundingContract } from 'common/contract'
import { QfTxn } from 'common/txn'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useUsersById } from 'web/hooks/use-user'
import { formatTimeShort } from 'web/lib/util/time'
import { UserAvatarAndBadge } from '../widgets/user-link'

type QfEntry = {
  id: string
  from: string
  to: string
  amount: string
  time: string
}

const titles = ['From', 'Entry', 'Amount', 'Time']
const keys = ['from', 'answer', 'amount', 'time']

export default function QfTradesTable(props: {
  contract: QuadraticFundingContract
  txns: QfTxn[]
}) {
  const { contract, txns } = props

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
      return '🏦'
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

  const getText = (txn: QfTxn) =>
    contract.answers.find((a) => a.id === txn.data?.answerId)?.text

  // TODO: Condense PAY_MANA/TRANFER pairs into a single row
  const entries = txns.map((txn) => ({
    id: txn.id,
    from: formatWalletId(txn.fromType, txn.fromId),
    to: formatWalletId(txn.toType, txn.toId),
    answer: getText(txn) ?? formatWalletId(txn.toType, txn.toId),
    amount: formatMoney(txn.amount),
    time: formatTimeShort(txn.createdTime),
  })) as QfEntry[]

  return (
    <div className="mt-8 flex flex-col">
      <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
          <div className="ring-ink-1000 overflow-hidden shadow ring-1 ring-opacity-5 md:rounded-lg">
            <table className="divide-ink-300 min-w-full divide-y">
              <thead className="bg-canvas-50">
                <tr>
                  {titles.map((title) => (
                    <th
                      key={title}
                      scope="col"
                      className="text-ink-900 whitespace-nowrap px-2 py-3.5 text-left text-sm font-semibold"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-ink-1000">
                {entries.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className={i % 2 === 0 ? undefined : 'bg-ink-100'}
                  >
                    {keys.map((key) => (
                      <td
                        className="text-ink-500 max-w-[10rem] truncate whitespace-nowrap px-2 py-0.5 text-sm"
                        key={key}
                      >
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
