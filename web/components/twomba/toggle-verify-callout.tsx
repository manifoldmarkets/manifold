import { XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { buttonClass } from '../buttons/button'
import { formatMoney } from 'common/util/format'
import { KYC_VERIFICATION_BONUS_CASH } from 'common/economy'

export function ToggleVerifyCallout(props: {
  className?: string
  caratClassName?: string
}) {
  const { className, caratClassName } = props
  const [dismissed, setDismissed] = usePersistentLocalState(
    false,
    'toggle-verify-callout-dismissed'
  )

  if (dismissed) return null

  return (
    <div className={className}>
      <div className="border-ink-300 bg-canvas-50 text-ink-800 relative rounded-lg border px-5 py-4 text-sm shadow-lg">
        <button
          onClick={() => setDismissed(true)}
          className="text-ink-300 hover:text-ink-600 absolute right-1 top-1"
        >
          <XIcon className="h-4 w-4" />
        </button>
        Why stop at play money? Verify your identity and start earning real cash
        prizes today.
        <div
          className={clsx(
            'absolute -top-[10px] right-4 h-0 w-0',
            caratClassName
          )}
        >
          <div className="border-b-ink-300 relative h-0 w-0 border-b-[10px] border-l-[10px] border-r-[10px] border-l-transparent border-r-transparent">
            <div className="border-b-canvas-50 absolute -left-[9px] top-[1px] h-0 w-0 border-b-[9px] border-l-[9px] border-r-[9px] border-l-transparent border-r-transparent"></div>
          </div>
        </div>
        <Link
          href={'gidx/register'}
          className={clsx(
            buttonClass('md', 'amber'),
            'mt-2 w-full font-semibold'
          )}
        >
          Verify and claim {formatMoney(KYC_VERIFICATION_BONUS_CASH, 'CASH')}
        </Link>
      </div>
    </div>
  )
}
