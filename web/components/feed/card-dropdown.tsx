import clsx from 'clsx'

import { buildArray } from 'common/util/array'
import DropdownMenu, { DropdownItem } from '../widgets/dropdown-menu'
import { useIsFollowing } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import {
  DotsVerticalIcon,
  MinusCircleIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { useRef } from 'react'
import toast from 'react-hot-toast'
import { TiVolume, TiVolumeMute } from 'react-icons/ti'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import {
  markUninterestedWithToast,
  setUninterested,
  uninterestedLabel,
  UninterestedMenuLabel,
} from '../contract/uninterested'

export function FeedDropdown(props: {
  contract: Contract
  itemCreatorId: string | undefined
  interesting: boolean
  setInteresting: (interesting: boolean) => void
  importanceScore: number
}) {
  const { contract, itemCreatorId, interesting, setInteresting } = props
  const user = useUser()
  const creatorId = itemCreatorId ?? contract.creatorId
  const creator = useDisplayUserById(creatorId)
  const { isFollowing, toggleFollow } = useIsFollowing(user?.id, creatorId)
  const pendingUninterested = useRef(false)

  const toggleUninterested = async () => {
    if (pendingUninterested.current) return
    pendingUninterested.current = true
    try {
      if (interesting) {
        await markUninterestedWithToast(contract, 'feed card', () =>
          setInteresting(true)
        )
        setInteresting(false)
      } else {
        await setUninterested(contract, false, 'feed card')
        setInteresting(true)
        toast('Restored to your feed')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      pendingUninterested.current = false
    }
  }

  const feedCardOptions = buildArray(
    user && {
      name: isFollowing
        ? `Unfollow ${creator?.name ?? contract.creatorName}`
        : `Follow ${creator?.name ?? contract.creatorName}`,
      icon: isFollowing ? (
        <MinusCircleIcon className="h-5 w-5" aria-hidden />
      ) : (
        <PlusCircleIcon className="h-5 w-5" aria-hidden />
      ),
      onClick: toggleFollow,
    },
    user &&
      user.id !== contract.creatorId && {
        name: uninterestedLabel(!interesting),
        buttonContent: <UninterestedMenuLabel uninterested={!interesting} />,
        icon: interesting ? (
          <TiVolumeMute className="h-5 w-5" aria-hidden />
        ) : (
          <TiVolume className="h-5 w-5" aria-hidden />
        ),
        onClick: () => toggleUninterested(),
      }
  ) as DropdownItem[]

  if (!user) return <></>

  return (
    <DropdownMenu
      items={feedCardOptions}
      buttonContent={<DotsVerticalIcon className={clsx('h-5 w-5')} />}
      menuWidth={'w-60'}
      menuItemsClass="bg-canvas-50"
    />
  )
}
