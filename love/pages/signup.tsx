import { useState, useEffect } from 'react'
import { Col } from 'web/components/layout/col'
import {
  initialRequiredState,
  RequiredLoveUserForm,
} from 'love/components/required-lover-form'
import { OptionalLoveUserForm } from 'love/components/optional-lover-form'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { GoogleSignInButton } from 'web/components/buttons/sign-up-button'
import {
  CACHED_REFERRAL_USERNAME_KEY,
  firebaseLogin,
} from 'web/lib/firebase/users'
import { createLover } from 'web/lib/firebase/love/api'
import { useRouter } from 'next/router'
import { Row as rowFor } from 'common/supabase/utils'
import ManifoldLoveLogo from 'love/components/manifold-love-logo'
import { useTracking } from 'web/hooks/use-tracking'
import { track } from 'web/lib/service/analytics'
import { safeLocalStorage } from 'web/lib/util/local'
import { removeUndefinedProps } from 'common/util/object'
import { useLoverByUserId } from 'love/hooks/use-lover'
import { requestAllSignupBonuses } from 'love/lib/util/signup'

export default function SignupPage() {
  const [step, setStep] = useState(0)
  const user = useUser()
  const router = useRouter()
  useTracking('view love signup page')

  // Omit the id, created_time?
  const [loverForm, setLoverForm] = useState<rowFor<'lovers'>>({
    ...initialRequiredState,
  } as any)
  const setLoverState = (key: keyof rowFor<'lovers'>, value: any) => {
    setLoverForm((prevState) => ({ ...prevState, [key]: value }))
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  const existingLover = useLoverByUserId(user?.id)
  useEffect(() => {
    if (existingLover) {
      setLoverForm(existingLover)
      setStep(1)
    }
  }, [existingLover])

  return (
    <Col className="items-center">
      {user === undefined ? (
        <div />
      ) : user === null ? (
        <Col className={'items-center justify-around gap-4 pt-[20vh]'}>
          <ManifoldLoveLogo noLink />
          <GoogleSignInButton onClick={firebaseLogin} />
        </Col>
      ) : (
        <Col className={'bg-canvas-0 w-full max-w-2xl px-6 py-4'}>
          {step === 0 ? (
            <RequiredLoveUserForm
              user={user}
              setLover={setLoverState}
              lover={loverForm}
              isSubmitting={isSubmitting}
              onSubmit={async () => {
                if (!loverForm.looking_for_matches) {
                  router.push('/')
                  return
                }
                const referredByUsername = safeLocalStorage
                  ? safeLocalStorage.getItem(CACHED_REFERRAL_USERNAME_KEY) ??
                    undefined
                  : undefined

                setIsSubmitting(true)
                const res = await createLover(
                  removeUndefinedProps({
                    ...loverForm,
                    referred_by_username: referredByUsername,
                  })
                ).catch((e) => {
                  console.error(e)
                  return null
                })
                setIsSubmitting(false)
                if (res && res.lover) {
                  setLoverForm(res.lover)
                  setStep(1)
                  scrollTo(0, 0)
                  track('submit love required profile')

                  requestAllSignupBonuses()
                }
              }}
            />
          ) : step === 1 ? (
            <OptionalLoveUserForm
              setLover={setLoverState}
              lover={loverForm}
              user={user}
              fromSignup
            />
          ) : (
            <LoadingIndicator />
          )}
        </Col>
      )}
    </Col>
  )
}
export const colClassName = 'items-start gap-2'
export const labelClassName = 'font-semibold text-lg'
