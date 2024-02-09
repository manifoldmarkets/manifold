import clsx from 'clsx'

import { buildArray } from 'common/util/array'
import DropdownMenu, { DropdownItem } from '../comments/dropdown-menu'
import { useIsFollowing } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import {
  DotsVerticalIcon,
  MinusCircleIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import { onFollowClick } from '../buttons/follow-button'
import { updateUserDisinterestEmbedding } from 'web/lib/firebase/api'
import { Contract } from 'common/contract'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import toast from 'react-hot-toast'
import { TiVolume, TiVolumeMute } from 'react-icons/ti'
import { useAdmin } from 'web/hooks/use-admin'
import { InformationCircleIcon } from '@heroicons/react/outline'
import { useUserById } from 'web/hooks/use-user-supabase'

export function FeedDropdown(props: {
  contract: Contract
  item: FeedTimelineItem | undefined
  interesting: boolean
  toggleInteresting: () => void
  importanceScore: number
}) {
  const { contract, item, importanceScore, interesting, toggleInteresting } =
    props
  const user = useUser()
  const isAdmin = useAdmin()
  const creatorId = item?.creatorId ?? contract.creatorId
  const creator = useUserById(creatorId)
  const { isFollowing, setIsFollowing } = useIsFollowing(user?.id, creatorId)

  const markUninteresting = async () => {
    await updateUserDisinterestEmbedding({
      contractId: contract.id,
      creatorId,
      feedId: item?.id,
      // Currently interesting, toggling to not remove contract from disinterests
      removeContract: !interesting,
    })
    if (interesting)
      toast(`We won't show you content like that again`, {
        icon: <TiVolumeMute className={'h-5 w-5 text-teal-500'} />,
      })
    toggleInteresting()
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
      onClick: () => onFollowClick(creatorId, isFollowing, setIsFollowing),
    },
    user && {
      name: interesting ? 'Show less of this' : 'Undo show less of this',
      icon: interesting ? (
        <TiVolumeMute className="h-5 w-5" aria-hidden />
      ) : (
        <TiVolume className="h-5 w-5" aria-hidden />
      ),
      onClick: () => markUninteresting(),
    },
    isAdmin && {
      name: 'Why am I seeing this?',
      icon: <InformationCircleIcon className="h-5 w-5" aria-hidden />,
      onClick: () =>
        toast(
          item?.dataType +
            ' : ' +
            item?.reasons?.join(', ') +
            ', importance: ' +
            importanceScore.toPrecision(2)
        ),
    }
  ) as DropdownItem[]

  if (!user) return <></>

  return (
    <DropdownMenu
      items={feedCardOptions}
      icon={<DotsVerticalIcon className={clsx('h-5 w-5')} />}
      menuWidth={'w-60'}
      menuItemsClass="bg-canvas-50"
    />
  )
}
