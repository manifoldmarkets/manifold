import { Router } from 'next/router'
import { useEffect } from 'react'

export const useWarnUnsavedChanges = (hasUnsavedChanges: boolean) => {
  useEffect(() => {
    if (!hasUnsavedChanges) return

    const confirmationMessage = 'Changes you made may not be saved.'

    const warnUnsavedChanges = (e: BeforeUnloadEvent) => {
      const event = e || window.event
      event.returnValue = confirmationMessage
      return confirmationMessage
    }

    const beforeRouteHandler = () => {
      if (!confirm(confirmationMessage)) {
        Router.events.emit('routeChangeError')
        throw 'Abort route change. Please ignore this error.'
      }
    }

    window.addEventListener('beforeunload', warnUnsavedChanges)
    Router.events.on('routeChangeStart', beforeRouteHandler)

    return () => {
      window.removeEventListener('beforeunload', warnUnsavedChanges)
      Router.events.off('routeChangeStart', beforeRouteHandler)
    }
  }, [hasUnsavedChanges])
}
