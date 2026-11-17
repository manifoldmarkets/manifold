import {
  CheckIcon,
  InformationCircleIcon,
  XIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import toast, { Toast } from 'react-hot-toast'

import { Contract } from 'common/contract'
import {
  FOLLOW_CREATOR_PROMPT_DISMISS_EVENT,
  FOLLOW_CREATOR_PROMPT_FOLLOW_EVENT,
  FOLLOW_CREATOR_PROMPT_SHOWN_EVENT,
  FOLLOW_CREATOR_PROMPT_WHY_EVENT,
  FollowCreatorPromptWhy,
  followCreatorPromptNextAtKey,
  getFollowCreatorPromptCopy,
  mayPromptToFollowCreator,
  parseFollowCreatorPromptNextAt,
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
 * "You've bet on N of X's questions. Follow to get their new-question
 * notifications." with a "Why am I seeing this?" panel. Rendered in a toast
 * by `maybePromptToFollowCreator`, so it outlives the trade dialog and never
 * blocks the trade flow. It belongs to the account that traded (`userId`) and
 * closes if that account signs out or switches. All copy comes from
 * getFollowCreatorPromptCopy in common/src/follow-creator-prompt.ts.
 */
export function FollowCreatorPrompt(props: {
  toastId: string
  visible: boolean
  userId: string
  creator: PromptCreator
  marketsTraded: number
  why: FollowCreatorPromptWhy
  tracking: PromptTracking
  /** Keeps the toast up until dismissed (while the explanation is open). */
  keepOpen: () => void
}) {
  const {
    toastId,
    visible,
    userId,
    creator,
    marketsTraded,
    why,
    tracking,
    keepOpen,
  } = props
  const [status, setStatus] = useState<'idle' | 'saving' | 'following'>('idle')
  const [whyOpen, setWhyOpen] = useState(false)
  const user = useUser()
  const copy = getFollowCreatorPromptCopy({
    creatorName: creator.name,
    marketsTraded,
    why,
    following: status === 'following',
  })

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
      if (!whyOpen) setTimeout(() => toast.dismiss(toastId), 2000)
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

  const toggleWhy = () => {
    if (!whyOpen) {
      track(FOLLOW_CREATOR_PROMPT_WHY_EVENT, tracking)
      keepOpen()
    }
    setWhyOpen(!whyOpen)
  }

  return (
    <Col
      role="status"
      className={clsx(
        'bg-canvas-0 text-ink-1000 ring-ink-1000/10 pointer-events-auto w-full max-w-md gap-2 rounded-lg p-3 shadow-lg ring-1 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0'
      )}
    >
      <Row className="items-center gap-3">
        <Avatar
          username={creator.username}
          avatarUrl={creator.avatarUrl}
          size="sm"
          className="shrink-0"
        />
        <Col className="min-w-0 flex-1 text-sm">
          <span>{copy.summary}</span>
          <span className="text-ink-600">
            {status === 'following' ? copy.followed : copy.action}
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
        <Col className="-mr-1 shrink-0">
          <button
            type="button"
            aria-label="Dismiss"
            className="text-ink-400 hover:text-ink-600 rounded p-1"
            onClick={dismiss}
          >
            <XIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={copy.whyTitle}
            aria-expanded={whyOpen}
            className={clsx(
              'hover:text-ink-600 rounded p-1',
              whyOpen ? 'text-primary-600' : 'text-ink-400'
            )}
            onClick={toggleWhy}
          >
            <InformationCircleIcon className="h-4 w-4" />
          </button>
        </Col>
      </Row>
      {whyOpen && (
        <Col className="border-ink-200 text-ink-700 gap-1 border-t pt-2 text-sm">
          <span className="text-ink-1000 font-semibold">{copy.whyTitle}</span>
          <span>{copy.whyReason}</span>
          {copy.whyLead && <span>{copy.whyLead}</span>}
          {copy.whyBullets.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {copy.whyBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          {copy.whyFooter && (
            <span className="text-ink-500">{copy.whyFooter}</span>
          )}
        </Col>
      )}
    </Col>
  )
}

// The trade ticket closes itself 3 s after a fill (WAIT_TO_DISMISS in
// bet-panel.tsx), so check no sooner than that.
const PROMPT_DELAY_MS = 3500
const PROMPT_DURATION_MS = 12000
// An open dialog makes the rest of the page inert, toast included. Wait this
// long for it to close; after that, give up.
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
// the API said not to ask about (already followed, blocked, bots, prompted in
// the last 30 days...), and (creator, market) pairs already counted below the
// threshold: another trade on the same market can't add a distinct market,
// so it needn't ask again.
const ineligibleCreators = new Set<string>()
const countedCreatorMarkets = new Set<string>()
// Checks in flight, by user + creator. Fills that land meanwhile are kept,
// one per market, and checked again once the current check finishes.
const pendingCreators = new Map<string, Map<string, PromptParams>>()

// The server enforces the daily gap; this per-browser hint of when it ends
// only saves requests. Straight to localStorage, never via safeLocalStorage,
// whose setItem clears all of localStorage when a write fails. Unreadable
// storage just means asking the server.
const readNextPromptAt = (userId: string) => {
  try {
    return parseFollowCreatorPromptNextAt(
      window.localStorage.getItem(followCreatorPromptNextAtKey(userId))
    )
  } catch {
    return undefined
  }
}

const writeNextPromptAt = (userId: string, nextPromptAt: number) => {
  try {
    window.localStorage.setItem(
      followCreatorPromptNextAtKey(userId),
      String(nextPromptAt)
    )
  } catch {
    // Only a hint.
  }
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
  // The API records the prompt when it says to show it, so only ask once the
  // toast could be seen.
  if (!(await waitForNoDialog(Date.now() + DIALOG_WAIT_MS))) return
  if (!isSignedInAs(userId)) return
  const result = await api('follow-creator-prompt', {
    contractId: contract.id,
  })
  if (!isSignedInAs(userId)) return
  if (result.nextPromptAt !== undefined && Number.isFinite(result.nextPromptAt))
    writeNextPromptAt(userId, result.nextPromptAt)
  if (!result.eligible) {
    ineligibleCreators.add(creatorKey)
    return
  }
  if (!result.show || !result.why) {
    if (result.nextPromptAt === undefined)
      countedCreatorMarkets.add(`${creatorKey}:${contract.id}`)
    return
  }
  const why = result.why
  // Already recorded; show it as soon as the page allows.
  if (!(await waitForNoDialog(Date.now() + DIALOG_WAIT_MS))) return
  if (!isSignedInAs(userId)) return

  const tracking: PromptTracking = {
    contractId: contract.id,
    creatorId,
    marketsTraded: result.marketsTraded,
    location,
  }
  track(FOLLOW_CREATOR_PROMPT_SHOWN_EVENT, tracking)
  const toastId = `follow-creator-prompt-${creatorId}`
  const render = (t: Toast) => (
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
      why={why}
      tracking={tracking}
      keepOpen={() => toast.custom(render, { id: toastId, duration: Infinity })}
    />
  )
  toast.custom(render, { id: toastId, duration: PROMPT_DURATION_MS })
}

/**
 * Call after a trade on `contract` fills (amount > 0). If the trader has now
 * traded on several of the creator's markets and doesn't follow them, shows a
 * toast offering to follow. Fire-and-forget: never throws, never delays the
 * trade flow. The server allows one prompt per account a day, and the same
 * creator again only after 30 days, across devices.
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
  const nextPromptAt = readNextPromptAt(userId)
  if (nextPromptAt !== undefined && Date.now() < nextPromptAt) return

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
