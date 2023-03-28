import { ArrowLeftIcon } from '@heroicons/react/solid'
import React, { useEffect } from 'react'
import { useRouter } from 'next/router'

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
      className="rounded-full bg-black/60 p-2 transition-colors hover:bg-black/80"
      onClick={router.back}
    >
      <ArrowLeftIcon className="h-4 w-4 text-white" aria-hidden />
      <div className="sr-only">Back</div>
    </button>
  )
}
