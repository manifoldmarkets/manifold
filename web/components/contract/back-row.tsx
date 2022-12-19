import { Row } from 'web/components/layout/row'
import { ArrowLeftIcon } from '@heroicons/react/solid'
import React, { useEffect } from 'react'
import { Button } from 'web/components/buttons/button'
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
    <header className="top-2 w-full border-b border-gray-200 lg:hidden">
      <Row className="items-center justify-between gap-2 bg-white">
        <div className="flex flex-1">
          <Button color={'gray-white'} className={''} onClick={router.back}>
            <Row className={'items-center text-xs text-indigo-700'}>
              <ArrowLeftIcon className="mr-2 h-5 w-5" aria-hidden="true" />
              Back
            </Row>
          </Button>
        </div>
      </Row>
    </header>
  )
}
