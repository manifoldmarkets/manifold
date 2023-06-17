import { track } from '@amplitude/analytics-browser'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { redeemBoost } from 'web/lib/firebase/api'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Button } from '../buttons/button'

export function ClaimButton(props: {
  adId: string
  reward: number
  className?: string
}) {
  const { adId, reward, className } = props

  const [claimed, setClaimed] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <Button
      className={clsx(
        'disabled:bg-canvas-50 disabled:text-ink-800 h-min disabled:cursor-default disabled:bg-none',
        className
      )}
      size="xs" // don't make it smaller!!!
      color="gold"
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
    </Button>
  )
}
