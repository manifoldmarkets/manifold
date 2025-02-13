import { User } from 'common/user'
import { useRouter } from 'next/router'
import { Button } from '../buttons/button'
import { TokenNumber } from '../widgets/token-number'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export function RedeemSweepsButtons(props: {
  user: User
  redeemableCash: number
  className?: string
}) {
  const { className, redeemableCash } = props
  const router = useRouter()
  if (!redeemableCash || redeemableCash <= 0) return null

  const onClick = () => {
    router.push('/redeem')
  }

  return (
    <>
      <Button onClick={onClick} color={'amber'} className={className}>
        Redeem
        {redeemableCash > 0 ? (
          <TokenNumber
            amount={redeemableCash}
            className="ml-1"
            coinType="sweepies"
          />
        ) : (
          <SweepiesCoin className="ml-1" />
        )}
      </Button>
    </>
  )
}
