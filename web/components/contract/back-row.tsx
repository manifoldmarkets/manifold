import { Row } from 'web/components/layout/row'
import { ArrowLeftIcon } from '@heroicons/react/solid'
import React, { useEffect } from 'react'
import { useRouter } from 'next/router'

export function BackRow() {
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
    <header className="border-ink-200 top-2 w-full border-b lg:hidden">
      <Row className="bg-canvas-0 items-center justify-between gap-2">
        <div className="flex flex-1">
          <button
            className="hover:bg-ink-200 text-primary-700 flex px-3 py-2 text-sm "
            onClick={router.back}
          >
            <ArrowLeftIcon className="mr-2 h-5 w-5" aria-hidden />
            Back
          </button>
        </div>
      </Row>
    </header>
  )
}
