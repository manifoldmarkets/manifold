import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { setCachedReferralInfoForUser } from 'web/lib/firebase/users'
import { getWelcomeState, registerWelcome } from 'web/lib/util/signed-out-bet'

const WelcomeDialog = dynamic(() => import('./welcome-dialog'), { ssr: false })
const implicitReferralPages = ['/', '/home', '/browse', '/feed']

export function Welcome({ hideSteps }: { hideSteps?: boolean }) {
  const user = useUser()
  const { pathname } = useRouter()
  const onContractPage = pathname === '/[username]/[contractSlug]'
  // The market page already captures links together with their contract ID.
  useSaveReferral(onContractPage ? undefined : user)
  const allowImplicit = implicitReferralPages.includes(pathname)

  // Report in on Page's first commit, before either bet modal can open.
  useEffect(() => {
    if (!hideSteps) return registerWelcome()
  }, [hideSteps])

  useEffect(() => {
    if (user && !user.shouldShowWelcome) {
      void setCachedReferralInfoForUser(user, { allowImplicit })
    }
  }, [user?.id, user?.shouldShowWelcome, allowImplicit])

  if (
    hideSteps ||
    !user?.shouldShowWelcome ||
    getWelcomeState(user.id).welcomeFinished
  )
    return null
  return (
    <WelcomeDialog
      key={user.id}
      user={user}
      pathname={pathname}
      onContractPage={onContractPage}
    />
  )
}
