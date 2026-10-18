import { ShieldCheckIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

// Mod actions (things you can only do because you're a mod or admin) are purple
// with a shield, matching the mod badge next to mods' names. This lets mods tell
// at a glance which controls they'd be using as a mod rather than as a user.
export const MOD_ACTION_TEXT_CLASS = 'text-purple-700 dark:text-purple-400'

// Inherits the surrounding text color, so put it inside something purple.
export function ModActionBadge(props: { className?: string }) {
  return (
    <span
      title="Mod action"
      className={clsx('inline-flex shrink-0', props.className)}
    >
      <ShieldCheckIcon className="h-4 w-4" aria-hidden />
      <span className="sr-only">(mod action)</span>
    </span>
  )
}

// Small "MOD" label for panels where a mod is acting on someone else's content
export function ModActionTag(props: { label?: string; className?: string }) {
  const { label = 'Mod', className } = props
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 rounded bg-purple-100 p-1 align-baseline text-xs uppercase text-purple-600 dark:bg-purple-900 dark:text-purple-300',
        className
      )}
    >
      <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  )
}
