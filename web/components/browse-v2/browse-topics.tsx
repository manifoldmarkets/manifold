import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { sortBy } from 'lodash'
import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import toast from 'react-hot-toast'

import { blockGroup, unBlockGroup } from 'web/components/topics/topic-dropdown'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useAsyncData } from 'web/hooks/use-async-data'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { followTopic } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { listGroupsBySlug, unfollowTopic } from 'web/lib/supabase/groups'

type TopicRef = Pick<Group, 'id' | 'slug' | 'name'>

type BrowseTopics = {
  signedIn: boolean
  followed: TopicRef[] | undefined
  hidden: TopicRef[] | undefined
  isFollowing: (slug: string) => boolean
  isHidden: (slug: string) => boolean
  isPending: (slug: string) => boolean
  // Hidden topics, blocked markets and blocked creators. Search drops some of
  // these server-side, but not on every route, so every list checks again.
  isExcluded: (contract: Contract) => boolean
  follow: (topic: TopicRef) => Promise<void>
  unfollow: (topic: TopicRef) => Promise<void>
  hide: (topic: TopicRef) => Promise<void>
  unhide: (topic: TopicRef) => Promise<void>
  // Bumped after a topic change reaches the server, so result lists refetch.
  version: number
}

const BrowseTopicsContext = createContext<BrowseTopics | undefined>(undefined)

// Followed and hidden topics for the signed-in user, with optimistic updates
// so the page reacts before the server round trip finishes. Mount one per
// account (key it by user id) so optimistic state never crosses accounts.
export function BrowseTopicsProvider(props: { children: ReactNode }) {
  const user = useUser()
  const privateUser = usePrivateUser()
  const { data, refresh } = useAPIGetter(
    'get-followed-groups',
    user ? { userId: user.id } : undefined,
    undefined,
    undefined,
    !!user
  )
  const blockedKey = (privateUser?.blockedGroupSlugs ?? []).join(',')
  // Stable identity: the lookup refetches whenever its argument changes.
  const blockedSlugs = useMemo(
    () => (blockedKey ? blockedKey.split(',') : undefined),
    [blockedKey]
  )
  const hiddenGroups = useAsyncData(blockedSlugs, listGroupsBySlug)

  const [followOverrides, setFollowOverrides] = useState<
    Record<string, TopicRef | null>
  >({})
  const [hideOverrides, setHideOverrides] = useState<
    Record<string, TopicRef | null>
  >({})
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const pendingRef = useRef<Set<string>>(new Set())
  const [version, setVersion] = useState(0)

  const followed = useMemo(() => {
    if (!user) return []
    if (!data) return undefined
    const bySlug = new Map<string, TopicRef>(
      data.groups.map((g) => [g.slug, g])
    )
    for (const [slug, topic] of Object.entries(followOverrides)) {
      if (topic) bySlug.set(slug, topic)
      else bySlug.delete(slug)
    }
    return sortBy([...bySlug.values()], (g) => g.name.toLowerCase())
  }, [user?.id, data, followOverrides])

  const hidden = useMemo(() => {
    if (!user) return []
    if (blockedSlugs && !hiddenGroups) return undefined
    const bySlug = new Map<string, TopicRef>(
      (hiddenGroups ?? []).map((g) => [g.slug, g])
    )
    for (const [slug, topic] of Object.entries(hideOverrides)) {
      if (topic) bySlug.set(slug, topic)
      else bySlug.delete(slug)
    }
    return sortBy([...bySlug.values()], (g) => g.name.toLowerCase())
  }, [user?.id, hiddenGroups, blockedSlugs, hideOverrides])

  const isFollowing = (slug: string) =>
    followOverrides[slug] !== undefined
      ? !!followOverrides[slug]
      : !!data?.groups.some((g) => g.slug === slug)
  const isHidden = (slug: string) =>
    hideOverrides[slug] !== undefined
      ? !!hideOverrides[slug]
      : !!blockedSlugs?.includes(slug)
  const blockedContractIds = privateUser?.blockedContractIds
  const blockedUserIds = privateUser?.blockedUserIds
  const isExcluded = (c: Contract) =>
    !!c.groupSlugs?.some(isHidden) ||
    !!blockedContractIds?.includes(c.id) ||
    !!blockedUserIds?.includes(c.creatorId)

  // One request per topic at a time: the controls for a topic are disabled
  // while its change is in flight, so a fast Follow-then-Unfollow can't land
  // on the server in the wrong order.
  const run = async (
    action: string,
    topic: TopicRef,
    apply: () => void,
    revert: () => void,
    call: () => Promise<unknown>
  ) => {
    if (pendingRef.current.has(topic.slug)) return
    pendingRef.current.add(topic.slug)
    setPending((p) => ({ ...p, [topic.slug]: true }))
    track('browse v2 curate', { action, topic: topic.slug })
    apply()
    try {
      await call()
      setVersion((v) => v + 1)
    } catch (error) {
      revert()
      toast.error(
        `Couldn't update ${topic.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      pendingRef.current.delete(topic.slug)
      setPending((p) => ({ ...p, [topic.slug]: false }))
    }
  }

  const value: BrowseTopics = {
    signedIn: !!user,
    followed,
    hidden,
    isFollowing,
    isHidden,
    isPending: (slug) => !!pending[slug],
    isExcluded,
    version,
    follow: (topic) =>
      run(
        'follow',
        topic,
        () => setFollowOverrides((o) => ({ ...o, [topic.slug]: topic })),
        () => setFollowOverrides((o) => ({ ...o, [topic.slug]: null })),
        async () => {
          await followTopic({ groupId: topic.id })
          refresh()
        }
      ),
    unfollow: (topic) =>
      run(
        'unfollow',
        topic,
        () => setFollowOverrides((o) => ({ ...o, [topic.slug]: null })),
        () => setFollowOverrides((o) => ({ ...o, [topic.slug]: topic })),
        async () => {
          if (!user) return
          await unfollowTopic(topic.id, user.id)
          refresh()
        }
      ),
    hide: (topic) =>
      run(
        'hide',
        topic,
        () => setHideOverrides((o) => ({ ...o, [topic.slug]: topic })),
        () => setHideOverrides((o) => ({ ...o, [topic.slug]: null })),
        () => blockGroup(topic.slug)
      ),
    unhide: (topic) =>
      run(
        'unhide',
        topic,
        () => setHideOverrides((o) => ({ ...o, [topic.slug]: null })),
        () => setHideOverrides((o) => ({ ...o, [topic.slug]: topic })),
        () => unBlockGroup(topic.slug)
      ),
  }

  return (
    <BrowseTopicsContext.Provider value={value}>
      {props.children}
    </BrowseTopicsContext.Provider>
  )
}

export function useBrowseTopics() {
  const value = useContext(BrowseTopicsContext)
  if (!value) throw new Error('useBrowseTopics needs BrowseTopicsProvider')
  return value
}
