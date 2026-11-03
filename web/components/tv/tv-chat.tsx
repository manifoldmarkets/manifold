import clsx from 'clsx'
import { ReactNode, useEffect, useState } from 'react'
import { ChatAlt2Icon, ChevronDownIcon } from '@heroicons/react/solid'
import { BsPinAngle, BsPinAngleFill } from 'react-icons/bs'

import { ChatMessage } from 'common/chat-message'
import { richTextToString } from 'common/util/parse'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { PublicChat } from 'web/components/chat/public-chat'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUser } from 'web/hooks/use-user'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { track } from 'web/lib/service/analytics'

const PREVIEW_MS = 6000
// Pinning needs room for a column beside the stream: Tailwind's xl.
const PIN_MIN_WIDTH = 1280

// Manifold TV's chat. On desktop it is pinned as a column on the right by
// default; a viewer can unpin it into a bubble in the corner, and the choice
// is remembered. Narrower screens always get the bubble: collapsed, it counts
// unread messages and previews each new one; opened, it is a panel (a sheet
// on phones). Returns the chat for exactly one of the two places, so only one
// chat is ever mounted.
export function useTVChat(props: {
  channelId: string
  // Bubble only: step aside on phones while the page shows its own bottom
  // sheet (the map's race panel, whose Bet buttons sit where the bubble does).
  makeRoom?: boolean
}): { docked: ReactNode; floating: ReactNode } {
  const { channelId, makeRoom = false } = props
  const user = useUser()
  const narrow = useIsMobile(PIN_MIN_WIDTH)
  const [pinned, setPinned] = usePersistentLocalState(true, 'tv-chat-pinned')
  const docked = pinned && !narrow
  const [open, setOpen] = usePersistentInMemoryState(
    false,
    `tv-chat-open-${channelId}`
  )
  const visible = docked || open

  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Messages after this time are unread. Starts at mount, so the backlog the
  // viewer arrived to doesn't count.
  const [seenUntil, setSeenUntil] = useState(() => Date.now())
  const [preview, setPreview] = useState<ChatMessage>()

  const newest = messages[0]
  const isNew = (m: ChatMessage) =>
    m.createdTime > seenUntil &&
    m.userId !== user?.id &&
    m.visibility !== 'system_status'
  const unread = visible ? 0 : messages.filter(isNew).length

  useEffect(() => {
    if (visible && newest) setSeenUntil((t) => Math.max(t, newest.createdTime))
  }, [visible, newest?.id])

  useEffect(() => {
    if (visible || !newest || !isNew(newest)) return
    setPreview(newest)
    const timeout = setTimeout(() => setPreview(undefined), PREVIEW_MS)
    return () => clearTimeout(timeout)
  }, [newest?.id, visible])

  const toggle = (next: boolean) => {
    setOpen(next)
    setPreview(undefined)
    track(next ? 'tv chat open' : 'tv chat close', { channelId })
  }
  const pin = (next: boolean) => {
    setPinned(next)
    setOpen(false)
    setPreview(undefined)
    track(next ? 'tv chat pin' : 'tv chat unpin', { channelId })
  }

  const chat = (
    <PublicChat
      channelId={channelId}
      key={channelId}
      className="min-h-0 grow px-2"
      onMessages={setMessages}
    />
  )

  if (docked)
    return {
      docked: (
        <section
          aria-label="Live chat"
          className="bg-canvas-0 border-ink-200 flex h-full min-h-0 flex-col rounded-lg border"
        >
          <ChatHeader>
            <HeaderButton
              label="Unpin chat into a bubble"
              onClick={() => pin(false)}
            >
              <BsPinAngleFill className="h-4 w-4" />
            </HeaderButton>
          </ChatHeader>
          {chat}
        </section>
      ),
      floating: null,
    }

  return {
    docked: null,
    floating: (
      <>
        <div
          role="dialog"
          aria-label="Live chat"
          aria-hidden={!open}
          className={clsx(
            'bg-canvas-0 border-ink-200 fixed z-50 flex flex-col rounded-xl border shadow-2xl transition-all duration-200',
            // On phones a sheet between the pinned 16:9 stream and the bottom
            // bar, so the stream stays in view; a corner panel from sm up.
            'inset-x-2 bottom-[66px] top-[calc(56.25vw+8px)] sm:inset-x-auto sm:bottom-[136px] sm:right-4 sm:top-auto sm:h-[min(560px,72vh)] sm:w-[360px] lg:bottom-24',
            open
              ? 'visible translate-y-0 opacity-100'
              : 'pointer-events-none invisible translate-y-4 opacity-0'
          )}
        >
          <ChatHeader>
            {!narrow && (
              <HeaderButton
                label="Pin chat to the right"
                onClick={() => pin(true)}
              >
                <BsPinAngle className="h-4 w-4" />
              </HeaderButton>
            )}
            <HeaderButton label="Collapse chat" onClick={() => toggle(false)}>
              <ChevronDownIcon className="h-5 w-5" />
            </HeaderButton>
          </ChatHeader>
          {chat}
        </div>

        {!open && preview && !makeRoom && (
          <ChatPreview message={preview} onOpen={() => toggle(true)} />
        )}

        <button
          className={clsx(
            'bg-primary-600 hover:bg-primary-700 fixed bottom-[70px] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform hover:scale-105 lg:bottom-6',
            open && 'hidden sm:flex',
            makeRoom && !open && 'max-[850px]:hidden'
          )}
          aria-label={
            open
              ? 'Collapse chat'
              : unread
              ? `Open chat, ${unread} unread`
              : 'Open chat'
          }
          aria-expanded={open}
          onClick={() => toggle(!open)}
        >
          {open ? (
            <ChevronDownIcon className="h-7 w-7" />
          ) : (
            <ChatAlt2Icon className="h-7 w-7" />
          )}
          {unread > 0 && (
            <span className="bg-scarlet-500 absolute -right-1 -top-1 flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white ring-2 ring-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </>
    ),
  }
}

function ChatHeader(props: { children: ReactNode }) {
  return (
    <div className="border-ink-200 flex items-center justify-between border-b px-3 py-2">
      <span className="text-primary-700 flex items-center gap-2 font-semibold">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        Live chat
      </span>
      <div className="flex items-center gap-1">{props.children}</div>
    </div>
  )
}

function HeaderButton(props: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      className="text-ink-500 hover:text-ink-800 hover:bg-ink-100 rounded p-1"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

function ChatPreview(props: { message: ChatMessage; onOpen: () => void }) {
  const { message, onOpen } = props
  const author = useDisplayUserById(message.userId)
  const text = richTextToString(message.content)
  if (!text) return null
  return (
    <button
      className="bg-canvas-0 border-ink-200 text-ink-900 fixed bottom-[134px] right-4 z-50 max-w-[260px] rounded-2xl rounded-br-sm border px-3 py-2 text-left text-sm shadow-lg lg:bottom-[88px]"
      onClick={onOpen}
    >
      {author && (
        <span className="text-primary-700 mr-1 font-semibold">
          {author.name}
        </span>
      )}
      <span className="line-clamp-2">{text}</span>
    </button>
  )
}
