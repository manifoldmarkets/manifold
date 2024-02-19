import { User } from 'common/user'
import { Avatar } from '../widgets/avatar'
import { manaToUSD } from 'common/util/format'
import { RelativeTimestamp } from '../relative-timestamp'
import { UserLink } from 'web/components/widgets/user-link'
import { UserHovercard } from '../user/user-hovercard'

export function Donation(props: { user: User; amount: number; ts: number }) {
  const { user, amount, ts } = props
  return (
    <div className="mb-2 flow-root pr-2 md:pr-0">
      <div className="text-ink-700 relative flex items-center gap-x-2">
        <UserHovercard userId={user.id}>
          <Avatar
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size="xs"
          />
        </UserHovercard>
        <div className="min-w-0 flex-1">
          <p className="mt-0.5 text-sm">
            {user ? (
              <UserHovercard userId={user.id}>
                <UserLink user={user} />
              </UserHovercard>
            ) : (
              <>Someone</>
            )}{' '}
            donated {manaToUSD(amount)}
            <RelativeTimestamp time={ts} />
          </p>
        </div>
      </div>
    </div>
  )
}
