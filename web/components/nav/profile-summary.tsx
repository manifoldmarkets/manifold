import { useState } from 'react'
import Link from 'next/link'
import { PlusIcon } from '@heroicons/react/outline'
import { animated } from '@react-spring/web'

import { User } from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { Avatar } from '../widgets/avatar'
import { trackCallback } from 'web/lib/service/analytics'
import { AddFundsModal } from '../add-funds-modal'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import clsx from 'clsx'
import { FaWallet } from 'react-icons/fa'
import { usePathname } from 'next/navigation'

export function ProfileSummary(props: {
  user: User
  className?: string
  showProfile?: boolean
}) {
  const { user, className, showProfile } = props

  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const balance = useAnimatedNumber(user.balance)
  const currentPage = usePathname() ?? ''
  const url = showProfile ? `/${user.username}` : `/${user.username}/portfolio`
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
      {showProfile ? (
        <Avatar
          avatarUrl={user.avatarUrl}
          username={user.username}
          noLink
          size={'sm'}
        />
      ) : (
        <FaWallet className="h-6 w-6 shrink-0" />
      )}
      <div className="mr-1 w-2 shrink-[2]" />
      <div className="shrink-0 grow">
        <div>{user.name}</div>
        <div className="flex items-center text-sm">
          <span className="mr-2">
            <animated.div>{balance.to((b) => formatMoney(b))}</animated.div>
          </span>
          <button
            className="hover:bg-ink-300 rounded-md p-1 ring-[1.5px] ring-inset ring-current"
            onClick={(e) => {
              e.preventDefault()
              setBuyModalOpen(true)
            }}
          >
            <div className="sr-only">Get mana</div>
            <PlusIcon className="h-2 w-2" strokeWidth="4.5" />
          </button>
          <AddFundsModal open={buyModalOpen} setOpen={setBuyModalOpen} />
        </div>
      </div>
      <div className="w-2 shrink" />
    </Link>
  )
}
