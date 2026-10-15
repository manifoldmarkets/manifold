import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useEvent } from 'client-common/hooks/use-event'
import { run } from 'common/supabase/utils'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'

type LikeState = {
  userId: string | undefined
  values: Record<string, boolean>
  error: boolean
}

/** Account likes for loaded games, using the same records/API as market hearts. */
export function useGameLikes(gameIds: string[]) {
  const user = useUser()
  const userId = user?.id
  const idsKey = JSON.stringify([...new Set(gameIds)].sort())
  const [state, setState] = useState<LikeState>({
    userId,
    values: {},
    error: false,
  })
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const requests = useRef(0)
  const account = useRef(userId)
  account.current = userId
  const mounted = useRef(false)
  // Version each mutation so a read started before/during a write cannot
  // overwrite its optimistic state or rollback. Keys include the account.
  const versions = useRef(new Map<string, number>())
  const locks = useRef(new Set<string>())

  const refresh = useEvent(async () => {
    const request = ++requests.current
    if (!userId) {
      setState({ userId, values: {}, error: false })
      return
    }
    const ids: string[] = JSON.parse(idsKey)
    const before = new Map(versions.current)
    try {
      const liked = new Set<string>()
      // Bound URL length and response size as more schedule pages load.
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data } = await run(
          db
            .from('user_reactions')
            .select('content_id')
            .eq('user_id', userId)
            .eq('content_type', 'contract')
            .eq('reaction_type', 'like')
            .in('content_id', ids.slice(offset, offset + 100))
        )
        data.forEach((reaction) => liked.add(reaction.content_id))
      }
      if (
        !mounted.current ||
        account.current !== userId ||
        request !== requests.current
      )
        return
      setState((old) => {
        const values = old.userId === userId ? { ...old.values } : {}
        for (const id of ids) {
          const key = `${userId}/${id}`
          if (
            !locks.current.has(key) &&
            versions.current.get(key) === before.get(key)
          ) {
            values[id] = liked.has(id)
          }
        }
        return { userId, values, error: false }
      })
    } catch {
      if (
        !mounted.current ||
        account.current !== userId ||
        request !== requests.current
      )
        return
      setState((old) => ({
        userId,
        values: old.userId === userId ? old.values : {},
        error: true,
      }))
    }
  })

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requests.current++
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Reconcile likes changed on a market page or another tab.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      requests.current++
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, idsKey, refresh])

  const values = state.userId === userId ? state.values : {}
  const toggle = async (id: string) => {
    if (user === undefined) return
    if (!user) {
      firebaseLogin()
      return
    }
    const key = `${user.id}/${id}`
    const previous = values[id]
    if (previous === undefined || locks.current.has(key)) return
    locks.current.add(key)
    versions.current.set(key, (versions.current.get(key) ?? 0) + 1)
    setPending(new Set(locks.current))
    setState((old) => ({ ...old, values: { ...old.values, [id]: !previous } }))
    try {
      await api('react', {
        contentId: id,
        contentType: 'contract',
        reactionType: 'like',
        remove: previous,
      })
      if (!previous)
        track('like', { itemId: id, contractId: id, location: 'sports' })
    } catch {
      if (mounted.current && account.current === user.id) {
        setState((old) => ({
          ...old,
          values: { ...old.values, [id]: previous },
        }))
        toast.error('Could not update your like. Please try again.')
      }
    } finally {
      versions.current.set(key, (versions.current.get(key) ?? 0) + 1)
      locks.current.delete(key)
      if (mounted.current) setPending(new Set(locks.current))
      if (mounted.current && account.current === user.id) void refresh()
    }
  }

  return {
    user,
    liked: new Set(gameIds.filter((id) => values[id])),
    loading:
      user === undefined ||
      (!!user && gameIds.some((id) => values[id] === undefined)),
    error: state.userId === userId && state.error,
    disabled: (id: string) =>
      user === undefined ||
      (!!user && (values[id] === undefined || pending.has(`${user.id}/${id}`))),
    toggle,
    refresh,
  }
}
