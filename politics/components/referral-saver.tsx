import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { Suspense } from 'react'

export const ReferralSaver = () => {
  return (
    <Suspense fallback={<div />}>
      <InternalReferralSaver />
    </Suspense>
  )
}
const InternalReferralSaver = () => {
  const user = useUser()
  useSaveReferral(user)
  return <div />
}
