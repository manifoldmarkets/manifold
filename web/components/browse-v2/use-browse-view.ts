import {
  BROWSE_CHOICE_KEY,
  BROWSE_ENROLLMENT_KEY,
  BROWSE_EXPOSURE_EVENT,
  BROWSE_TOGGLE_EVENT,
  BrowseEnrollment,
  BrowseView,
  enrollBrowseVisitor,
  getBrowseView,
  isExistingBrowseUser,
  readBrowseEnrollment,
  readBrowseView,
} from 'common/browse-rollout'
import { useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { AuthContext } from 'web/components/auth-context'
import {
  getPersistentLocalState,
  setPersistentLocalState,
} from 'web/hooks/use-persistent-local-state'
import { auth } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { getDeviceHistory } from 'web/lib/util/device-token'

export type { BrowseView } from 'common/browse-rollout'
export type BrowseViewState = ReturnType<typeof useBrowseView>

type Visit = {
  account: string
  enrollment: BrowseEnrollment
  preference?: BrowseView
  existingUser: boolean
}

const IS_LOCAL_ONLY = process.env.NEXT_PUBLIC_LOCAL_ONLY === 'true'

export function useBrowseView() {
  const context = useContext(AuthContext)
  const user = context
    ? {
        ...context.user,
        initialDeviceToken: context.privateUser.initialDeviceToken,
      }
    : undefined
  const ready = context === null || context?.authLoaded === true
  const account = user?.id ?? 'anonymous'
  const router = useRouter()
  const [visit, setVisit] = useState<Visit>()
  const lastExposure = useRef('')
  const identityIsCurrent = () =>
    IS_LOCAL_ONLY || (auth.currentUser?.uid ?? 'anonymous') === account

  useEffect(() => {
    if (!ready || !identityIsCurrent()) return
    const history = getDeviceHistory()
    const preference = readBrowseView(
      getPersistentLocalState(BROWSE_CHOICE_KEY)
    )
    const enrollment =
      readBrowseEnrollment(
        getPersistentLocalState(BROWSE_ENROLLMENT_KEY),
        history?.deviceId ?? ''
      ) ??
      enrollBrowseVisitor({
        history,
        user,
        priorChoice: preference,
        now: Date.now(),
      })
    if (history) setPersistentLocalState(BROWSE_ENROLLMENT_KEY, enrollment)
    setVisit({
      account,
      enrollment,
      preference,
      existingUser: isExistingBrowseUser(history, user),
    })
  }, [ready, account])

  const current = ready && visit?.account === account ? visit : undefined
  const view = current ? getBrowseView(current) : 'legacy'
  const properties = () => ({
    ...current!.enrollment,
    assignmentUnit: 'device',
    defaultView: getBrowseView({ ...current!, preference: undefined }),
    view,
    choiceSource: current!.preference ? 'preference' : 'default',
    existingUser: current!.existingUser,
    path: router.pathname,
    mobile: window.innerWidth < 640,
    // Preview and localhost events must never enter the production scorecard.
    environment:
      window.location.hostname === 'manifold.markets'
        ? 'production'
        : ['localhost', '127.0.0.1'].includes(window.location.hostname)
        ? 'local'
        : 'preview',
  })

  useEffect(() => {
    if (!current || !identityIsCurrent()) return
    const key = `${account}:${router.pathname}:${view}`
    if (lastExposure.current === key) return
    lastExposure.current = key
    track(BROWSE_EXPOSURE_EVENT, properties())
  }, [current, account, router.pathname, view])

  const choose = (next: BrowseView) => {
    if (!current || next === view || !identityIsCurrent()) return
    track(BROWSE_TOGGLE_EVENT, { ...properties(), fromView: view, view: next })
    setPersistentLocalState(BROWSE_CHOICE_KEY, next)
    setVisit({ ...current, preference: next })
    window.scrollTo(0, 0)
    document.querySelector('.page-scroll-container')?.scrollTo(0, 0)
  }

  return {
    view,
    setView: choose,
    ready: !!current,
    cohort: current?.enrollment.cohort,
    variant: current?.enrollment.variant,
    choiceSource: current?.preference ? 'preference' : 'default',
  }
}
