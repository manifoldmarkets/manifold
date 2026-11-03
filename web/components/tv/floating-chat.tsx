import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { ChatAlt2Icon, ChevronDownIcon } from '@heroicons/react/solid'

import { ChatMessage } from 'common/chat-message'
import { richTextToString } from 'common/util/parse'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { PublicChat } from 'web/components/chat/public-chat'
import { useUser } from 'web/hooks/use-user'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { track } from 'web/lib/service/analytics'

const PREVIEW_MS = 6000

// Manifold TV's chat as a bubble in the corner, so the stream and the markets
// get the whole width. Collapsed, it counts unread messages and previews each
// new one for a few seconds; opened, it is a panel (a sheet on phones). The
// chat stays mounted while collapsed so it keeps its place and subscription.
export function FloatingChat(props: {
  channelId: string
  // Step aside on phones while the page shows its own bottom sheet (the
  // map's race panel, whose Bet buttons sit where the bubble does).
  makeRoom?: boolean
}) {
  const { channelId, makeRoom = false } = props
  const user = useUser()
  // Starts collapsed: open, the panel would cover the bet buttons beside it.
  const [open, setOpen] = usePersistentInMemoryState(
    false,
    `tv-chat-open-${channelId}`
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Messages after this time are unread. Starts at mount, so the backlog the
  // viewer arrived to doesn't count.
  const [seenUntil, setSeenUntil] = useState(() => Date.now())
  const [preview, setPreview] = useState<ChatMessage>()

  const newest = messages[0]
  const unread = open
    ? 0
    : messages.filter(
        (m) =>
          m.createdTime > seenUntil &&
          m.userId !== user?.id &&
          m.visibility !== 'system_status'
      ).length

  useEffect(() => {
    if (open && newest) setSeenUntil((t) => Math.max(t, newest.createdTime))
  }, [open, newest?.id])

  useEffect(() => {
    if (
      open ||
      !newest ||
      newest.createdTime <= seenUntil ||
      newest.userId === user?.id ||
      newest.visibility === 'system_status'
    )
      return
    setPreview(newest)
    const timeout = setTimeout(() => setPreview(undefined), PREVIEW_MS)
    return () => clearTimeout(timeout)
  }, [newest?.id, open])

  const toggle = (next: boolean) => {
    setOpen(next)
    setPreview(undefined)
    track(next ? 'tv chat open' : 'tv chat close', { channelId })
  }

  return (
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
        <div className="border-ink-200 flex items-center justify-between border-b px-3 py-2">
          <span className="text-primary-700 flex items-center gap-2 font-semibold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Live chat
          </span>
          <button
            className="text-ink-500 hover:text-ink-800 hover:bg-ink-100 rounded p-1"
            aria-label="Collapse chat"
            onClick={() => toggle(false)}
          >
            <ChevronDownIcon className="h-5 w-5" />
          </button>
        </div>
        <PublicChat
          channelId={channelId}
          key={channelId}
          className="min-h-0 grow px-2"
          onMessages={setMessages}
        />
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
