import { User } from 'common/user'
import { useRouter } from 'next/router'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Button } from '../buttons/button'
import { TokenNumber } from '../widgets/token-number'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export function RedeemSweepsButtons(props: { user: User; className?: string }) {
  const { className } = props
  const { data: redeemable } = useAPIGetter('get-redeemable-prize-cash', {})
  const redeemableCash = redeemable?.redeemablePrizeCash ?? 0
  const router = useRouter()

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
