import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { useLover } from 'web/hooks/use-lover'
import { RequiredLoveUserForm } from 'love/components/required-lover-form'
import { OptionalLoveUserForm } from 'love/components/optional-lover-form'

export default function SignupPage() {
  const [step, setStep] = useState(0)
  const lover = useLover()
  return (
    <Col className={'p-2'}>
      {step == 0 && !lover ? (
        <RequiredLoveUserForm onSuccess={() => setStep(1)} />
      ) : (
        <OptionalLoveUserForm />
      )}
    </Col>
  )
}
export const colClassName = 'items-start gap-2'
export const labelClassName = 'font-semibold text-lg'
