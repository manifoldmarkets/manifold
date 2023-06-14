import { ArrowLeftIcon } from '@heroicons/react/solid'
import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import clsx from 'clsx'

// meant to be used over a cover image
export function BackButton() {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = React.useState(false)

  // Can't put this in a useMemo to avoid the page jump else we'll get hydration errors.
  useEffect(() => {
    setCanGoBack(typeof window !== 'undefined' && window.history.length > 1)
  }, [])

  // TODO: we could intercept non-home urls and redirect to home
  // useEffect(() => {
  //   router.beforePopState(({ as }) => {
  //     console.log('beforePopState', as)
  //     return true
  //   })
  //   return () => {
  //     router.beforePopState(() => true)
  //   }
  // }, [])

  if (!canGoBack) return <div />
  return (
    <button
      className={clsx('text-ink-500 hover:text-ink-600 flex transition-colors')}
      onClick={router.back}
    >
      <ArrowLeftIcon className="h-5 w-5" aria-hidden />
      <div className="sr-only">Back</div>
    </button>
  )
}
