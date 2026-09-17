import Link from 'next/link'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { PokerTableSummary, POKER_MINIMUM_MULTIPLIER } from 'common/poker/types'
import { formatMoney } from 'common/util/format'
import { Page } from 'web/components/layout/page'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { api } from 'web/lib/api/api'
import {
  PokerCard,
  PokerRules,
  PokerStatus,
} from 'web/components/poker/poker-ui'
import {
  ArrowRightIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PlusIcon,
  UsersIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import styles from 'web/components/poker/poker.module.css'
import { submitPokerAction } from 'web/components/poker/api'
import { savePokerToken } from 'web/components/poker/access-token'

export default function PokerLobby() {
  const user = useUser()
  const router = useRouter()
  const [tables, setTables] = useState<PokerTableSummary[]>()
  const [yourTable, setYourTable] = useState<string>()
  const [enabled, setEnabled] = useState(true)
  const [ante, setAnte] = useState('1')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
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
    const token =
      visibility === 'private'
        ? Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
            n.toString(16).padStart(2, '0')
          ).join('')
        : undefined
    try {
      if (token) savePokerToken(requestId, token)
      const request = {
        requestId,
        ante: amount,
        visibility,
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
      <div className={clsx(styles.page, 'space-y-7')}>
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
        <div className={styles.lobbyTop}>
          <header className={styles.hero}>
            <div className={styles.eyebrow}>The Manifold card room</div>
            <h1 className={styles.heroTitle}>RPS Poker</h1>
            <p className={styles.heroCopy}>
              Hold’em, with a simultaneous twist. Read the table, choose your
              move, and play with mana.
            </p>
            <div className={styles.heroFacts}>
              <span>2–9 players</span>
              <span>No buy-in</span>
              <span>No rake</span>
            </div>
            <div className={styles.cardFan} aria-hidden>
              <PokerCard card={12} />
              <PokerCard card={38} />
              <PokerCard card={51} />
            </div>
          </header>
          <section
            className={clsx(styles.panel, styles.create)}
            aria-labelledby="create-table-heading"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2
                id="create-table-heading"
                className="text-lg font-semibold tracking-tight"
              >
                Start a table
              </h2>
              <PlusIcon className="text-ink-400 h-5 w-5" aria-hidden />
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void create()
              }}
            >
              <div>
                <div
                  id="visibility-label"
                  className="text-ink-600 mb-2 text-xs font-medium"
                >
                  Who can join?
                </div>
                <div
                  className={styles.visibility}
                  role="group"
                  aria-labelledby="visibility-label"
                >
                  <button
                    type="button"
                    aria-pressed={visibility === 'public'}
                    onClick={() => setVisibility('public')}
                  >
                    <GlobeAltIcon className="h-4 w-4" />
                    Public
                  </button>
                  <button
                    type="button"
                    aria-pressed={visibility === 'private'}
                    onClick={() => setVisibility('private')}
                  >
                    <LockClosedIcon className="h-4 w-4" />
                    Private
                  </button>
                </div>
                <p className="text-ink-500 mt-2 text-xs">
                  {visibility === 'public'
                    ? 'Anyone can find your table and join.'
                    : 'Invite friends with a link. You start the first hand.'}
                </p>
              </div>
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
                  <div className="text-ink-500 mb-1 text-xs">
                    Minimum balance
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
                    {valid
                      ? formatMoney(amount * POKER_MINIMUM_MULTIPLIER)
                      : '—'}
                  </div>
                </div>
              </div>
              {!valid && (
                <p className="text-xs text-red-600">
                  Enter a positive whole-mana ante.
                </p>
              )}
              <Button
                type="submit"
                className="!w-full !rounded-lg !py-2.5"
                disabled={!valid || busy || !enabled}
              >
                {busy
                  ? 'Creating…'
                  : user
                  ? 'Create table'
                  : 'Sign in to create'}
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </section>
        </div>
        <section aria-labelledby="public-tables-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2
                id="public-tables-heading"
                className="text-xl font-semibold tracking-tight"
              >
                Find your table
              </h2>
              <p className="text-ink-500 mt-1 text-sm">
                Take an open seat, or watch a hand unfold.
              </p>
            </div>
            <span className="text-ink-500 flex items-center gap-1.5 text-xs">
              <GlobeAltIcon className="h-4 w-4" />
              {tables
                ? `${tables.length} public ${
                    tables.length === 1 ? 'table' : 'tables'
                  }`
                : 'Public tables'}
            </span>
          </div>
          <div className={clsx(styles.panel, 'overflow-hidden')}>
            {!tables ? (
              <p className="text-ink-500 p-8 text-center text-sm">
                Loading tables…
              </p>
            ) : !tables.length ? (
              <div className="flex flex-col items-center px-5 py-10 text-center">
                <div className={styles.guideIcon}>
                  <UsersIcon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">Be first at the table</h3>
                <p className="text-ink-500 mt-1 max-w-xs text-sm">
                  Start a public table above and make room for a few new faces.
                </p>
              </div>
            ) : (
              tables.map((t) => (
                <Link
                  key={t.id}
                  href={`/poker/${t.id}`}
                  className={styles.tableRow}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{t.name}</h3>
                      <PokerStatus status={t.status} />
                    </div>
                    <dl className={styles.rowInfo}>
                      <div>
                        <dt>Ante</dt>
                        <dd>{formatMoney(t.ante)}</dd>
                      </div>
                      <div>
                        <dt>Minimum balance</dt>
                        <dd>{formatMoney(t.minimumBalance)}</dd>
                      </div>
                      <div>
                        <dt>Players</dt>
                        <dd className="flex items-center gap-2">
                          {t.seats} / 9{' '}
                          <span className="hidden gap-0.5 sm:flex" aria-hidden>
                            {Array.from({ length: 9 }, (_, i) => (
                              <span
                                key={i}
                                className={clsx(
                                  'h-2 w-1 rounded-sm',
                                  i < t.seats ? 'bg-primary-400' : 'bg-ink-200'
                                )}
                              />
                            ))}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <span className="text-primary-600 flex items-center gap-2 text-sm font-semibold">
                    <span className="hidden sm:inline">View table</span>
                    <ArrowRightIcon className="h-5 w-5" />
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
        <PokerRules />
      </div>
    </Page>
  )
}
