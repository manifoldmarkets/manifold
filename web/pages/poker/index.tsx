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
import { PokerRules } from 'web/components/poker/poker-ui'
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
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <header>
          <div className="text-primary-600 mb-2 text-sm font-semibold">
            ROCK · PAPER · SCISSORS
          </div>
          <h1 className="text-3xl font-bold">Poker, together.</h1>
          <p className="text-ink-500 mt-2">
            Hold’em with simultaneous betting. Play with friends using mana.
          </p>
        </header>
        {error && (
          <p role="alert" className="text-red-600">
            {error}
          </p>
        )}
        {!enabled && (
          <p className="bg-canvas-50 rounded-lg p-3">
            New hands are temporarily paused. Games already in progress can
            finish.
          </p>
        )}
        {yourTable && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/poker/${yourTable}`}
                className="text-primary-600 font-semibold"
              >
                Return to your table →
              </Link>
              <Button
                color="gray-outline"
                size="sm"
                disabled={leaving || departureRequested}
                onClick={leaveSeat}
              >
                Leave seat
              </Button>
            </div>
            {departureRequested && (
              <p role="status" className="text-ink-500 text-sm">
                Departure requested. Any active hand will finish first.
              </p>
            )}
          </div>
        )}
        <section className="bg-canvas-0 border-ink-200 rounded-xl border p-5">
          <h2 className="mb-4 text-lg font-semibold">Create a table</h2>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Visibility
              <select
                className="bg-canvas-0 border-ink-300 rounded-md border p-2"
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as 'public' | 'private')
                }
              >
                <option value="public">Public — anyone can join</option>
                <option value="private">Private — share a link</option>
              </select>
            </label>
            <label htmlFor="poker-ante" className="flex flex-col gap-1 text-sm">
              Ante (mana)
              <Input
                id="poker-ante"
                className="w-28"
                type="number"
                min={1}
                step={1}
                value={ante}
                onChange={(e) => setAnte(e.target.value)}
              />
            </label>
            <Button disabled={!valid || busy || !enabled} onClick={create}>
              {busy ? 'Creating…' : user ? 'Create table' : 'Sign in to create'}
            </Button>
          </div>
          <p className="text-ink-500 mt-3 text-sm">
            {valid
              ? `${formatMoney(
                  amount * POKER_MINIMUM_MULTIPLIER
                )} required to start or resume.`
              : 'Enter a positive whole-mana ante.'}{' '}
            No buy-in. No fee.
            {visibility === 'private' &&
              ' You choose when the first hand starts.'}
          </p>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-semibold">Public tables</h2>
          {!tables ? (
            <p className="text-ink-500">Loading tables…</p>
          ) : tables.length === 0 ? (
            <div className="bg-canvas-0 border-ink-200 rounded-xl border border-dashed p-8 text-center">
              <p className="font-semibold">There’s a seat waiting to happen.</p>
              <p className="text-ink-500 mt-1">
                Create the first table and invite someone to play.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {tables.map((t) => (
                <Link
                  key={t.id}
                  href={`/poker/${t.id}`}
                  className="bg-canvas-0 border-ink-200 hover:border-primary-400 rounded-xl border p-4"
                >
                  <div className="flex justify-between gap-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    <span className="text-ink-500 text-sm">
                      {t.seats}/9 seats
                    </span>
                  </div>
                  <p className="text-ink-600 mt-2 text-sm">
                    {formatMoney(t.ante)} ante · {formatMoney(t.minimumBalance)}{' '}
                    to start
                  </p>
                  <p className="text-primary-600 mt-2 text-sm capitalize">
                    {t.status} · Join or watch →
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
        <PokerRules />
      </div>
    </Page>
  )
}
