import Link from 'next/link'

import { User } from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { Avatar } from '../widgets/avatar'
import { trackCallback } from 'web/lib/service/analytics'
import { useState } from 'react'
import { AddFundsModal } from '../add-funds-modal'
import { PlusIcon } from '@heroicons/react/outline'
import { animated } from '@react-spring/web'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'

export function ProfileSummary(props: { user: User }) {
  const { user } = props

  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const balance = useAnimatedNumber(user.balance)

  return (
    <Link
      href={`/${user.username}`}
      onClick={trackCallback('sidebar: profile')}
      className="text-ink-500 hover:bg-ink-100 hover:text-ink-700 group mb-3 flex flex-shrink-0 flex-row items-center gap-4 rounded-md py-3"
    >
      <Avatar avatarUrl={user.avatarUrl} username={user.username} noLink />
      <div className="truncate">
        <div>{user.name}</div>
        <div className="flex items-center text-sm">
          <span className="mr-2">
            <animated.div>
              {balance.to((b) => formatMoney(b))}
            </animated.div>
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
    </Link>
  )
}
