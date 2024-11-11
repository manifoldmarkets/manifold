import Link from 'next/link'
import { track } from 'web/lib/service/analytics'

export const Footer = ({ showAbout = false }: { showAbout?: boolean }) => (
  <div className="text-ink-400 mb-4 mt-8 w-full text-center text-sm">
    © Manifold Markets, Inc.
    <span className="mx-2">&bull;</span>
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
      Terms
    </a>
    {' + '}
    <a
      href="/mana-only-terms"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click Mana-only TOS')}
    >
      Mana-only Terms
    </a>
    <span className="mx-2">&bull;</span>
    <a
      href="/privacy"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click Privacy')}
    >
      Privacy
    </a>
    <span className="mx-2">&bull;</span>
    <a
      href="/sweepstakes-rules"
      target="_blank"
      className="hover:underline"
      onClick={() => track('Click Sweepstakes Rules')}
    >
      Rules
    </a>
  </div>
)
