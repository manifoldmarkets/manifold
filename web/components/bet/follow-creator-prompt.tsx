import { CheckIcon, XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useState } from 'react'
import toast from 'react-hot-toast'

import { Contract } from 'common/contract'
import { TRADED_TERM } from 'common/envs/constants'
import {
  addPromptedCreatorId,
  FOLLOW_CREATOR_PROMPT_DISMISS_EVENT,
  FOLLOW_CREATOR_PROMPT_FOLLOW_EVENT,
  FOLLOW_CREATOR_PROMPT_SHOWN_EVENT,
  isFollowCreatorPromptCoolingDown,
  mayPromptToFollowCreator,
  parsePromptedCreatorIds,
} from 'common/follow-creator-prompt'
import { api, followUser } from 'web/lib/api/api'
import { auth } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { safeLocalStorage } from 'web/lib/util/local'
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

/**
 * "You've bet on N of X's markets. Follow to hear when they post new ones."
 * Rendered in a toast by `maybePromptToFollowCreator`, so it outlives the
 * trade dialog and never blocks the trade flow.
 */
export function FollowCreatorPrompt(props: {
  toastId: string
  visible: boolean
  creator: PromptCreator
  marketsTraded: number
  tracking: PromptTracking
}) {
  const { toastId, visible, creator, marketsTraded, tracking } = props
  const [status, setStatus] = useState<'idle' | 'saving' | 'following'>('idle')

  const follow = async () => {
    if (status !== 'idle') return
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
    if (status === 'idle') track(FOLLOW_CREATOR_PROMPT_DISMISS_EVENT, tracking)
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
// bet-panel.tsx). An open dialog makes the rest of the page inert, so wait
// for it to close before showing a toast with buttons in it.
const PROMPT_DELAY_MS = 3500
const PROMPT_DURATION_MS = 12000

// Session memory, keyed by user so an account switch starts fresh. Creators
// the API said not to ask about (already followed, blocked, bots...), and
// (creator, market) pairs already counted below the threshold: another trade
// on the same market can't add a distinct market, so it needn't ask again.
const ineligibleCreators = new Set<string>()
const countedCreatorMarkets = new Set<string>()
const pendingCreators = new Set<string>()
// Fallbacks when localStorage is unavailable: at most once per session.
const promptedThisSession = new Set<string>()
const lastPromptedAtThisSession = new Map<string, number>()

const promptedKey = (userId: string) => `follow-creator-prompted-${userId}`
const lastPromptedAtKey = (userId: string) =>
  `follow-creator-prompted-at-${userId}`

const hasPrompted = (userId: string, creatorId: string) => {
  if (promptedThisSession.has(`${userId}:${creatorId}`)) return true
  try {
    return parsePromptedCreatorIds(
      safeLocalStorage?.getItem(promptedKey(userId))
    ).includes(creatorId)
  } catch {
    return false
  }
}

const isCoolingDown = (userId: string) => {
  let lastPromptedAt = lastPromptedAtThisSession.get(userId)
  try {
    const stored = Number(safeLocalStorage?.getItem(lastPromptedAtKey(userId)))
    if (stored > 0 && Number.isFinite(stored))
      lastPromptedAt = Math.max(lastPromptedAt ?? 0, stored)
  } catch {
    // Unreadable storage: rely on the session value.
  }
  return isFollowCreatorPromptCoolingDown(lastPromptedAt, Date.now())
}

const rememberPrompted = (userId: string, creatorId: string) => {
  const now = Date.now()
  promptedThisSession.add(`${userId}:${creatorId}`)
  lastPromptedAtThisSession.set(userId, now)
  try {
    const key = promptedKey(userId)
    const ids = parsePromptedCreatorIds(safeLocalStorage?.getItem(key))
    safeLocalStorage?.setItem(
      key,
      JSON.stringify(addPromptedCreatorId(ids, creatorId))
    )
    safeLocalStorage?.setItem(lastPromptedAtKey(userId), String(now))
  } catch {
    // Storage full or blocked: the session values still limit repeats.
  }
}

/**
 * Call after a trade on `contract` fills (amount > 0). If the trader has now
 * traded on several of the creator's markets and doesn't follow them, shows a
 * one-time toast offering to follow. Fire-and-forget: never throws, never
 * delays the trade flow, asks at most once per creator per browser, and at
 * most once a day.
 */
export const maybePromptToFollowCreator = (params: {
  contract: Pick<
    Contract,
    'id' | 'creatorId' | 'creatorUsername' | 'creatorName' | 'creatorAvatarUrl'
  >
  userId: string
  location: string
}) => {
  const { contract, userId, location } = params
  const creatorId = contract.creatorId
  const creatorKey = `${userId}:${creatorId}`
  const marketKey = `${creatorKey}:${contract.id}`
  if (
    !mayPromptToFollowCreator(userId, creatorId) ||
    ineligibleCreators.has(creatorKey) ||
    countedCreatorMarkets.has(marketKey) ||
    pendingCreators.has(creatorKey) ||
    hasPrompted(userId, creatorId) ||
    isCoolingDown(userId)
  )
    return

  pendingCreators.add(creatorKey)
  setTimeout(async () => {
    try {
      const result = await api('get-follow-creator-prompt', {
        contractId: contract.id,
      })
      if (!result.eligible) {
        ineligibleCreators.add(creatorKey)
        return
      }
      if (!result.show) {
        countedCreatorMarkets.add(marketKey)
        return
      }
      // The account may have changed while waiting (sign-out, switch), or
      // another trade may have shown a prompt in the meantime.
      if (
        auth.currentUser?.uid !== userId ||
        hasPrompted(userId, creatorId) ||
        isCoolingDown(userId)
      )
        return

      rememberPrompted(userId, creatorId)
      const tracking: PromptTracking = {
        contractId: contract.id,
        creatorId,
        marketsTraded: result.marketsTraded,
        location,
      }
      track(FOLLOW_CREATOR_PROMPT_SHOWN_EVENT, tracking)
      const toastId = `follow-creator-prompt-${creatorId}`
      toast.custom(
        (t) => (
          <FollowCreatorPrompt
            toastId={t.id}
            visible={t.visible}
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
        { id: toastId, duration: PROMPT_DURATION_MS }
      )
    } catch (error) {
      // Best effort: a failed check just means no prompt this time.
      console.warn(
        'follow creator prompt:',
        error instanceof Error ? error.message : String(error)
      )
    } finally {
      pendingCreators.delete(creatorKey)
    }
  }, PROMPT_DELAY_MS)
}
