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
    `agreedToTerms-${user?.id}`
  )

  const router = useRouter()

  const isExceptionPage = ['/terms', '/privacy', '/rules'].includes(
    router.pathname
  )

  if (agreedToTerms || !user || !TWOMBA_ENABLED || isExceptionPage) return null
  return (
    <Modal open={true} onClose={() => {}}>
      <Col className={MODAL_CLASS}>
        <LogoIcon
          className="h-24 w-24 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white dark:stroke-white"
          aria-hidden
        />
        <div className="text-2xl font-semibold">An Important Update</div>
        <p className="text-ink-700">
          To continue using Manifold Markets, we kindly ask all users to review
          our updated{' '}
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
            href="/rules"
            className="text-primary-700 font-semibold underline"
            target="_blank"
          >
            Rules
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
