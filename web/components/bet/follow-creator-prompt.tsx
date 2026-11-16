import { CheckIcon, XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import { Contract } from 'common/contract'
import { TRADED_TERM } from 'common/envs/constants'
import {
  addPromptedCreatorId,
  FOLLOW_CREATOR_PROMPT_DISMISS_EVENT,
  FOLLOW_CREATOR_PROMPT_FOLLOW_EVENT,
  FOLLOW_CREATOR_PROMPT_SHOWN_EVENT,
  followCreatorPromptedAtKey,
  followCreatorPromptedKey,
  isFollowCreatorPromptCoolingDown,
  mayPromptToFollowCreator,
  parsePromptedCreatorIds,
} from 'common/follow-creator-prompt'
import { useUser } from 'web/hooks/use-user'
import { api, followUser } from 'web/lib/api/api'
import { auth } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'

type PromptCreator = {
  id: string
  username: string
  name: string
  avatarUrl?: string
}

type PromptTracking = {
  contractId: string
  creatorId: string
  marketsTraded: number
  location: string
}

const isSignedInAs = (userId: string) => auth.currentUser?.uid === userId

/**
 * "You've bet on N of X's markets. Follow to hear when they post new ones."
 * Rendered in a toast by `maybePromptToFollowCreator`, so it outlives the
 * trade dialog and never blocks the trade flow. It belongs to the account
 * that traded (`userId`) and closes if that account signs out or switches.
 */
export function FollowCreatorPrompt(props: {
  toastId: string
  visible: boolean
  userId: string
  creator: PromptCreator
  marketsTraded: number
  tracking: PromptTracking
}) {
  const { toastId, visible, userId, creator, marketsTraded, tracking } = props
  const [status, setStatus] = useState<'idle' | 'saving' | 'following'>('idle')
  const user = useUser()

  useEffect(() => {
    if (user !== undefined && user?.id !== userId) toast.dismiss(toastId)
  }, [user?.id, userId, toastId])

  const follow = async () => {
    if (status !== 'idle') return
    if (!isSignedInAs(userId)) {
      toast.dismiss(toastId)
      return
    }
    setStatus('saving')
    track(FOLLOW_CREATOR_PROMPT_FOLLOW_EVENT, tracking)
    try {
      await followUser(creator.id)
      setStatus('following')
      setTimeout(() => toast.dismiss(toastId), 2000)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      setStatus('idle')
      toast.error('Failed to follow. Please try again.')
    }
  }

  const dismiss = () => {
    if (status === 'idle' && isSignedInAs(userId))
      track(FOLLOW_CREATOR_PROMPT_DISMISS_EVENT, tracking)
    toast.dismiss(toastId)
  }

  return (
    <Row
      role="status"
      className={clsx(
        'bg-canvas-0 text-ink-1000 ring-ink-1000/10 pointer-events-auto w-full max-w-md items-center gap-3 rounded-lg p-3 shadow-lg ring-1 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0'
      )}
    >
      <Avatar
        username={creator.username}
        avatarUrl={creator.avatarUrl}
        size="sm"
        className="shrink-0"
      />
      <Col className="min-w-0 flex-1 text-sm">
        <span>
          You've {TRADED_TERM} on {marketsTraded} of{' '}
          <span className="font-semibold">{creator.name}</span>'s markets.
        </span>
        <span className="text-ink-600">
          {status === 'following'
            ? "You'll hear when they post new ones."
            : 'Follow to hear when they post new ones.'}
        </span>
      </Col>
      {status === 'following' ? (
        <Row className="text-ink-600 shrink-0 items-center gap-1 text-sm">
          <CheckIcon className="h-4 w-4" aria-hidden />
          Following
        </Row>
      ) : (
        <Button
          size="xs"
          color="indigo"
          className="shrink-0"
          loading={status === 'saving'}
          onClick={follow}
        >
          Follow
        </Button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="text-ink-400 hover:text-ink-600 -mr-1 shrink-0 rounded p-1"
        onClick={dismiss}
      >
        <XIcon className="h-4 w-4" />
      </button>
    </Row>
  )
}

// The trade ticket closes itself 3 s after a fill (WAIT_TO_DISMISS in
// bet-panel.tsx), so check no sooner than that.
const PROMPT_DELAY_MS = 3500
const PROMPT_DURATION_MS = 12000
// An open dialog makes the rest of the page inert, toast included. Wait this
// long for it to close; after that, give up without using up the prompt.
const DIALOG_WAIT_MS = 60_000
const DIALOG_POLL_MS = 500

type PromptParams = {
  contract: Pick<
    Contract,
    'id' | 'creatorId' | 'creatorUsername' | 'creatorName' | 'creatorAvatarUrl'
  >
  userId: string
  location: string
}

// Session memory, keyed by user so an account switch starts fresh. Creators
// the API said not to ask about (already followed, blocked, bots...), and
// (creator, market) pairs already counted below the threshold: another trade
// on the same market can't add a distinct market, so it needn't ask again.
const ineligibleCreators = new Set<string>()
const countedCreatorMarkets = new Set<string>()
// Checks in flight, by user + creator. Fills that land meanwhile are kept,
// one per market, and checked again once the current check finishes.
const pendingCreators = new Map<string, Map<string, PromptParams>>()

// Straight to localStorage, never via safeLocalStorage, whose setItem clears
// all of localStorage when a write fails. Unreadable storage returns
// undefined, and callers then show nothing, so a prompt can't repeat after a
// reload just because storage was unavailable.
const readStorage = (key: string): string | null | undefined => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return undefined
  }
}

const hasPrompted = (userId: string, creatorId: string) => {
  const raw = readStorage(followCreatorPromptedKey(userId))
  return raw === undefined || parsePromptedCreatorIds(raw).includes(creatorId)
}

const isCoolingDown = (userId: string) => {
  const raw = readStorage(followCreatorPromptedAtKey(userId))
  if (raw === undefined) return true
  return isFollowCreatorPromptCoolingDown(
    raw === null ? undefined : Number(raw),
    Date.now()
  )
}

// Records the prompt before it is shown; false (show nothing) unless the
// write is confirmed.
const recordPrompted = (userId: string, creatorId: string) => {
  try {
    const storage = window.localStorage
    const key = followCreatorPromptedKey(userId)
    const ids = parsePromptedCreatorIds(storage.getItem(key))
    storage.setItem(key, JSON.stringify(addPromptedCreatorId(ids, creatorId)))
    storage.setItem(followCreatorPromptedAtKey(userId), String(Date.now()))
    return parsePromptedCreatorIds(storage.getItem(key)).includes(creatorId)
  } catch {
    return false
  }
}

// Runs `fn` under a per-user Web Lock, so the final check, record and show
// are atomic across tabs. Without the Web Locks API it returns false: no
// prompt is better than two.
const withPromptLock = async (userId: string, fn: () => boolean) => {
  if (typeof navigator === 'undefined' || !navigator.locks) return false
  const result: unknown = await navigator.locks.request(
    `follow-creator-prompt:${userId}`,
    () => fn()
  )
  return result === true
}

// Headless UI portals an open dialog to the body and marks the other body
// children (the app root, which holds the toaster) inert. Deeper inert
// elements, like browse's scrolled-away bars, don't block the toast.
const isPageBlockedByDialog = () =>
  !!document.querySelector('[role="dialog"][aria-modal="true"], body > [inert]')

const waitForNoDialog = async (deadline: number) => {
  while (isPageBlockedByDialog()) {
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, DIALOG_POLL_MS))
  }
  return true
}

