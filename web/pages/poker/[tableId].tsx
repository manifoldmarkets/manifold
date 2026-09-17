import Head from 'next/head'
import Link from 'next/link'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import { CSSProperties, useEffect, useState } from 'react'
import {
  ArrowLeftIcon,
  ClockIcon,
  GlobeAltIcon,
  LockClosedIcon,
  ChatAlt2Icon,
  PlusIcon,
  UsersIcon,
} from '@heroicons/react/outline'
import styles from 'web/components/poker/poker.module.css'
import { POKER_STREETS } from 'common/poker/types'
import { formatMoney } from 'common/util/format'
import { Page } from 'web/components/layout/page'
import { Button } from 'web/components/buttons/button'
import { Avatar } from 'web/components/widgets/avatar'
import { Input } from 'web/components/widgets/input'
import { ChatMessageItem } from 'web/components/chat/chat-message'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import {
  HandResult,
  GestureIcon,
  PokerStatus,
  PokerCard,
  PokerRules,
} from 'web/components/poker/poker-ui'
import { usePoker } from 'web/components/poker/use-poker'

const SEAT_POSITIONS = [
  [25, 14],
  [50, 12],
  [75, 14],
  [90, 48],
  [83, 83],
  [61, 87],
  [39, 87],
  [17, 83],
  [10, 48],
]

