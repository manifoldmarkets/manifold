import Link from 'next/link'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { PokerTableSummary, POKER_MINIMUM_MULTIPLIER } from 'common/poker/types'
import { APIResponse } from 'common/api/schema'
import { formatMoney } from 'common/util/format'
import { Page } from 'web/components/layout/page'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { api } from 'web/lib/api/api'
import {
  GestureIcon,
  PokerRules,
  PokerStatus,
} from 'web/components/poker/poker-ui'
import {
  ArrowRightIcon,
  GlobeAltIcon,
  LockClosedIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import styles from 'web/components/poker/poker.module.css'
import { submitPokerAction } from 'web/components/poker/api'
import { savePokerToken } from 'web/components/poker/access-token'
import { PokerAuthGate } from 'web/components/poker/poker-auth-gate'

export default function PokerLobby() {
  return (
    <PokerAuthGate>
      <PokerLobbyContent />
    </PokerAuthGate>
  )
}

function PokerLobbyContent() {
  const user = useUser()
  const router = useRouter()
  const [tables, setTables] = useState<PokerTableSummary[]>()
  const [yourTable, setYourTable] = useState<string>()
  const [hostedTables, setHostedTables] = useState<
    APIResponse<'list-poker-tables'>['hostedTables']
  >([])
  const [enabled, setEnabled] = useState(true)
  const [ante, setAnte] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [departureRequested, setDepartureRequested] = useState(false)
  useEffect(() => {
    let live = true
    const load = () =>
      api('list-poker-tables', {})
        .then((r) => {
          if (live) {
            setTables(r.tables)
            setYourTable(r.yourTableId)
            setHostedTables(r.hostedTables ?? [])
            setEnabled(r.newHandsEnabled)
          }
        })
        .catch((e) => {
          if (live) setError(e.message)
        })
    void load()
    const timer = setInterval(load, 5000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [user?.id])
  useEffect(() => setDepartureRequested(false), [yourTable])
  const leaveSeat = async () => {
    if (!yourTable || leaving) return
    setLeaving(true)
    setError('')
    const request = {
      tableId: yourTable,
      requestId: crypto.randomUUID(),
      version: 0, // Departures do not require the latest table version.
      action: { type: 'leave' as const },
    }
    try {
      await submitPokerAction(request)
      setDepartureRequested(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave your seat')
    } finally {
      setLeaving(false)
    }
  }
  const amount = Number(ante)
  const valid =
    Number.isSafeInteger(amount) &&
    amount >= 1 &&
    amount <= Math.floor(Number.MAX_SAFE_INTEGER / POKER_MINIMUM_MULTIPLIER)
  const create = async () => {
    if (!user) {
      await firebaseLogin()
      return
    }
    if (!valid || busy) return
    setBusy(true)
    setError('')
    const requestId = crypto.randomUUID()
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, '0')
    ).join('')
    try {
      savePokerToken(requestId, token)
      const request = {
        requestId,
        ante: amount,
        visibility: 'private' as const,
        accessToken: token,
      }
      let result
      try {
        result = await api('create-poker-table', request)
      } catch (e) {
        if (e && typeof e === 'object' && 'code' in e && Number(e.code) < 500)
          throw e
        result = await api('create-poker-table', request)
      }
      await router.push(`/poker/${result.tableId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create table')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page trackPageView={false} className="!col-span-10">
      <Head>
        <title>RPS Poker | Manifold</title>
        <meta name="referrer" content="no-referrer" />
      </Head>
      <div className={clsx(styles.page, styles.lobby, 'space-y-7')}>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {!enabled && (
          <p className="bg-canvas-50 rounded-xl p-4 text-sm">
            New hands are temporarily paused. Games already in progress can
            finish.
          </p>
        )}
        {yourTable && (
          <div className="border-primary-200 bg-primary-50 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <Link
              href={`/poker/${yourTable}`}
              className="text-primary-600 flex items-center gap-2 text-sm font-semibold"
            >
              Your seat is waiting <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Button
              color="gray-outline"
              size="sm"
              disabled={leaving || departureRequested}
              onClick={leaveSeat}
            >
              Leave seat
            </Button>
            {departureRequested && (
              <p role="status" className="text-ink-500 w-full text-xs">
                Departure requested. Any active hand will finish first.
              </p>
            )}
          </div>
        )}
        <header className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>The Manifold card room</div>
            <h1 className={styles.heroTitle}>RPS Poker</h1>
            <p className={styles.heroCopy}>
              Rock Paper Scissors Poker combines Hold’em cards with simultaneous
              betting. Everyone chooses a gesture, then reveals together. Play
              with mana at a public table or invite your friends.
            </p>
            <a
              href="https://rps.poker"
              target="_blank"
              rel="noreferrer"
              className="text-primary-600 mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Learn the rules at rps.poker <span aria-hidden>↗</span>
            </a>
            <div className={styles.heroFacts}>
              <span>2–9 players</span>
              <span>No buy-in</span>
              <span>No rake</span>
            </div>
          </div>
          <div className={styles.heroGestures}>
            {(['rock', 'paper', 'scissors'] as const).map((move) => (
              <div key={move} className={styles.heroGesture}>
                <span>
                  <GestureIcon move={move} className="h-7 w-7" />
                </span>
                <span className="text-ink-500 text-xs capitalize">{move}</span>
              </div>
            ))}
          </div>
        </header>
        <section aria-labelledby="public-tables-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="public-tables-heading"
                className="text-xl font-semibold tracking-tight"
              >
                Public rooms
              </h2>
              <p className="text-ink-500 mt-1 text-sm">
                Take an open seat, or watch a hand unfold.
              </p>
            </div>
            <span className="text-ink-500 inline-flex items-center gap-1.5 text-xs">
              <GlobeAltIcon className="h-4 w-4" /> Open to everyone signed in
            </span>
          </div>
          <div className={styles.roomGrid}>
            {!tables ? (
              <p className="text-ink-500 p-8 text-center text-sm">
                Loading tables…
              </p>
            ) : !tables.length ? (
              <p className="text-ink-500 p-8 text-center text-sm">
                Public rooms are temporarily unavailable. Please check back
                shortly.
              </p>
            ) : (
              tables.map((t) => (
                <Link
                  key={t.id}
                  href={`/poker/${t.id}`}
                  className={styles.roomCard}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-ink-600 text-sm font-medium">
                      {t.name}
                    </h3>
                    <PokerStatus status={t.status} />
                  </div>
                  <div className={styles.roomAnte}>
                    {formatMoney(t.ante)}
                    <span>ante per hand</span>
                  </div>
                  <dl className={styles.roomInfo}>
                    <div>
                      <dt>Minimum balance</dt>
                      <dd>{formatMoney(t.minimumBalance)}</dd>
                    </div>
                    <div>
                      <dt>Players seated</dt>
                      <dd className="flex items-center gap-3">
                        {t.seats}{' '}
                        <span className="text-ink-400 font-normal">/ 9</span>
                        <span className="flex gap-1" aria-hidden>
                          {Array.from({ length: 9 }, (_, i) => (
                            <span
                              key={i}
                              className={clsx(
                                'h-2.5 w-1.5 rounded-sm',
                                i < t.seats ? 'bg-primary-500' : 'bg-ink-200'
                              )}
                            />
                          ))}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <div className={styles.roomAction}>
                    <span>{t.seats === 9 ? 'Watch table' : 'Enter room'}</span>
                    <ArrowRightIcon className="h-4 w-4" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
        {hostedTables.length > 0 && (
          <section aria-labelledby="hosted-tables-heading">
            <h2
              id="hosted-tables-heading"
              className="mb-3 text-lg font-semibold"
            >
              Your private rooms
            </h2>
            <div
              className={clsx(
                styles.panel,
                'divide-ink-200 divide-y overflow-hidden'
              )}
            >
              {hostedTables.map((table) => (
                <Link
                  key={table.id}
                  href={`/poker/${table.id}`}
                  className="hover:bg-canvas-50 flex items-center justify-between gap-4 p-4"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">
                      {table.name}
                    </h3>
                    <p className="text-ink-500 mt-1 text-xs">
                      {formatMoney(table.ante)} ante · You’re the host
                    </p>
                  </div>
                  <span className="text-primary-600 inline-flex shrink-0 items-center gap-2 text-sm font-medium">
                    Open room <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section
          className={clsx(styles.panel, styles.privateRoom)}
          aria-labelledby="create-table-heading"
        >
          <div className={styles.privateIntro}>
            <span className={styles.privateIcon}>
              <LockClosedIcon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2
                id="create-table-heading"
                className="text-lg font-semibold tracking-tight"
              >
                Play with friends
              </h2>
              <p className="text-ink-500 mt-1 max-w-sm text-sm">
                Create a private room, share the link, and start when you’re
                ready.
              </p>
            </div>
          </div>
          <form
            className={styles.privateForm}
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <div className="flex items-end gap-4">
              <label
                htmlFor="poker-ante"
                className="text-ink-600 flex flex-col gap-2 text-xs font-medium"
              >
                Ante per hand
                <Input
                  id="poker-ante"
                  className="!w-24 !rounded-lg"
                  type="number"
                  min={1}
                  step={1}
                  value={ante}
                  onChange={(e) => setAnte(e.target.value)}
                />
              </label>
              <div className="pb-2">
                <div className="text-ink-500 mb-1 text-xs">Minimum balance</div>
                <div className="text-sm font-semibold tabular-nums">
                  {valid ? formatMoney(amount * POKER_MINIMUM_MULTIPLIER) : '—'}
                </div>
              </div>
            </div>
            <Button
              type="submit"
              className="!rounded-lg !py-3"
              disabled={!valid || busy || !enabled}
            >
              {busy
                ? 'Creating…'
                : user
                ? 'Create private room'
                : 'Sign in to create'}
              <ArrowRightIcon className="ml-2 h-4 w-4" />
            </Button>
            {!valid && (
              <p className="col-span-full text-xs text-red-600">
                Enter a positive whole-mana ante.
              </p>
            )}
          </form>
        </section>
        <PokerRules />
      </div>
    </Page>
  )
}
