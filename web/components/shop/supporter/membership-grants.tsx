import { useEffect } from 'react'
import { useEvent } from 'client-common/hooks/use-event'
import {
  MembershipGrantView,
  membershipGrantLockMessage,
  nextMembershipMessage,
} from 'common/membership-grants'
import { SUPPORTER_TIERS, TIER_ORDER } from 'common/supporter-config'
import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { getUserSafe } from 'web/lib/supabase/users'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function useMembershipGrants(user: User | null | undefined) {
  const { data, refresh } = useAPIGetter(
    'get-membership-grants',
    user ? { userId: user.id } : undefined,
    [],
    `membership-grants-${user?.id}`
  )
  const view = user && data?.userId === user.id ? data : undefined
  const refreshView = useEvent(refresh)
  useEffect(() => {
    if (user) refreshView()
  }, [user?.id, user?.entitlements, refreshView])

  const owned = user?.entitlements?.find(
    (e) => e.metadata?.membershipGrantId != null
  )
  const tier = TIER_ORDER.find(
    (t) => SUPPORTER_TIERS[t].id === owned?.entitlementId
  )
  const cached =
    tier && owned?.expiresTime !== undefined
      ? { tier, endsTime: owned.expiresTime }
      : null
  const active = view ? view.active : cached
  const mismatch =
    !!view &&
    (view.active?.id !== owned?.metadata?.membershipGrantId ||
      view.active?.tier !== cached?.tier ||
      view.active?.endsTime !== cached?.endsTime)
  const userId = user?.id
  const refreshEntitlements = useEvent(() => {
    if (userId && mismatch) getUserSafe(userId).catch(console.error)
  })
  useEffect(() => {
    if (mismatch) refreshEntitlements()
  }, [userId, mismatch, refreshEntitlements])

  // Keep checking even past the advertised end until the scheduler releases the row.
  const poll = !!active || !!view?.banked.length || mismatch
  useEffect(() => {
    if (!poll) return
    const timer = setInterval(() => {
      if (!document.hidden) {
        refreshView()
        refreshEntitlements()
      }
    }, 60_000)
    return () => clearInterval(timer)
  }, [poll, refreshView, refreshEntitlements])

  const lockMessage = active
    ? membershipGrantLockMessage(active.tier, active.endsTime)
    : undefined
  return { view, active, lockMessage, refresh: refreshView }
}

export function MembershipGrantsPanel({
  view,
  cancelling,
  turnOffRenewal,
}: {
  view?: MembershipGrantView
  cancelling: boolean
  turnOffRenewal: () => void
}) {
  if (!view || (!view.active && !view.banked.length)) return null
  const { active, paid } = view
  return (
    <section className="border-ink-200 bg-canvas-0 text-ink-700 space-y-2 rounded-xl border p-4 text-sm">
      {active && (
        <p>
          <strong>
            You're using free {SUPPORTER_TIERS[active.tier].name} days until{' '}
            {new Date(active.endsTime).toLocaleDateString()}.
          </strong>{' '}
          From {active.source}.
        </p>
      )}
      {view.next && <p>{nextMembershipMessage(view.next)}</p>}
      {paid && (
        <p>
          Paid {SUPPORTER_TIERS[paid.tier].name} is paused with{' '}
          {paid.daysLeft > 0
            ? `${paid.daysLeft} ${paid.daysLeft === 1 ? 'day' : 'days'} left`
            : paid.autoRenew
            ? 'renewal due'
            : 'no paid time left'}
          . {paid.autoRenew ? 'It renews automatically.' : "It doesn't renew."}
        </p>
      )}
      {paid?.autoRenew && (
        <Button
          size="sm"
          color="gray-outline"
          loading={cancelling}
          disabled={cancelling}
          onClick={turnOffRenewal}
        >
          Turn off renewal
        </Button>
      )}
      {view.banked.length > 0 && (
        <>
          <h3 className="font-semibold">Banked free days</h3>
          <ul className="space-y-1">
            {view.banked.map((g) => (
              <li key={g.id}>
                {g.days.toLocaleString(undefined, { maximumFractionDigits: 3 })}{' '}
                {g.days === 1 ? 'day' : 'days'} of{' '}
                {SUPPORTER_TIERS[g.tier].name}. {g.reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
