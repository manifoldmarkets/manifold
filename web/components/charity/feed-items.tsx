import { Avatar } from '../widgets/avatar'
import { manaToUSD } from 'common/util/format'
import { RelativeTimestamp } from '../relative-timestamp'
import { UserLink } from 'web/components/widgets/user-link'

export function Donation(props: {
  userId: string
  amount: number
  ts: number
}) {
  const { userId, amount, ts } = props
  return (
    <div className="mb-2 flow-root pr-2 md:pr-0">
      <div className="text-ink-700 relative flex items-center gap-x-2">
        <Avatar userId={userId} size="xs" />
        <div className="min-w-0 flex-1">
          <p className="mt-0.5 text-sm">
            {userId ? <UserLink userId={userId} /> : <>Someone</>} donated{' '}
            {manaToUSD(amount)}
            <RelativeTimestamp time={ts} />
          </p>
        </div>
      </div>
    </div>
  )
}
