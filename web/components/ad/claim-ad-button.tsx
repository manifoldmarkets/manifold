import { track } from '@amplitude/analytics-browser'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { redeemBoost } from 'web/lib/firebase/api'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function ClaimButton(props: {
  adId: string
  reward: number
  className?: string
}) {
  const { adId, reward, className } = props

  const [claimed, setClaimed] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <button
      className={clsx(
        'h-min rounded-md bg-yellow-300 bg-gradient-to-br from-yellow-400 via-yellow-200 to-yellow-300 py-0.5 px-2 font-semibold text-gray-900 transition-colors',
        'hover:via-yellow-100 focus:via-yellow-100',
        'disabled:bg-canvas-50 disabled:text-ink-800 disabled:cursor-default disabled:bg-none',
        className,
        'text-sm'
      )}
      disabled={loading || claimed}
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        setLoading(true)
        try {
          await redeemBoost({ adId })
          toast.success(`+${formatMoney(reward)}`)
          setClaimed(true)
          track('claim boost', { adId })
        } catch (err) {
          toast.error(
            (err as any).message ??
              (typeof err === 'string' ? err : 'Error claiming boost')
          )
        } finally {
          setLoading(false)
        }
      }}
    >
      <span className={'whitespace-nowrap'}>
        {claimed ? (
          'Claimed!'
        ) : loading ? (
          <LoadingIndicator size={'sm'} />
        ) : (
          `Claim ${formatMoney(reward)} Boost`
        )}
      </span>
    </button>
  )
}
