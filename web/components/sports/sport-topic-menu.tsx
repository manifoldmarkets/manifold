import { BookmarkIcon } from '@heroicons/react/outline'
import {
  BookmarkIcon as FilledBookmarkIcon,
  ChevronDownIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { BiSolidVolumeMute } from 'react-icons/bi'
import { Group } from 'common/group'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'
import { buildArray } from 'common/util/array'
import { removeEmojis } from 'common/util/string'
import { blockGroup, unBlockGroup } from 'web/components/topics/topic-dropdown'
import {
  internalFollowTopic,
  internalUnfollowTopic,
} from 'web/components/topics/topics-button'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/widgets/dropdown-menu'
import { useIsFollowingTopic } from 'web/hooks/use-group-supabase'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'

/**
 * Follow or block the topic behind a sports page. The button says which you
 * do now (Follow, Following, Blocked); its menu does either, and says what
 * each does. Blocking unfollows. Signed-out visitors get the sign-in prompt.
 * Icon-only on phones, where the heading needs the room.
 */
export function SportTopicMenu(props: { topic: Group }) {
  const { topic } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const { isFollowing, setIsFollowing } = useIsFollowingTopic(topic.slug)
  // What the last block or unblock did, until the private user catches up.
  const [blockedNow, setBlockedNow] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const blocked =
    blockedNow ?? !!privateUser?.blockedGroupSlugs?.includes(topic.slug)
  const name = removeEmojis(topic.name).trim() || topic.name
  const canFollow = !TOPIC_IDS_YOU_CANT_FOLLOW.includes(topic.id)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }
  // The follow helpers toast their own failures and resolve whether it went
  // through: a failure leaves the button as it was.
  const follow = () =>
    run(async () => {
      if (await internalFollowTopic(user, topic)) setIsFollowing(true)
    })
  const unfollow = () =>
    run(async () => {
      if (await internalUnfollowTopic(user, topic)) setIsFollowing(false)
    })
  const setBlock = (block: boolean) =>
    run(async () => {
      if (!user) {
        await firebaseLogin()
        return
      }
      try {
        await (block ? blockGroup(topic.slug) : unBlockGroup(topic.slug))
      } catch {
        toast.error(`Couldn't ${block ? 'block' : 'unblock'} ${name}`)
        return
      }
      setBlockedNow(block)
      if (block) {
        setIsFollowing(false)
        toast(`Blocked ${name}. Its markets won't show in your feeds.`)
      } else {
        toast(`Unblocked ${name}.`)
      }
    })

  const state = blocked ? 'Blocked' : isFollowing ? 'Following' : 'Follow'
  const Icon = blocked
    ? BiSolidVolumeMute
    : isFollowing
    ? FilledBookmarkIcon
    : BookmarkIcon
  const items = buildArray<DropdownItem>(
    canFollow &&
      !blocked && {
        name: isFollowing ? 'Unfollow' : 'Follow',
        icon: isFollowing ? (
          <BookmarkIcon className="h-5 w-5" />
        ) : (
          <FilledBookmarkIcon className="h-5 w-5" />
        ),
        buttonContent: (
          <ItemText
            title={`${isFollowing ? 'Unfollow' : 'Follow'} ${name}`}
            detail={
              isFollowing ? undefined : 'See its markets in your home feed.'
            }
          />
        ),
        onClick: isFollowing ? unfollow : follow,
      },
    {
      name: blocked ? 'Unblock' : 'Block',
      icon: <BiSolidVolumeMute className="h-5 w-5" />,
      buttonContent: (
        <ItemText
          title={`${blocked ? 'Unblock' : 'Block'} ${name}`}
          detail={
            blocked
              ? 'Its markets show in your feeds again.'
              : 'Hides its markets from your feeds.'
          }
        />
      ),
      onClick: () => setBlock(!blocked),
    }
  )

  return (
    <DropdownMenu
      items={items}
      closeOnClick
      buttonDisabled={busy || (!!user && isFollowing === undefined)}
      menuWidth="w-72"
      anchor={{ to: 'bottom end', gap: 8, padding: 8 }}
      buttonContent={(open) => (
        <span
          className={clsx(
            'flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center gap-1 rounded-md border px-2.5 text-sm font-medium transition-colors sm:px-3',
            busy && 'opacity-60',
            blocked
              ? 'border-ink-300 bg-ink-100 text-ink-700 hover:bg-ink-200'
              : isFollowing
              ? 'border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100'
              : 'border-ink-200 bg-canvas-0 text-ink-700 hover:bg-canvas-50'
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{state}</span>
          <span className="sr-only">{`${state}: follow or block ${name}`}</span>
          <ChevronDownIcon
            className={clsx(
              'h-4 w-4 transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </span>
      )}
    />
  )
}

function ItemText(props: { title: string; detail?: string }) {
  const { title, detail } = props
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-ink-900 truncate font-medium">{title}</span>
      {detail && <span className="text-ink-500 text-xs">{detail}</span>}
    </span>
  )
}

/**
 * Under a blocked topic's heading, where its own page still shows it: what
 * blocking it does everywhere else.
 */
export function BlockedTopicNotice() {
  return (
    <span className="inline-flex items-center gap-1">
      <BiSolidVolumeMute className="h-4 w-4 shrink-0" aria-hidden />
      Blocked: its markets are hidden from your feeds.
    </span>
  )
}

/** Whether the visitor blocked this topic. */
export function useIsTopicBlocked(topic: Group | undefined) {
  const privateUser = usePrivateUser()
  return !!topic && !!privateUser?.blockedGroupSlugs?.includes(topic.slug)
}
