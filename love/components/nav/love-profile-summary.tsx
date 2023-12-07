import { useState } from 'react'
import Link from 'next/link'
import { PlusIcon } from '@heroicons/react/outline'
import { animated } from '@react-spring/web'

import { User } from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { Avatar } from 'web/components/widgets/avatar'
import { trackCallback } from 'web/lib/service/analytics'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import clsx from 'clsx'
import { useLover } from 'love/hooks/use-lover'

export function ProfileSummary(props: { user: User; className?: string }) {
  const { user, className } = props

  const lover = useLover()

  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const balance = useAnimatedNumber(user.balance)

  return (
    <Link
      href={`/${user.username}`}
      onClick={trackCallback('sidebar: profile')}
      className={clsx(
        'hover:bg-ink-100 text-ink-700 group flex w-full shrink-0 flex-row items-center truncate rounded-md py-3',
        className
      )}
    >
      <div className="w-2 shrink" />
      <Avatar
        avatarUrl={lover?.pinned_url ?? ''}
        username={user.username}
        noLink
      />
      <div className="mr-1 w-2 shrink-[2]" />
      <div className="shrink-0 grow">
        <div className="group-hover:text-primary-700">{user.name}</div>
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
