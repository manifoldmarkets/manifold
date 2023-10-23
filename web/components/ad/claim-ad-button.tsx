import { track } from 'web/lib/service/analytics'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { redeemBoost } from 'web/lib/firebase/api'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Button } from '../buttons/button'
import { getAdCanPayFunds } from 'web/lib/supabase/ads'

export function ClaimButton(props: {
  adId: string
  reward: number
  className?: string
  onClaim: () => Promise<any>
}) {
  const { adId, reward, className, onClaim } = props

  const [claimed, setClaimed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [canPay, setCanPay] = useState(true)

  useEffect(() => {
    getAdCanPayFunds(adId).then((canPay) => {
      setCanPay(canPay)
    })
  }, [adId])

  if (!canPay) {
    return null
  }
  return (
    <Button
      className={clsx(
        'disabled:bg-canvas-50 disabled:text-ink-800 h-min disabled:cursor-default disabled:bg-none',
        'ml-1',
        className
      )}
      size="xl" // don't make it smaller!!!
      color="gold"
      disabled={loading || claimed}
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        setLoading(true)
        try {
          await onClaim()
          await redeemBoost({ adId })
          toast.success(`Boost claimed! +${formatMoney(reward)}`)
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
      {claimed ? (
        'Claimed!'
      ) : loading ? (
        <LoadingIndicator size={'sm'} />
      ) : (
        `Claim ${formatMoney(reward)} boost`
      )}
    </Button>
  )
}
