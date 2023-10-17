import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { useLover } from 'love/hooks/use-lover'
import { RequiredLoveUserForm } from 'love/components/required-lover-form'
import { OptionalLoveUserForm } from 'love/components/optional-lover-form'

export default function SignupPage() {
  const [step, setStep] = useState(0)
  const lover = useLover()
  return (
    <Col className="items-center">
      <Col className={'bg-canvas-0 w-full max-w-2xl px-6 py-4'}>
        {step == 0 && !lover ? (
          <RequiredLoveUserForm onSuccess={() => setStep(1)} />
        ) : (
          <OptionalLoveUserForm />
        )}
      </Col>
    </Col>
  )
}
export const colClassName = 'items-start gap-2'
export const labelClassName = 'font-semibold text-lg'
