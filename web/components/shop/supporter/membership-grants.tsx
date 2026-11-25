import { useEffect } from 'react'
import { useEvent } from 'client-common/hooks/use-event'
import {
  MembershipGrantView,
  membershipGrantLockMessage,
} from 'common/membership-grants'
import { SUPPORTER_TIERS, TIER_ORDER } from 'common/supporter-config'
import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function useMembershipGrants(
  user: User | null | undefined,
  enabled = true
) {
  const { data, refresh } = useAPIGetter(
    'get-membership-grants',
    user ? { userId: user.id } : undefined,
    [],
    `membership-grants-${user?.id}`,
    enabled
  )
  const view = user && data?.userId === user.id ? data : undefined
  const refreshView = useEvent(refresh)
  useEffect(() => {
    if (user && enabled) refreshView()
  }, [user?.id, user?.entitlements, enabled, refreshView])

  // A scheduler broadcast may originate outside the API websocket process.
  useEffect(() => {
    if (!enabled || (!view?.isLocked && !view?.banked.length)) return
    const timer = setInterval(() => {
      if (!document.hidden) refreshView()
    }, 60_000)
    return () => clearInterval(timer)
  }, [enabled, view?.isLocked, view?.banked.length, refreshView])

  const owned = user?.entitlements?.find(
    (e) => e.metadata?.membershipGrantId != null
  )
  const tier = TIER_ORDER.find(
    (t) => SUPPORTER_TIERS[t].id === owned?.entitlementId
  )
  const active =
    view?.active ??
    (tier && owned?.expiresTime
      ? { tier, endsTime: owned.expiresTime }
      : undefined)
  const lockMessage =
    active && membershipGrantLockMessage(active.tier, active.endsTime)
  return { view, lockMessage, refresh: refreshView }
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
      {paid && (
        <p>
          Then your {SUPPORTER_TIERS[paid.tier].name} membership resumes with{' '}
          {paid.daysLeft} {paid.daysLeft === 1 ? 'day' : 'days'} left.{' '}
          {paid.autoRenew ? 'It renews automatically.' : "It doesn't renew."}
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
