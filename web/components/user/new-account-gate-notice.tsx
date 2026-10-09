import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShieldCheckIcon } from '@heroicons/react/solid'

import { NEW_USER_COMMENT_GATE_MS, User } from 'common/user'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useIsClient } from 'web/hooks/use-is-client'
import { useStartIdentityVerification } from 'web/hooks/use-start-identity-verification'
import { track } from 'web/lib/service/analytics'

// Shown when a new account hits the new-account social gate (canPostSocially):
// commenting, posting and messaging unlock NEW_USER_COMMENT_GATE_MS after
// signup. Verifying, buying mana or subscribing unlocks them early — the one
// place outside the prize drawing page where verification is offered.
export function NewAccountGateNotice(props: {
  user: User
  // Capitalized gerund, e.g. 'Commenting' or 'Posting'.
  action: string
  className?: string
}) {
  const { user, action, className } = props
  const { start, loading, error } = useStartIdentityVerification(
    'new account gate: verify clicked'
  )
  const countdown = useCountdown(user.createdTime + NEW_USER_COMMENT_GATE_MS)

  return (
    <Col
      className={clsx(
        className,
        'border-primary-300 bg-primary-50 mb-2 w-full gap-2 rounded-lg border p-3'
      )}
    >
      <Row className="items-center gap-2">
        <ShieldCheckIcon className="text-primary-500 h-5 w-5 shrink-0" />
        <Col className="flex-1 text-sm">
          <span className="text-ink-700">
            {action} unlocks in{' '}
            <span className="font-semibold tabular-nums">{countdown}</span>.
          </span>
          <span className="text-ink-600">
            Unlock now:{' '}
            <button
              onClick={start}
              disabled={loading}
              className="text-primary-700 font-semibold hover:underline disabled:opacity-50"
            >
              verify your identity
            </button>
            ,{' '}
            <Link
              href="/add-funds"
              className="text-primary-700 font-semibold hover:underline"
              onClick={() => track('new account gate: buy mana clicked')}
            >
              buy any amount of mana
            </Link>
            , or{' '}
            <Link
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
              onClick={() => track('new account gate: subscribe clicked')}
            >
              subscribe
            </Link>
            .
          </span>
        </Col>
      </Row>
      {error && <div className="text-scarlet-500 mt-1 text-xs">{error}</div>}
    </Col>
  )
}

function useCountdown(targetMs: number): string {
  const isClient = useIsClient()
  const [now, setNow] = useState(targetMs)
  useEffect(() => {
    // Minutes are the finest unit shown until the last hour, so only tick
    // every second once seconds are on screen.
    let id: ReturnType<typeof setTimeout>
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const remaining = targetMs - t
      if (remaining > 0)
        id = setTimeout(tick, remaining > HOUR_MS ? MINUTE_MS : 1000)
    }
    tick()
    return () => clearTimeout(id)
  }, [targetMs])
  // Date.now() differs between the server render and the first client render,
  // so reading it during hydration trips a mismatch. Render a stable
  // placeholder until mounted, then swap in the live countdown.
  if (!isClient) return 'a moment'
  const remaining = Math.max(0, targetMs - now)
  if (remaining <= 0) return 'a moment'
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  const hours = Math.floor(
    (remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
  )
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))
  const secs = Math.floor((remaining % (60 * 1000)) / 1000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}
