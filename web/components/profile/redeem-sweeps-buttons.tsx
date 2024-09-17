import { blockFromSweepstakes, User } from 'common/user'
import { useRouter } from 'next/router'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Button } from '../buttons/button'
import { CoinNumber } from '../widgets/coin-number'

export function RedeemSweepsButtons(props: { user: User; className?: string }) {
  const { user, className } = props
  const { data: redeemable } = useAPIGetter('get-redeemable-prize-cash', {})
  const redeemableCash = redeemable?.redeemablePrizeCash ?? 0
  const router = useRouter()

  const canRedeem = redeemableCash > 0 && !blockFromSweepstakes(user)

  const onClick = () => {
    router.push('/redeem')
  }

  return (
    <>
      <Button
        onClick={onClick}
        color={canRedeem ? 'amber' : 'gray'}
        className={className}
      >
        Redeem
        <CoinNumber
          amount={redeemableCash}
          className={'ml-1'}
          coinType={'sweepies'}
        />
      </Button>
    </>
  )
}