const checkAndPrompt = async (params: PromptParams) => {
  const { contract, userId, location } = params
  const creatorId = contract.creatorId
  const creatorKey = `${userId}:${creatorId}`
  // The account may change while waiting (sign-out, switch): never let one
  // account's answer or prompt reach another.
  if (!isSignedInAs(userId)) return
  const result = await api('get-follow-creator-prompt', {
    contractId: contract.id,
  })
  if (!isSignedInAs(userId)) return
  if (!result.eligible) {
    ineligibleCreators.add(creatorKey)
    return
  }
  if (!result.show) {
    countedCreatorMarkets.add(`${creatorKey}:${contract.id}`)
    return
  }
  if (!(await waitForNoDialog(Date.now() + DIALOG_WAIT_MS))) return

  const tracking: PromptTracking = {
    contractId: contract.id,
    creatorId,
    marketsTraded: result.marketsTraded,
    location,
  }
  // Everything from the last checks to the toast runs synchronously inside
  // the lock, so nothing can change between checking and showing.
  await withPromptLock(userId, () => {
    if (
      !isSignedInAs(userId) ||
      isPageBlockedByDialog() ||
      hasPrompted(userId, creatorId) ||
      isCoolingDown(userId) ||
      !recordPrompted(userId, creatorId)
    )
      return false
    track(FOLLOW_CREATOR_PROMPT_SHOWN_EVENT, tracking)
    toast.custom(
      (t) => (
        <FollowCreatorPrompt
          toastId={t.id}
          visible={t.visible}
          userId={userId}
          creator={{
            id: creatorId,
            username: contract.creatorUsername,
            name: contract.creatorName,
            avatarUrl: contract.creatorAvatarUrl,
          }}
          marketsTraded={result.marketsTraded}
          tracking={tracking}
        />
      ),
      { id: `follow-creator-prompt-${creatorId}`, duration: PROMPT_DURATION_MS }
    )
    return true
  })
}

/**
 * Call after a trade on `contract` fills (amount > 0). If the trader has now
 * traded on several of the creator's markets and doesn't follow them, shows a
 * one-time toast offering to follow. Fire-and-forget: never throws, never
 * delays the trade flow, asks at most once per creator per browser, and at
 * most once a day.
 */
export const maybePromptToFollowCreator = (params: PromptParams) => {
  const { contract, userId } = params
  const creatorId = contract.creatorId
  const creatorKey = `${userId}:${creatorId}`
  if (
    !mayPromptToFollowCreator(userId, creatorId) ||
    ineligibleCreators.has(creatorKey) ||
    countedCreatorMarkets.has(`${creatorKey}:${contract.id}`)
  )
    return
  const queued = pendingCreators.get(creatorKey)
  if (queued) {
    queued.set(contract.id, params)
    return
  }
  if (hasPrompted(userId, creatorId) || isCoolingDown(userId)) return

  pendingCreators.set(creatorKey, new Map())
  setTimeout(() => {
    checkAndPrompt(params)
      .catch((error) => {
        // Best effort: a failed check just means no prompt this time.
        console.warn(
          'follow creator prompt:',
          error instanceof Error ? error.message : String(error)
        )
      })
      .finally(() => {
        // Markets already counted drop out in the pre-checks; the first new
        // one starts the next check and the rest queue behind it.
        const again = [...(pendingCreators.get(creatorKey)?.values() ?? [])]
        pendingCreators.delete(creatorKey)
        again.forEach(maybePromptToFollowCreator)
      })
  }, PROMPT_DELAY_MS)
}
