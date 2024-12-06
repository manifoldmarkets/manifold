import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User } from 'web/lib/firebase/users'
import { trackCallback } from 'web/lib/service/analytics'
import { Avatar } from '../widgets/avatar'
import { CoinNumber } from '../widgets/coin-number'

export function ProfileSummary(props: { user: User; className?: string }) {
  const { user, className } = props

  const currentPage = usePathname() ?? ''
  const url = `/${user.username}`
  return (
    <Link
      href={url}
      onClick={trackCallback('sidebar: profile')}
      className={clsx(
        'text-ink-700 hover:bg-primary-100 hover:text-ink-900 group flex w-full shrink-0 flex-row items-center truncate rounded-md py-3',
        className,
        currentPage === url && 'bg-ink-100 text-primary-700'
      )}
    >
      <div className="w-2 shrink" />
      <Avatar
        avatarUrl={user.avatarUrl}
        username={user.username}
        noLink
        size="md"
      />
      <div className="mr-1 w-2 shrink-[2]" />
      <div className="shrink-0 grow">
        <div className="flex items-center text-sm">
          <CoinNumber
            amount={user?.balance}
            numberType="animated"
            className="mr-1 text-violet-600 dark:text-violet-400"
          />
          <span>🎁</span>
        </div>
        <CoinNumber
          className="text-sm text-amber-600 dark:text-amber-400"
          amount={user.cashBalance}
          coinType="sweepies"
        />
      </div>
      <div className="w-2 shrink" />
    </Link>
  )
}
