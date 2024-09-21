import { TWOMBA_ENABLED } from 'common/envs/constants'
import Link from 'next/link'
import { track } from 'web/lib/service/analytics'

export const Footer = ({ showAbout = false }: { showAbout?: boolean }) => (
  <div className="text-ink-400 mb-4 mt-8 w-full text-center text-sm">
    {showAbout && (
      <>
        <Link href="/about" className="hover:underline">
          About
        </Link>
        <span className="mx-2">&bull;</span>
      </>
    )}
    <a
      href="/terms"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click TOS')}
    >
      Terms & Conditions
    </a>
    <span className="mx-2">&bull;</span>
    <a
      href="/privacy"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click Privacy')}
    >
      Privacy Policy
    </a>
    {TWOMBA_ENABLED && (
      <>
        <span className="mx-2">&bull;</span>
        <a
          href="/sweepstakes-rules"
          target="_blank"
          className="hover:underline"
          onClick={() => track('Click Sweepstakes Rules')}
        >
          Sweepstakes Rules
        </a>
      </>
    )}
  </div>
)
