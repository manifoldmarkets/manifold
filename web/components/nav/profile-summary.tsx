import { useState } from 'react'
import Link from 'next/link'
import { PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { usePathname } from 'next/navigation'

import { User } from 'web/lib/firebase/users'
import { Avatar } from '../widgets/avatar'
import { trackCallback } from 'web/lib/service/analytics'
import { AddFundsModal } from '../add-funds-modal'
import { AnimatedManaCoinNumber } from '../widgets/manaCoinNumber'
import { SPICE_PRODUCTION_ENABLED } from 'common/envs/constants'
import { formatMoneyNoMoniker } from 'common/util/format'

export function ProfileSummary(props: { user: User; className?: string }) {
  const { user, className } = props

  const [buyModalOpen, setBuyModalOpen] = useState(false)
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
        <div>{user.name}</div>
        <div className="flex items-center text-sm">
          <AnimatedManaCoinNumber
            amount={user?.balance ?? 0}
            className="mr-2"
          />
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
        {SPICE_PRODUCTION_ENABLED && (
          <div className="text-sm">
            SP {formatMoneyNoMoniker(user.spiceBalance)}
          </div>
        )}
      </div>
      <div className="w-2 shrink" />
    </Link>
  )
}
