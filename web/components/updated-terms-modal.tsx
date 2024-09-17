import { TWOMBA_ENABLED } from 'common/envs/constants'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { Modal, MODAL_CLASS } from './layout/modal'
import { Col } from './layout/col'
import { LogoIcon } from './icons/logo-icon'
import Link from 'next/link'
import { Button } from './buttons/button'
import { useUser } from 'web/hooks/use-user'
import { useRouter } from 'next/router'

export function UpdatedTermsModal() {
  const user = useUser()
  const [agreedToTerms, setAgreedToTerms] = usePersistentLocalState(
    false,
    `agreedToSweepsTerms`
  )

  const router = useRouter()
  const actualPath = router.asPath
  const isExceptionPage = ['/terms', '/privacy', '/rules'].some((path) =>
    actualPath.includes(path)
  )
  // Add a constant for the cutoff date, UPDATE WHEN FLIP TWOMBA_SWITCH
  const TERMS_UPDATE_DATE = new Date('2024-09-17') // Replace with actual update date

  // Check if the user was created after the terms update
  const isNewUser = user && new Date(user.createdTime) > TERMS_UPDATE_DATE

  if (agreedToTerms || !user || !TWOMBA_ENABLED || isExceptionPage || isNewUser)
    return null

  return (
    <Modal open={true} onClose={() => {}}>
      <Col className={MODAL_CLASS}>
        <LogoIcon
          className="h-24 w-24 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white dark:stroke-white"
          aria-hidden
        />
        <div className="text-2xl font-semibold">Sweepstakes are here!</div>
        <p className="text-ink-700">
          As part of our launch of sweepstakes, we've updated our{' '}
          <Link
            href="/terms"
            className="text-primary-700 font-semibold underline"
            target="_blank"
          >
            Terms & Conditions
          </Link>
          ,{' '}
          <Link
            className="text-primary-700 font-semibold underline"
            href="/privacy"
            target="_blank"
          >
            Privacy Policy
          </Link>
          , and{' '}
          <Link
            href="/sweepstakes-rules"
            className="text-primary-700 font-semibold underline"
            target="_blank"
          >
            Sweepstakes Rules
          </Link>
          .
        </p>
        <p className="text-ink-700">
          Please take a moment to read through the changes before proceeding.
          Your continued use of the site indicates your acceptance of these
          updates. Thank you for being part of our community!
        </p>
        <Button onClick={() => setAgreedToTerms(true)}>Agree</Button>
      </Col>
    </Modal>
  )
}
