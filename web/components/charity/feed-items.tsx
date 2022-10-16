import { DonationTxn } from 'common/txn'
import { Avatar } from '../widgets/avatar'
import { useUserById } from 'web/hooks/use-user'
import { manaToUSD } from '../../../common/util/format'
import { RelativeTimestamp } from '../relative-timestamp'
import { UserLink } from 'web/components/widgets/user-link'

export function Donation(props: { txn: DonationTxn }) {
  const { txn } = props
  const user = useUserById(txn.fromId)

  if (!user) {
    return <>Loading...</>
  }

  return (
    <div className="mb-2 flow-root pr-2 md:pr-0">
      <div className="relative flex items-center space-x-3">
        <Avatar username={user.username} avatarUrl={user.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="mt-0.5 text-sm text-gray-500">
            <UserLink
              className="text-gray-500"
              username={user.username}
              name={user.name}
            />{' '}
            donated {manaToUSD(txn.amount)}
            <RelativeTimestamp time={txn.createdTime} />
          </p>
        </div>
      </div>
    </div>
  )
}