export default function PokerTablePage() {
  const router = useRouter()
  const id =
    typeof router.query.tableId === 'string' ? router.query.tableId : undefined
  const user = useUser()
  const { data, error, busy, connected, act, token, refresh } = usePoker(
    id,
    user?.id
  )
  const [now, setNow] = useState(Date.now())
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [hostTarget, setHostTarget] = useState('')
  const [hostAction, setHostAction] = useState('mute')
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  const [clockOffset, setClockOffset] = useState(0)
  useEffect(() => {
    if (data) setClockOffset(data.serverTime - Date.now())
  }, [data?.serverTime])
  const hand = data?.hand
  const settled = !!hand?.settlement
  const seat = data?.seats.find((s) => s.userId === user?.id)
  const me = hand?.players.find((p) => p.userId === user?.id)
  const host = data?.table.creatorId === user?.id
  const deadline = hand && !settled ? hand.deadline : data?.nextDealAt
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - now - clockOffset) / 1000))
    : 0
  const canMove =
    !!hand &&
    !settled &&
    !!me &&
    !me.folded &&
    !me.allIn &&
    !hand.yourMove &&
    !busy &&
    connected &&
    seconds > 0 &&
    data?.table.status !== 'paused'
  const share = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/poker/${id}${
          token ? `#invite=${token}` : ''
        }`
      )
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const readyCount =
    data?.seats.filter((s) => s.ready && !s.leaving).length ?? 0
  const people = [
    ...new Map(
      [
        ...(data?.seats ?? []),
        ...(data?.messages ?? []),
        ...(data?.moderation ?? []),
      ].map((p) => [p.userId, p])
    ).values(),
  ].filter((p) => p.userId !== user?.id)
  const renderSeat = (index: number) => {
    const s = data?.seats.find((s) => s.seat === index)
    const previousPlayer = hand?.players.find((p) => p.seat === index)
    // Settled hands remain available for results/history, but their former
    // players must not occupy seats they have since left.
    const p =
      !settled || s?.userId === previousPlayer?.userId
        ? previousPlayer
        : undefined
    const isMe = p?.userId === user?.id || s?.userId === user?.id
    const payout = p && hand?.settlement?.payouts[p.userId]
    const last = hand?.rounds[hand.rounds.length - 1]?.moves.find(
      (m) => m.userId === p?.userId
    )
    return (
      <div
        key={index}
        role="group"
        aria-label={`Seat ${index + 1}`}
        data-empty={!s && !p}
        data-mine={isMe}
        style={
          {
            '--seat-x': `${SEAT_POSITIONS[index][0]}%`,
            '--seat-y': `${SEAT_POSITIONS[index][1]}%`,
          } as CSSProperties
        }
        className={clsx(styles.seat, p?.folded && 'opacity-60')}
      >
        {s || p ? (
          <>
            <div className="flex max-w-full items-center gap-1.5">
              <Avatar
                avatarUrl={p?.avatarUrl ?? s?.avatarUrl}
                size="2xs"
                noLink
              />
              <span
                className="truncate text-[10px] font-semibold"
                title={p?.name ?? s?.name}
              >
                {p?.name ?? s?.name}
                {isMe ? ' · you' : ''}
              </span>
              {p && hand?.dealer === index && (
                <span
                  className="bg-ink-100 rounded-full px-1 text-xs"
                  title="Dealer"
                >
                  D
                </span>
              )}
            </div>
            <div className="my-0.5 flex gap-1">
              <PokerCard card={p?.cards?.[0]} small />
              <PokerCard card={p?.cards?.[1]} small />
            </div>
            <span className="text-ink-500 text-xs">
              {p
                ? `${formatMoney(p.contributed)} committed`
                : s?.ready
                ? 'Ready for next hand'
                : 'Sitting out'}
            </span>
            <span
              className={clsx(
                'min-h-[1rem] text-xs font-medium',
                payout ? 'text-teal-600' : 'text-primary-600'
              )}
            >
              {payout
                ? `Won ${formatMoney(payout)}`
                : p?.folded
                ? 'Folded'
                : p?.allIn
                ? 'All-in'
                : !settled && p?.locked
                ? 'Move locked'
                : p && !settled
                ? 'Choosing…'
                : ''}
            </span>
            {s?.leaving && (
              <span className="text-ink-500 text-xs">Leaving after hand</span>
            )}
            {last && (
              <span className="text-ink-400 text-xs">
                Last: {last.move}
                {last.downgraded
                  ? ' (Rock unfunded)'
                  : last.timedOut
                  ? ' (timeout)'
                  : ''}
              </span>
            )}
          </>
        ) : (
          <div className={styles.emptySeat}>
            <span className={styles.emptySeatIcon}>
              <PlusIcon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span>Open seat</span>
          </div>
        )}
      </div>
    )
  }
  return (
    <Page trackPageView={false} hideFooter className="!col-span-10">
      <Head>
        <title>{data?.table.name ?? 'Poker'} | Manifold</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <div className={styles.page}>
        <Link
          href="/poker"
          className="text-ink-500 hover:text-primary-600 inline-flex items-center gap-1.5 text-xs font-medium"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Poker lobby
        </Link>
        {!data ? (
          <div className="bg-canvas-0 rounded-xl p-8">
            <h1 className="text-xl font-semibold">
              {error || 'Loading table…'}
            </h1>
            {error && (
              <Button className="mt-4" onClick={() => refresh()}>
                Try again
              </Button>
            )}
          </div>
        ) : (
          <>
            <header className={styles.gameHeader}>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {data.table.name}
                  </h1>
                  <PokerStatus status={data.table.status} />
                </div>
                <div className={styles.gameMeta}>
                  <span className="inline-flex items-center gap-1.5">
                    {data.table.visibility === 'private' ? (
                      <LockClosedIcon className="h-3.5 w-3.5" />
                    ) : (
                      <GlobeAltIcon className="h-3.5 w-3.5" />
                    )}
                    {data.table.visibility === 'private'
                      ? 'Private table'
                      : 'Public table'}
                  </span>
                  <span>
                    <strong className="text-ink-700 font-semibold">
                      {formatMoney(data.table.ante)}
                    </strong>{' '}
                    ante
                  </span>
                  <span>
                    {formatMoney(data.table.minimumBalance)} to start / resume
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <UsersIcon className="h-3.5 w-3.5" />
                    {data.seats.length} / 9
                  </span>
                </div>
              </div>
              <Button
                color="gray-outline"
                size="sm"
                className="!rounded-lg"
                onClick={share}
              >
                <PlusIcon className="mr-1.5 h-4 w-4" />
                {copied ? 'Link copied' : 'Invite friends'}
              </Button>
            </header>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
              >
                {error}
              </p>
            )}
            {!connected && (
              <p role="status" className="text-sm text-amber-600">
                Connection interrupted. Reconnecting… Your last accepted move
                stays locked.
              </p>
            )}
            {(data.table.status === 'paused' ||
              data.closing ||
              !data.newHandsEnabled) && (
              <p className="bg-canvas-0 border-ink-200 rounded-lg border p-3 text-sm">
                {data.table.status === 'closed'
                  ? 'This table is closed.'
                  : data.table.status === 'paused'
                  ? 'This table is paused for review. Committed mana remains in escrow.'
                  : data.closing
                  ? 'This table is closing. Any active hand will finish.'
                  : 'New hands are temporarily paused. This hand can finish.'}
              </p>
            )}
            <div className={styles.gameLayout}>
              <main className={clsx(styles.gameColumn, 'space-y-4')}>
                <section aria-label="Poker table" className={styles.arena}>
                  {SEAT_POSITIONS.map((_, i) => renderSeat(i))}
                  <div className={styles.board}>
                    <div className={styles.eyebrow}>
                      {hand
                        ? `Hand ${hand.number} · ${
                            settled ? 'Results' : POKER_STREETS[hand.street]
                          }`
                        : 'Waiting to deal'}
                    </div>
                    {hand && !settled && (
                      <div
                        className={styles.streetTrack}
                        aria-label="Betting streets"
                      >
                        {POKER_STREETS.map((street, i) => (
                          <span key={street} data-current={i === hand.street}>
                            {street}
                          </span>
                        ))}
                      </div>
                    )}
                    <div>
                      <div className="text-ink-500 text-xs">
                        {settled ? 'Hand pot' : 'Total pot'}
                      </div>
                      <div className="text-3xl font-bold tabular-nums tracking-tight">
                        {formatMoney(
                          hand?.players.reduce(
                            (sum, p) => sum + p.contributed,
                            0
                          ) ?? 0
                        )}
                      </div>
                    </div>
                    <div
                      className={styles.boardCards}
                      aria-label="Community cards"
                    >
                      {[0, 1, 2, 3, 4].map((i) => (
                        <PokerCard key={i} card={hand?.board[i]} />
                      ))}
                    </div>
                    {hand && (hand.pots.length > 1 || settled) && (
                      <div className={styles.boardDetails}>
                        {hand.pots.length > 1 && (
                          <p className="text-ink-500 text-xs">
                            {hand.pots
                              .map(
                                (p, i) =>
                                  `${
                                    i ? `Side pot ${i}` : 'Main pot'
                                  } ${formatMoney(p.amount)}`
                              )
                              .join(' · ')}
                          </p>
                        )}
                        {settled && <HandResult hand={hand} />}
                      </div>
                    )}
                    <p className={styles.clock} role="status">
                      {deadline && (
                        <ClockIcon
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden
                        />
                      )}
                      {data.table.status === 'closed'
                        ? 'Table closed'
                        : data.table.status === 'paused'
                        ? 'Hand paused'
                        : !data.table.started
                        ? 'The host will start when everyone is ready.'
                        : deadline
                        ? `${
                            hand && !settled ? 'Choose within' : 'Next hand in'
                          } ${seconds}s`
                        : readyCount < 2
                        ? 'Waiting for at least two ready players.'
                        : 'Waiting to deal…'}
                    </p>
                  </div>
                </section>
                <section
                  className={clsx(styles.panel, styles.controls, 'space-y-3')}
                  aria-label="Your controls"
                >
                  {user ? (
                    <div className={styles.controlsHeader}>
                      <div>
                        <h2 className="text-sm font-semibold">
                          {seat ? 'Your seat' : 'Join the table'}
                        </h2>
                        <p className="text-ink-500 mt-1 text-xs">
                          {seat
                            ? seat.leaving
                              ? 'Leaving when this hand finishes'
                              : seat.ready
                              ? 'Ready for the next hand'
                              : 'Sitting out'
                            : 'Take a seat, then ready up to play.'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-ink-500 text-[10px] uppercase tracking-wide">
                          Available mana
                        </div>
                        <strong className="text-sm tabular-nums">
                          {formatMoney(data.viewer.balance ?? 0)}
                        </strong>
                      </div>
                      {seat && (
                        <span>
                          Session:{' '}
                          <strong>
                            {seat.sessionProfit >= 0 ? '+' : ''}
                            {formatMoney(seat.sessionProfit)}
                          </strong>
                        </span>
                      )}
                    </div>
                  ) : (
                    <Button onClick={firebaseLogin}>
                      Sign in to join or chat
                    </Button>
                  )}
                  {hand && !settled && me && (
                    <>
                      <div className="flex justify-between gap-2 text-sm">
                        <span>
                          Raise per Rock:{' '}
                          <strong>
                            {formatMoney(data.viewer.rockRequirement)}
                          </strong>
                        </span>
                        <span>
                          Maximum call:{' '}
                          <strong>
                            {formatMoney(data.viewer.maximumCall)}
                          </strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['rock', 'paper', 'scissors'] as const).map(
                          (move) => (
                            <Button
                              key={move}
                              size="lg"
                              className="!rounded-xl !py-4"
                              color={
                                hand.yourMove === move
                                  ? 'indigo'
                                  : 'indigo-outline'
                              }
                              disabled={
                                !canMove ||
                                (move === 'rock' && !data.viewer.canRock)
                              }
                              onClick={() =>
                                act({
                                  type: 'move',
                                  handId: hand.id,
                                  street: hand.street,
                                  move,
                                })
                              }
                              title={
                                move === 'rock'
                                  ? `Requires ${formatMoney(
                                      data.viewer.rockRequirement
                                    )} at submission and reveal`
                                  : undefined
                              }
                            >
                              <span>
                                <GestureIcon
                                  move={move}
                                  className="mx-auto mb-2 h-6 w-6"
                                />
                                <span className="block capitalize">{move}</span>
                                <span className="block text-xs font-normal">
                                  {move === 'rock'
                                    ? 'Raise + call'
                                    : move === 'paper'
                                    ? 'Check / fold'
                                    : 'Check / call'}
                                </span>
                              </span>
                            </Button>
                          )
                        )}
                      </div>
                      <p className="text-ink-500 text-xs">
                        {hand.yourMove
                          ? `${
                              hand.yourMove[0].toUpperCase() +
                              hand.yourMove.slice(1)
                            } locked. Waiting for the reveal.`
                          : me.folded
                          ? 'You folded. Watch the rest of this hand.'
                          : me.allIn
                          ? 'You are all-in. You can win the pots you contributed to.'
                          : 'Click once to lock. Each Rock adds a raise; your total call can exceed your balance. Short callers go all-in.'}
                      </p>
                      {!data.viewer.canRock && canMove && (
                        <p className="text-ink-500 text-xs">
                          Rock needs at least{' '}
                          {formatMoney(data.viewer.rockRequirement)} available.
                        </p>
                      )}
                    </>
                  )}
                  {user && (
                    <div className="flex flex-wrap gap-2">
                      {!seat && (
                        <Button
                          disabled={
                            busy ||
                            !data.viewer.canEnter ||
                            data.table.seats >= 9 ||
                            data.closing ||
                            data.table.status === 'closed' ||
                            data.table.status === 'paused'
                          }
                          onClick={() => act({ type: 'join' })}
                        >
                          Take a seat
                        </Button>
                      )}
                      {seat && !seat.leaving && (
                        <>
                          <Button
                            disabled={
                              busy ||
                              data.closing ||
                              (!seat.ready && !data.viewer.canEnter)
                            }
                            onClick={() =>
                              act({ type: 'ready', ready: !seat.ready })
                            }
                          >
                            {seat.ready ? 'Sit out next hand' : 'Ready to play'}
                          </Button>
                          <Button
                            disabled={busy}
                            color="gray-outline"
                            onClick={() => act({ type: 'leave' })}
                          >
                            {host
                              ? hand && !settled
                                ? 'Leave and close after hand'
                                : 'Leave and close table'
                              : hand && !settled && me
                              ? 'Leave after hand'
                              : 'Leave seat'}
                          </Button>
                        </>
                      )}
                      {seat?.leaving && (
                        <span className="text-ink-500 text-sm">
                          Your seat will be released after this hand.
                        </span>
                      )}
                      {host && !data.table.started && !data.closing && (
                        <Button
                          disabled={
                            busy || readyCount < 2 || !data.newHandsEnabled
                          }
                          onClick={() => act({ type: 'start' })}
                        >
                          Start game
                        </Button>
                      )}
                    </div>
                  )}
                  {user && !data.viewer.canEnter && (!seat || !seat.ready) && (
                    <p className="text-ink-500 text-xs">
                      You need {formatMoney(data.table.minimumBalance)} to enter
                      or resume. Active players may keep playing below this
                      balance.
                    </p>
                  )}
                </section>
                <PokerRules />
                <details className={clsx(styles.panel, 'p-4')}>
                  <summary className="cursor-pointer font-semibold">
                    Hand history
                  </summary>
                  <div className="mt-3 space-y-4">
                    {[...(hand ? [hand] : []), ...data.history].map((h) => (
                      <div
                        key={h.id}
                        className="border-ink-100 border-b pb-3 text-sm"
                      >
                        <h3 className="font-semibold">Hand {h.number}</h3>
                        <HandResult hand={h} />
                        {h.rounds.map((r) => (
                          <p className="text-ink-500 mt-1" key={r.street}>
                            {POKER_STREETS[r.street]}: {r.rocks} Rock
                            {r.rocks !== 1 ? 's' : ''}, {formatMoney(r.raise)}{' '}
                            per Rock.{' '}
                            {r.moves
                              .map(
                                (m) =>
                                  `${
                                    h.players.find((p) => p.userId === m.userId)
                                      ?.name
                                  }: ${m.move}${
                                    m.downgraded ? ' (unfunded Rock)' : ''
                                  }${
                                    m.timedOut ? ' (timeout)' : ''
                                  }, paid ${formatMoney(m.paid)}`
                              )
                              .join('; ')}
                            .
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              </main>
              <aside className="space-y-4">
                <section className={clsx(styles.panel, styles.chat)}>
                  <div className={styles.chatHeading}>
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <ChatAlt2Icon className="text-ink-400 h-4 w-4" />
                      Table chat
                    </h2>
                    <span className="text-ink-500 text-[10px]">
                      Players & spectators
                    </span>
                  </div>
                  <div
                    className={clsx(styles.chatBody, 'space-y-2')}
                    aria-label="Chat messages"
                  >
                    {!data.messages.length && (
                      <div className="text-ink-500 flex h-full flex-col items-center justify-center gap-3 text-center">
                        <ChatAlt2Icon className="text-ink-300 h-8 w-8" />
                        <p className="text-sm">
                          A good game starts with hello.
                        </p>
                        <p className="text-xs">
                          Players and spectators can chat here.
                        </p>
                      </div>
                    )}
                    {data.messages.map((m) => (
                      <ChatMessageItem
                        key={m.id}
                        chats={[
                          {
                            id: String(m.id),
                            userId: m.userId,
                            channelId: data.table.id,
                            content: {
                              type: 'doc',
                              content: [
                                {
                                  type: 'paragraph',
                                  content: [{ type: 'text', text: m.text }],
                                },
                              ],
                            },
                            createdTime: m.createdTime,
                            visibility: 'private',
                          },
                        ]}
                        currentUser={user}
                        otherUser={{
                          id: m.userId,
                          name: m.name,
                          username: m.username,
                          avatarUrl: m.avatarUrl ?? '',
                        }}
                        beforeSameUser={false}
                        firstOfUser
                      />
                    ))}
                  </div>
                  <form
                    className={styles.chatForm}
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (await act({ type: 'chat', text: message.trim() }))
                        setMessage('')
                    }}
                  >
                    <Input
                      aria-label="Message"
                      value={message}
                      maxLength={2000}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        data.viewer.muted ? 'You are muted' : 'Say something…'
                      }
                      disabled={
                        !user ||
                        data.viewer.muted ||
                        data.viewer.banned ||
                        data.table.status === 'closed'
                      }
                    />
                    <Button
                      type="submit"
                      disabled={
                        !user ||
                        busy ||
                        !message.trim() ||
                        data.viewer.muted ||
                        data.viewer.banned ||
                        data.table.status === 'closed'
                      }
                    >
                      Send
                    </Button>
                  </form>
                </section>
                {host && (
                  <details className={clsx(styles.panel, 'p-4')}>
                    <summary className="cursor-pointer font-semibold">
                      Host controls
                    </summary>
                    <div className="mt-3 space-y-3">
                      <label className="block text-sm">
                        Person
                        <select
                          aria-label="Person to moderate"
                          value={hostTarget}
                          onChange={(e) => setHostTarget(e.target.value)}
                          className="bg-canvas-0 border-ink-200 mt-1 w-full rounded border p-2"
                        >
                          <option value="">Choose a person</option>
                          {people.map((p) => (
                            <option key={p.userId} value={p.userId}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <select
                        aria-label="Moderation action"
                        value={hostAction}
                        onChange={(e) => setHostAction(e.target.value)}
                        className="bg-canvas-0 border-ink-200 w-full rounded border p-2"
                      >
                        {['mute', 'unmute', 'ban', 'unban'].map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={busy || !hostTarget}
                        onClick={() =>
                          act({
                            type: hostAction.includes('mute') ? 'mute' : 'ban',
                            userId: hostTarget,
                            enabled: !hostAction.startsWith('un'),
                          })
                        }
                      >
                        Apply
                      </Button>
                      <p className="text-ink-500 text-xs">
                        Players finish their active hand before removal. Muting
                        stops chat immediately.
                      </p>
                      <Button
                        size="sm"
                        color="red-outline"
                        disabled={
                          busy || data.closing || data.table.status === 'closed'
                        }
                        onClick={() => act({ type: 'close' })}
                      >
                        Close after this hand
                      </Button>
                    </div>
                  </details>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </Page>
  )
}
