import { ArrowLeftIcon } from '@heroicons/react/solid'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { Button, buttonClass, SizeType } from 'web/components/buttons/button'

export function BackButton(props: {
  className?: string
  size?: SizeType
  // Landing pages: when there is no Manifold page to go back to (a visitor
  // arrived from a tweet or a search result), render a link to Home instead of
  // calling history.back(), which would take them off-site or to about:blank.
  homeFallback?: boolean
}) {
  const { className, size, homeFallback } = props
  const router = useRouter()
  const [mode, setMode] = useState<'back' | 'home' | 'hidden'>('hidden')

  // Can't put this in a useMemo to avoid the page jump else we'll get hydration errors.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (homeFallback) {
      setMode(hasInSiteHistory() ? 'back' : 'home')
    } else {
      setMode(window.history.length > 1 ? 'back' : 'hidden')
    }
  }, [homeFallback])

  if (mode === 'hidden') return null

  if (mode === 'home') {
    return (
      <Link
        // "/" sends signed-in users on to /home and shows everyone else the
        // landing page.
        href="/"
        className={clsx(
          buttonClass(size ?? 'md', 'gray-white'),
          'rounded',
          className
        )}
      >
        <ArrowLeftIcon className="h-5 w-5" aria-hidden />
        <div className="sr-only">Home</div>
      </Link>
    )
  }

  return (
    <Button
      className={clsx('rounded', className)}
      onClick={router.back}
      color={'gray-white'}
      size={size}
    >
      <ArrowLeftIcon className="h-5 w-5" aria-hidden />
      <div className="sr-only">Back</div>
    </Button>
  )
}

// Whether the previous history entry is a Manifold page. history.length can't
// tell: a tab opened from a tweet has a length of 2 with an off-site entry
// behind it. The Navigation API lists only same-origin entries, so a current
// index above 0 means there is one of ours to return to. Where it is missing,
// fall back to a same-origin referrer (a full-page navigation from Manifold).
function hasInSiteHistory(): boolean {
  const navigation = (
    window as unknown as {
      navigation?: { currentEntry?: { index?: number } | null }
    }
  ).navigation
  const index = navigation?.currentEntry?.index
  if (typeof index === 'number' && index >= 0) return index > 0
  try {
    return (
      !!document.referrer &&
      new URL(document.referrer).origin === window.location.origin
    )
  } catch {
    return false
  }
}
