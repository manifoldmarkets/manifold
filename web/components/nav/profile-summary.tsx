import { PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { SPICE_PRODUCTION_ENABLED } from 'common/envs/constants'
import { formatMoneyNoMoniker } from 'common/util/format'
import { User } from 'web/lib/firebase/users'
import { trackCallback } from 'web/lib/service/analytics'
import { AddFundsModal } from '../add-funds-modal'
import { Avatar } from '../widgets/avatar'
import { CoinNumber } from '../widgets/manaCoinNumber'

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
        {!SPICE_PRODUCTION_ENABLED && <div>{user.name}</div>}
        <div className="flex items-center text-sm">
          <CoinNumber
            amount={user?.balance}
            numberType="animated"
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
          <CoinNumber className="text-sm" amount={user.spiceBalance} isSpice />
        )}
      </div>
      <div className="w-2 shrink" />
    </Link>
  )
}
