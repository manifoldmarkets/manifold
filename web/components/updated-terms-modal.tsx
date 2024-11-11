import { useRouter } from 'next/router'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUser } from 'web/hooks/use-user'
import { Button } from './buttons/button'
import { LogoIcon } from './icons/logo-icon'
import { Col } from './layout/col'
import { Modal, MODAL_CLASS } from './layout/modal'

export function UpdatedTermsModal() {
  const user = useUser()
  const [agreedToTerms, setAgreedToTerms] = usePersistentLocalState(
    false,
    `agreedToSweepsTerms`
  )

  const router = useRouter()
  const actualPath = router.asPath
  const isExceptionPage = ['/terms', '/privacy', '/sweepstakes-rules'].some(
    (path) => actualPath.includes(path)
  )

  // Add a constant for the cutoff date, UPDATE WHEN FLIP TWOMBA_SWITCH
  const TERMS_UPDATE_DATE = new Date('2024-09-17') // Replace with actual update date

  // Check if the user was created after the terms update
  const isNewUser = user && new Date(user.createdTime) > TERMS_UPDATE_DATE

  if (agreedToTerms || !user || isExceptionPage || isNewUser) return null

  return (
    <Modal open={true} onClose={() => {}}>
      <Col className={MODAL_CLASS}>
        <LogoIcon
          className="h-24 w-24 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white "
          aria-hidden
        />
        <div className="text-2xl font-semibold">Sweepstakes are here!</div>
        <p className="text-ink-700">
          As part of our launch of sweepstakes, we have updated our{' '}
          <a
            href="https://docs.manifold.markets/terms-and-conditions"
            className="text-primary-700 font-semibold underline"
            target="_blank"
          >
            Terms & Conditions
          </a>
          ,{' '}
          <a
            href="https://docs.manifold.markets/privacy-policy"
            className="text-primary-700 font-semibold underline"
            target="_blank"
          >
            Privacy Policy
          </a>
          , and{' '}
          <a
            href="https://docs.manifold.markets/rules"
            className="text-primary-700 font-semibold underline"
            target="_blank"
          >
            Sweepstakes Rules
          </a>
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
