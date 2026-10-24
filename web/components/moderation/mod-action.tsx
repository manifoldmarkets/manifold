import { ShieldCheckIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Foldy from 'web/public/logo.svg'

// Mod actions (things you can only do because you're a mod or admin) are purple
// with a shield, matching the mod badge next to mods' names. This lets mods tell
// at a glance which controls they'd be using as a mod rather than as a user.
// Admin-only actions use the Manifold crane instead, like the staff badge.
export const MOD_ACTION_TEXT_CLASS = 'text-purple-700 dark:text-purple-400'

// Inherits the surrounding text color, so put it inside something purple.
export function ModActionBadge(props: { admin?: boolean; className?: string }) {
  const { admin, className } = props
  return (
    <span
      title={admin ? 'Admin action' : 'Mod action'}
      className={clsx('inline-flex shrink-0', className)}
    >
      <ModActionIcon admin={admin} className="h-4 w-4" />
      <span className="sr-only">
        {admin ? '(admin action)' : '(mod action)'}
      </span>
    </span>
  )
}

// Small "MOD" / "ADMIN" label for panels where you're acting on someone else's content
export function ModActionTag(props: { admin?: boolean; className?: string }) {
  const { admin, className } = props
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 rounded bg-purple-100 p-1 align-baseline text-xs uppercase text-purple-600 dark:bg-purple-900 dark:text-purple-300',
        className
      )}
    >
      <ModActionIcon admin={admin} className="h-3.5 w-3.5" />
      {admin ? 'Admin' : 'Mod'}
    </span>
  )
}

function ModActionIcon(props: { admin?: boolean; className: string }) {
  const { admin, className } = props
  return admin ? (
    <Foldy className={clsx('stroke-current stroke-1', className)} aria-hidden />
  ) : (
    <ShieldCheckIcon className={className} aria-hidden />
  )
}
