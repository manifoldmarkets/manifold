import Link from 'next/link'
import { track } from 'web/lib/service/analytics'

export const PrivacyAndTerms = () => (
  <div className="text-ink-400 mt-8 mb-4 w-full text-center text-sm">
    <Link
      href="/terms"
      className="hover:underline"
      onClick={() => track('Click TOS')}
    >
      Terms of service
    </Link>
    <span className="mx-2">&bull;</span>
    <Link
      href="/privacy"
      className="hover:underline"
      onClick={() => track('Click Privacy')}
    >
      Privacy policy
    </Link>
  </div>
)
